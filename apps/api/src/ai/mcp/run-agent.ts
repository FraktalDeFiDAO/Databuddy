import { ToolLoopAgent } from "ai";
import { createMcpAgentConfig } from "../agents/mcp";
import { models } from "../config/models";

export interface RunMcpAgentOptions {
	question: string;
	requestHeaders: Headers;
	apiKey: Awaited<
		ReturnType<typeof import("../../lib/api-key").getApiKeyFromHeader>
	>;
	userId: string | null;
}

export async function runMcpAgent(
	options: RunMcpAgentOptions
): Promise<string> {
	const config = createMcpAgentConfig(models.analytics, {
		requestHeaders: options.requestHeaders,
		apiKey: options.apiKey,
		userId: options.userId,
	});

	const agent = new ToolLoopAgent({
		model: config.model,
		instructions: config.system,
		tools: config.tools,
		stopWhen: config.stopWhen,
		temperature: config.temperature,
		experimental_context: config.experimental_context,
	});

	const result = await agent.generate({
		prompt: options.question,
	});

	return result.text ?? "No response generated.";
}
