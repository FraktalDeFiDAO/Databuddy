import { type LanguageModel, stepCountIs } from "ai";
import type { models } from "../config/models";
import { createMcpAgentTools } from "../mcp/agent-tools";
import { buildAnalyticsInstructionsForMcp } from "../prompts/analytics";
import { maxSteps } from "./analytics";

export function createMcpAgentConfig(
	model: (typeof models)["analytics"],
	context: { requestHeaders: Headers; apiKey: unknown; userId: string | null }
) {
	const tools = createMcpAgentTools();
	const system = buildAnalyticsInstructionsForMcp({
		timezone: "UTC",
		currentDateTime: new Date().toISOString(),
	});

	const experimental_context = {
		userId: context.userId ?? "",
		websiteId: "",
		websiteDomain: "",
		timezone: "UTC",
		currentDateTime: new Date().toISOString(),
		chatId: crypto.randomUUID(),
		requestHeaders: context.requestHeaders,
		apiKey: context.apiKey,
	};

	return {
		model: model as LanguageModel,
		system,
		tools,
		stopWhen: stepCountIs(maxSteps),
		temperature: 0.3,
		experimental_context,
	};
}
