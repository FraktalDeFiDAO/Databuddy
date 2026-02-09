import type { AppContext } from "../config/context";
import { formatContextForLLM } from "../config/context";
import { COMMON_AGENT_RULES } from "./shared";

/**
 * Builds the instruction prompt for the triage/basic agent.
 * Lightweight prompt for simple, quick queries with direct tool access.
 */
export function buildTriageInstructions(ctx: AppContext): string {
	return `You are Databunny, a quick analytics assistant for ${ctx.websiteDomain}. Answer questions directly using the available tools.

${COMMON_AGENT_RULES}

<background-data>
${formatContextForLLM(ctx)}
</background-data>`;
}
