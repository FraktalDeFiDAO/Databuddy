import { auth, websitesApi } from "@databuddy/auth";
import {
	convertToModelMessages,
	generateId,
	smoothStream,
	streamText,
	type UIMessage,
} from "ai";
import { Elysia, t } from "elysia";
import { type AgentType, createAgentConfig } from "../ai/agents";
import { saveMessages } from "../ai/config/memory";
import { captureError, record, setAttributes } from "../lib/tracing";
import { validateWebsite } from "../lib/website-utils";

/**
 * Schema uses t.Any() for message parts because UIMessage parts
 * are polymorphic (text, tool, reasoning, etc.) and validated
 * at the AI SDK level via convertToModelMessages.
 */
const UIMessageSchema = t.Object({
	id: t.String(),
	role: t.Union([t.Literal("user"), t.Literal("assistant")]),
	parts: t.Array(t.Record(t.String(), t.Any())),
});

const AgentRequestSchema = t.Object({
	websiteId: t.String(),
	messages: t.Array(UIMessageSchema),
	id: t.Optional(t.String()),
	timezone: t.Optional(t.String()),
	model: t.Optional(
		t.Union([t.Literal("basic"), t.Literal("agent"), t.Literal("agent-max")])
	),
});

/**
 * Build a UIMessage from the streamText onFinish callback data.
 * Reconstructs tool invocations, reasoning, and text parts
 * using the flat UIMessage part structure from AI SDK v6.
 */
function buildAssistantUIMessage(event: {
	text: string;
	steps: ReadonlyArray<{
		text: string;
		reasoning: ReadonlyArray<{ type: string; text: string }>;
		staticToolResults: ReadonlyArray<{
			toolCallId: string;
			toolName: string;
			input: unknown;
			output: unknown;
		}>;
	}>;
}): UIMessage {
	const parts: UIMessage["parts"] = [];

	for (const step of event.steps) {
		for (const reasoning of step.reasoning) {
			parts.push({
				type: "reasoning" as const,
				text: reasoning.text,
				providerMetadata: undefined,
			});
		}

		for (const toolResult of step.staticToolResults) {
			parts.push({
				type: `tool-${toolResult.toolName}`,
				toolCallId: toolResult.toolCallId,
				state: "output-available" as const,
				input: toolResult.input,
				output: toolResult.output,
			} as UIMessage["parts"][number]);
		}

		if (step.text) {
			parts.push({ type: "text" as const, text: step.text });
		}
	}

	if (parts.length === 0 && event.text) {
		parts.push({ type: "text" as const, text: event.text });
	}

	return {
		id: generateId(),
		role: "assistant",
		parts,
	};
}

const MODEL_TO_AGENT: Record<string, AgentType> = {
	basic: "triage",
	agent: "analytics",
	"agent-max": "reflection-max",
};

export const agent = new Elysia({ prefix: "/v1/agent" })
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		return { user: session?.user ?? null };
	})
	.onBeforeHandle(({ user, set }) => {
		if (!user) {
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}
	})
	.post(
		"/chat",
		function agentChat({ body, user, request }) {
			return record("agentChat", async () => {
				const chatId = body.id ?? generateId();

				setAttributes({
					agent_website_id: body.websiteId,
					agent_user_id: user?.id ?? "unknown",
					agent_chat_id: chatId,
				});

				try {
					const websiteValidation = await validateWebsite(body.websiteId);
					if (!(websiteValidation.success && websiteValidation.website)) {
						return new Response(
							JSON.stringify({
								success: false,
								error: websiteValidation.error ?? "Website not found",
								code: "WEBSITE_NOT_FOUND",
							}),
							{
								status: 404,
								headers: { "Content-Type": "application/json" },
							}
						);
					}

					const { website } = websiteValidation;

					let authorized = website.isPublic;
					if (!authorized && website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ["read"] } },
						});
						authorized = success;
					}

					if (!authorized) {
						return new Response(
							JSON.stringify({
								success: false,
								error: "Access denied to this website",
								code: "ACCESS_DENIED",
							}),
							{
								status: 403,
								headers: { "Content-Type": "application/json" },
							}
						);
					}

					if (!user?.id) {
						return new Response(
							JSON.stringify({
								success: false,
								error: "User ID required",
								code: "AUTH_REQUIRED",
							}),
							{
								status: 401,
								headers: { "Content-Type": "application/json" },
							}
						);
					}

					const agentType: AgentType =
						MODEL_TO_AGENT[body.model ?? "agent"] ?? "reflection";

					const lastMessage = body.messages.at(-1);

					console.log("[Agent] Creating agent", {
						type: agentType,
						model: body.model,
						websiteId: body.websiteId,
						messageCount: body.messages.length,
						lastMessage:
							lastMessage?.parts
								?.filter((p: Record<string, unknown>) => p.type === "text")
								.map((p: Record<string, unknown>) => p.text)
								.join("") ?? "",
					});

					const config = createAgentConfig(agentType, {
						userId: user.id,
						websiteId: body.websiteId,
						websiteDomain: website.domain ?? "unknown",
						timezone: body.timezone ?? "UTC",
						requestHeaders: request.headers,
					});

					// Messages come directly from the frontend (useChat manages the full history)
					const uiMessages = body.messages as UIMessage[];
					const modelMessages = convertToModelMessages(uiMessages);

					const result = streamText({
						model: config.model,
						system: config.system,
						messages: modelMessages,
						tools: config.tools,
						stopWhen: config.stopWhen,
						temperature: config.temperature,
						experimental_transform: smoothStream({ chunking: "word" }),
						onFinish: async (event) => {
							try {
								const assistantMessage = buildAssistantUIMessage(event);
								await saveMessages(chatId, [...uiMessages, assistantMessage]);
							} catch (saveError) {
								console.error("[Agent] Failed to save messages:", saveError);
							}
						},
					});

					return result.toUIMessageStreamResponse();
				} catch (error) {
					captureError(error, {
						agent_error: true,
						agent_model_type: body.model ?? "agent",
						agent_chat_id: chatId,
						agent_website_id: body.websiteId,
						agent_user_id: user?.id ?? "unknown",
						error_type: error instanceof Error ? error.name : "UnknownError",
					});
					return new Response(
						JSON.stringify({
							success: false,
							error: error instanceof Error ? error.message : "Unknown error",
							code: "INTERNAL_ERROR",
						}),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						}
					);
				}
			});
		},
		{ body: AgentRequestSchema, idleTimeout: 60_000 }
	);
