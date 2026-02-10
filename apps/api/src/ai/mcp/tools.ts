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
import { getWebsiteDomain, validateWebsite } from "../../lib/website-utils";
import { executeQuery, QueryBuilders } from "../../query";
import type { QueryRequest } from "../../query/types";
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

export function createMcpTools(ctx: McpToolContext) {
	return {
		ask: {
			description:
				"Ask any analytics question in natural language. The agent will discover your websites, run queries, and return insights. Use this for questions like 'what are my top pages?', 'show me traffic last week', 'how many visitors did we have?', etc.",
			inputSchema: z.object({
				question: z
					.string()
					.describe("Your analytics question in natural language"),
			}),
			handler: async (args: { question: string }) => {
				try {
					const answer = await runMcpAgent({
						question: args.question,
						requestHeaders: ctx.requestHeaders,
						apiKey: ctx.apiKey,
						userId: ctx.userId,
					});
					return toMcpResult({ answer });
				} catch (error) {
					return toMcpResult(
						{
							error: error instanceof Error ? error.message : "Agent failed",
						},
						true
					);
				}
			},
		},
		list_websites: {
			description:
				"List websites accessible with your API key. Use to discover website IDs before get_data. Fast, no LLM.",
			inputSchema: z.object({}),
			handler: async () => {
				const authCtx = {
					user: ctx.userId ? { id: ctx.userId } : null,
					apiKey: ctx.apiKey,
				};
				const list = await getAccessibleWebsites(authCtx);
				return toMcpResult({
					websites: list.map((w) => ({
						id: w.id,
						name: w.name,
						domain: w.domain,
						isPublic: w.isPublic,
					})),
					total: list.length,
				});
			},
		},
		get_data: {
			description:
				"Run a pre-built analytics query and return structured JSON. Use websiteId from list_websites. Common types: traffic, top_pages, sessions, summary_metrics, devices, geo. Call capabilities for full list.",
			inputSchema: z.object({
				websiteId: z.string().describe("Website ID from list_websites"),
				type: z
					.string()
					.describe("Query type (e.g. traffic, top_pages, sessions)"),
				from: z.string().describe("Start date YYYY-MM-DD"),
				to: z.string().describe("End date YYYY-MM-DD"),
				timeUnit: z.enum(["minute", "hour", "day", "week", "month"]).optional(),
				limit: z.number().min(1).max(1000).optional(),
			}),
			handler: async (args: {
				websiteId: string;
				type: string;
				from: string;
				to: string;
				timeUnit?: "minute" | "hour" | "day" | "week" | "month";
				limit?: number;
			}) => {
				const access = await ensureWebsiteAccess(
					args.websiteId,
					ctx.requestHeaders,
					ctx.apiKey
				);
				if (access instanceof Error) {
					return toMcpResult({ error: access.message }, true);
				}
				if (!(args.type in QueryBuilders)) {
					return toMcpResult(
						{
							error: `Unknown type: ${args.type}. Available: ${Object.keys(QueryBuilders).join(", ")}`,
						},
						true
					);
				}
				try {
					const websiteDomain =
						(await getWebsiteDomain(args.websiteId)) ?? "unknown";
					const queryRequest: QueryRequest = {
						projectId: args.websiteId,
						type: args.type,
						from: args.from,
						to: args.to,
						timeUnit: args.timeUnit,
						limit: args.limit,
						timezone: "UTC",
					};
					const data = await executeQuery(
						queryRequest,
						websiteDomain,
						queryRequest.timezone
					);
					return toMcpResult({ data, rowCount: data.length, type: args.type });
				} catch (error) {
					return toMcpResult(
						{
							error:
								error instanceof Error
									? error.message
									: "Query execution failed",
						},
						true
					);
				}
			},
		},
		capabilities: {
			description:
				"Returns what this MCP supports: query types, limits, and usage hints.",
			inputSchema: z.object({}),
			handler: () => {
				const types = Object.keys(QueryBuilders);
				return toMcpResult({
					queryTypes: types,
					dateFormat: "YYYY-MM-DD",
					maxLimit: 1000,
					hints: [
						"Use ask for natural language questions",
						"Use list_websites first to get website IDs",
						"Use get_data for structured JSON when automating",
					],
				});
			},
		},
	};
}
