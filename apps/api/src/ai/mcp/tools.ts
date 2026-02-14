import { websitesApi } from "@databuddy/auth";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getAccessibleWebsites } from "../../lib/accessible-websites";
import {
	getAccessibleWebsiteIds,
	hasGlobalAccess,
	hasKeyScope,
	hasWebsiteScope,
} from "../../lib/api-key";
import { trackAgentEvent } from "../../lib/databuddy";
import { getWebsiteDomain, validateWebsite } from "../../lib/website-utils";
import { executeBatch } from "../../query";
import {
	appendToConversation,
	getConversationHistory,
} from "./conversation-store";
import {
	buildBatchQueryRequests,
	CLICKHOUSE_SCHEMA_DOCS,
	getQueryTypeDescriptions,
	getSchemaSummary,
	MCP_DATE_PRESETS,
	type McpQueryItem,
} from "./mcp-utils";
import { runMcpAgent } from "./run-agent";

interface McpToolContext {
	requestHeaders: Headers;
	userId: string | null;
	apiKey: Awaited<
		ReturnType<typeof import("../../lib/api-key").getApiKeyFromHeader>
	>;
}

async function ensureWebsiteAccess(
	websiteId: string,
	headers: Headers,
	apiKey: McpToolContext["apiKey"]
): Promise<{ domain: string } | Error> {
	const validation = await validateWebsite(websiteId);
	if (!(validation.success && validation.website)) {
		return new Error(validation.error ?? "Website not found");
	}
	const { website } = validation;

	if (website.isPublic) {
		return { domain: website.domain ?? "unknown" };
	}

	if (apiKey) {
		if (!hasKeyScope(apiKey, "read:data")) {
			return new Error("API key missing read:data scope");
		}
		const accessibleIds = getAccessibleWebsiteIds(apiKey);
		const hasWebsiteAccess =
			hasWebsiteScope(apiKey, websiteId, "read:data") ||
			accessibleIds.includes(websiteId) ||
			(hasGlobalAccess(apiKey) &&
				apiKey.organizationId === website.organizationId);
		if (!hasWebsiteAccess) {
			return new Error("Access denied to this website");
		}
		return { domain: website.domain ?? "unknown" };
	}

	const hasPermission =
		website.organizationId &&
		(
			await websitesApi.hasPermission({
				headers,
				body: { permissions: { website: ["read"] } },
			})
		).success;
	if (!hasPermission) {
		return new Error("Access denied to this website");
	}
	return { domain: website.domain ?? "unknown" };
}

const TIME_UNIT = ["minute", "hour", "day", "week", "month"] as const;
type TimeUnit = (typeof TIME_UNIT)[number];

const FilterSchema = z.object({
	field: z.string(),
	op: z.enum([
		"eq",
		"ne",
		"contains",
		"not_contains",
		"starts_with",
		"in",
		"not_in",
	]),
	value: z.union([
		z.string(),
		z.number(),
		z.array(z.union([z.string(), z.number()])),
	]),
	target: z.string().optional(),
	having: z.boolean().optional(),
});

const QueryItemSchema = z.object({
	type: z.string(),
	preset: z.enum(MCP_DATE_PRESETS as [string, ...string[]]).optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	timeUnit: z.enum(TIME_UNIT).optional(),
	limit: z.number().min(1).max(1000).optional(),
	filters: z.array(FilterSchema).optional(),
	groupBy: z.array(z.string()).optional(),
	orderBy: z.string().optional(),
});

function coerceQueriesArray(val: unknown): unknown[] | undefined {
	if (Array.isArray(val)) {
		return val;
	}
	if (typeof val === "string") {
		try {
			const parsed = JSON.parse(val) as unknown;
			return Array.isArray(parsed) ? parsed : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

interface GetDataArgs {
	websiteId: string;
	type?: string;
	preset?: (typeof MCP_DATE_PRESETS)[number];
	from?: string;
	to?: string;
	timeUnit?: TimeUnit;
	limit?: number;
	timezone?: string;
	filters?: Array<{
		field: string;
		op: string;
		value: string | number | (string | number)[];
		target?: string;
		having?: boolean;
	}>;
	groupBy?: string[];
	orderBy?: string;
	queries?: McpQueryItem[];
}

function toMcpResult(data: unknown, isError = false): CallToolResult {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(data, null, 2),
			},
		],
		isError,
	};
}

