import * as analytics from "./analytics";
import * as reflection from "./reflection";
import * as triage from "./triage";
import type { AgentConfig, AgentContext, AgentType } from "./types";

export type { AgentConfig, AgentContext, AgentType } from "./types";

export function createAgentConfig(
	type: AgentType,
	context: AgentContext
): AgentConfig {
	switch (type) {
		case "triage":
			return triage.createConfig(context);
		case "analytics":
			return analytics.createConfig(context);
		case "reflection":
			return reflection.createConfig(context);
		case "reflection-max":
			return reflection.createMaxConfig(context);
		default:
			throw new Error(`Unknown agent type: ${type}`);
	}
}
