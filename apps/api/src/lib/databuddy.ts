import { Databuddy } from "@databuddy/sdk/node";

/**
 * Agent observability: track MCP tool usage and dashboard agent chats.
 * Set DATABUDDY_AGENT_API_KEY + DATABUDDY_AGENT_WEBSITE_ID (or DATABUDDY_API_KEY + DATABUDDY_WEBSITE_ID)
 * to a website with track:events scope. Events: agent_tool_completed (source: mcp), agent_chat_started, agent_chat_error.
 */
const apiKey = process.env.DATABUDDY_API_KEY;
const websiteId = process.env.DATABUDDY_WEBSITE_ID;

const client =
	apiKey && websiteId
		? new Databuddy({
				apiKey,
				websiteId,
				source: "api",
				namespace: "agent",
				enableBatching: true,
				debug: process.env.NODE_ENV === "development",
			})
		: null;

export type AgentEventProperties = Record<string, unknown>;

/**
 * Fire-and-forget agent event tracking. No-ops if DATABUDDY_AGENT_* or DATABUDDY_* env vars are not set.
 * Events appear in the configured website's custom events.
 */
export function trackAgentEvent(
	name: string,
	properties?: AgentEventProperties
): void {
	if (!client) {
		return;
	}

	client
		.track({
			name,
			properties: properties ?? undefined,
		})
		.catch(() => {
			// Silently ignore tracking failures - don't break agent flow
		});
}