function trackToolCompletion(
	tool: string,
	startTime: number,
	success: boolean,
	extra?: Record<string, unknown>
): void {
	trackAgentEvent("agent_tool_completed", {
		source: "mcp",
		tool,
		duration_ms: Date.now() - startTime,
		success,
		...extra,
	});
}

export function createMcpTools(ctx: McpToolContext) {
	return {
		ask: {
			description:
				"Ask any analytics question in natural language. The agent will discover your websites, run queries, and return insights. Pass conversationId for follow-up questions (e.g. 'now compare with last week') to maintain context. Use this for questions like 'what are my top pages?', 'show me traffic last week', 'how many visitors did we have?', etc.",
			inputSchema: z.object({
				question: z
					.string()
					.describe("Your analytics question in natural language"),
				conversationId: z
					.string()
					.optional()
					.describe(
						"Optional. Pass from previous ask response for follow-up questions to maintain conversation history."
					),
			}),
			handler: async (args: { question: string; conversationId?: string }) => {
				const startTime = Date.now();
				try {
					const conversationId = args.conversationId ?? crypto.randomUUID();
					const hasFollowup = Boolean(args.conversationId);
					const priorMessages = await getConversationHistory(
						conversationId,
						ctx.userId,
						ctx.apiKey
					);

					const answer = await runMcpAgent({
						question: args.question,
						requestHeaders: ctx.requestHeaders,
						apiKey: ctx.apiKey,
						userId: ctx.userId,
						priorMessages: priorMessages.length > 0 ? priorMessages : undefined,
					});

					await appendToConversation(
						conversationId,
						ctx.userId,
						ctx.apiKey,
						args.question,
						answer
					);

					trackToolCompletion("ask", startTime, true, {
						has_followup: hasFollowup,
						prior_messages: priorMessages.length,
					});
					return toMcpResult({ answer, conversationId });
				} catch {
					trackToolCompletion("ask", startTime, false);
					return toMcpResult({ error: "Agent failed" }, true);
				}
			},
		},
		list_websites: {
			description:
				"List websites accessible with your API key. Use to discover website IDs before get_data. Fast, no LLM.",
			inputSchema: z.object({}),
			handler: async () => {
				const startTime = Date.now();
				try {
					const authCtx = {
						user: ctx.userId ? { id: ctx.userId } : null,
						apiKey: ctx.apiKey,
					};
					const list = await getAccessibleWebsites(authCtx);
					trackToolCompletion("list_websites", startTime, true, {
						website_count: list.length,
					});
					return toMcpResult({
						websites: list.map((w) => ({
							id: w.id,
							name: w.name,
							domain: w.domain,
							isPublic: w.isPublic,
						})),
						total: list.length,
					});
				} catch (err) {
					trackToolCompletion("list_websites", startTime, false);
					throw err;
				}
			},
		},
		get_data: {
			description:
				"Run analytics query(ies). Single: type + preset or from/to. Batch: queries array (2-10). Defaults to last_7d. Supports filters, groupBy, orderBy.",
			inputSchema: z.union([
				z.object({
					websiteId: z.string().describe("Website ID from list_websites"),
					queries: z.preprocess(
						coerceQueriesArray,
						z.array(QueryItemSchema).min(2).max(10)
					),
					timezone: z.string().optional().default("UTC"),
				}),
				z.object({
					websiteId: z.string().describe("Website ID from list_websites"),
					type: z.string().describe("Query type for single-query mode"),
					preset: z.enum(MCP_DATE_PRESETS as [string, ...string[]]).optional(),
					from: z.string().optional(),
					to: z.string().optional(),
					timeUnit: z.enum(TIME_UNIT).optional(),
					limit: z.number().min(1).max(1000).optional(),
					filters: z.array(FilterSchema).optional(),
					groupBy: z.array(z.string()).optional(),
					orderBy: z.string().optional(),
					timezone: z.string().optional().default("UTC"),
				}),
			]),
			handler: async (args: GetDataArgs) => {
				const startTime = Date.now();
				const access = await ensureWebsiteAccess(
					args.websiteId,
					ctx.requestHeaders,
					ctx.apiKey
				);
				if (access instanceof Error) {
					trackToolCompletion("get_data", startTime, false);
					return toMcpResult({ error: "Request failed" }, true);
				}

				const timezone = args.timezone ?? "UTC";
				const items: McpQueryItem[] =
					args.queries && args.queries.length >= 2
						? args.queries
						: args.type
							? [
									{
										type: args.type,
										preset: args.preset,
										from: args.from,
										to: args.to,
										timeUnit: args.timeUnit,
										limit: args.limit,
										filters: args.filters,
										groupBy: args.groupBy,
										orderBy: args.orderBy,
									},
								]
							: [];

				if (items.length === 0) {
					trackToolCompletion("get_data", startTime, false);
					return toMcpResult({ error: "Invalid request" }, true);
				}

				const buildResult = buildBatchQueryRequests(
					items,
					args.websiteId,
					timezone
				);
				if ("error" in buildResult) {
					trackToolCompletion("get_data", startTime, false);
					return toMcpResult({ error: "Invalid request" }, true);
				}
				const requests = buildResult.requests;
				const isBatch = requests.length > 1;

				try {
					const websiteDomain =
						(await getWebsiteDomain(args.websiteId)) ?? "unknown";
					const results = await executeBatch(requests, {
						websiteDomain,
						timezone,
					});
					trackToolCompletion("get_data", startTime, true, {
						query_count: requests.length,
						is_batch: isBatch,
					});
					return toMcpResult(
						isBatch
							? {
									batch: true,
									results: results.map((r) => ({
										type: r.type,
										data: r.data,
										rowCount: r.data.length,
										...(r.error && { error: "Query failed" }),
									})),
								}
							: results[0]
								? {
										data: results[0].data,
										rowCount: results[0].data.length,
										type: results[0].type,
										...(results[0].error && { error: "Query failed" }),
									}
								: { error: "Query failed" }
					);
				} catch {
					trackToolCompletion("get_data", startTime, false);
					return toMcpResult({ error: "Query failed" }, true);
				}
			},
		},
		get_schema: {
			description:
				"Returns ClickHouse schema docs for the analytics database. Use before writing custom SQL or choosing query types.",
			inputSchema: z.object({}),
			handler: () => {
				const startTime = Date.now();
				trackToolCompletion("get_schema", startTime, true);
				return toMcpResult({ schema: CLICKHOUSE_SCHEMA_DOCS });
			},
		},
		capabilities: {
			description:
				"Query types with descriptions, date presets, schema summary, and hints.",
			inputSchema: z.object({}),
			handler: () => {
				const startTime = Date.now();
				trackToolCompletion("capabilities", startTime, true);
				const queryTypeDescriptions = getQueryTypeDescriptions();
				return toMcpResult({
					queryTypes: queryTypeDescriptions,
					schemaSummary: getSchemaSummary(),
					datePresets: MCP_DATE_PRESETS,
					dateFormat: "YYYY-MM-DD",
					maxLimit: 1000,
					availableTools: [
						"ask",
						"list_websites",
						"get_data",
						"get_schema",
						"capabilities",
					],
					hints: [
						"list_websites first, then get_data",
						"get_data batch: pass queries array (2-10 items, each with type + preset or from/to)",
						"get_data single: pass type + preset (e.g. last_30d) OR type + from + to (YYYY-MM-DD)",
						"get_data defaults to last_7d when preset/from/to omitted",
						"get_schema returns full ClickHouse schema for custom SQL",
						"ask returns conversationId - pass it for follow-up questions",
					],
				});
			},
		},
	};
}
