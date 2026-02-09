import { type LanguageModel, stepCountIs } from "ai";
import type { AppContext } from "../config/context";
import { models } from "../config/models";
import { buildReflectionInstructions } from "../prompts/reflection";
import { createAnnotationTools } from "../tools/annotations";
import { executeQueryBuilderTool } from "../tools/execute-query-builder";
import { executeSqlQueryTool } from "../tools/execute-sql-query";
import { createFunnelTools } from "../tools/funnels";
import { getTopPagesTool } from "../tools/get-top-pages";
import { createGoalTools } from "../tools/goals";
import { createLinksTools } from "../tools/links";
import type { AgentConfig, AgentContext } from "./types";

function createTools(context: AgentContext) {
	const appContext: AppContext = {
		userId: context.userId,
		websiteId: context.websiteId,
		websiteDomain: context.websiteDomain,
		timezone: context.timezone,
		currentDateTime: new Date().toISOString(),
		chatId: crypto.randomUUID(),
		requestHeaders: context.requestHeaders,
	};

	return {
		get_top_pages: getTopPagesTool,
		execute_query_builder: executeQueryBuilderTool,
		execute_sql_query: executeSqlQueryTool,
		...createFunnelTools(appContext),
		...createGoalTools(appContext),
		...createAnnotationTools(appContext),
		...createLinksTools(appContext),
	};
}

export const maxSteps = 20;
export const maxMaxSteps = 40;

/**
 * Reflection agent with orchestration prompt and all analytics tools.
 * Previously used handoffs to analytics, now handles tools directly.
 */
export function createConfig(context: AgentContext): AgentConfig {
	const appContext: AppContext = {
		userId: context.userId,
		websiteId: context.websiteId,
		websiteDomain: context.websiteDomain,
		timezone: context.timezone,
		currentDateTime: new Date().toISOString(),
		chatId: crypto.randomUUID(),
	};

	return {
		model: models.analytics as LanguageModel,
		system: buildReflectionInstructions(appContext),
		tools: createTools(context),
		stopWhen: stepCountIs(20),
		temperature: 0,
	};
}

/**
 * Advanced reflection agent with more powerful model and higher step limit.
 */
export function createMaxConfig(context: AgentContext): AgentConfig {
	const appContext: AppContext = {
		userId: context.userId,
		websiteId: context.websiteId,
		websiteDomain: context.websiteDomain,
		timezone: context.timezone,
		currentDateTime: new Date().toISOString(),
		chatId: crypto.randomUUID(),
	};

	return {
		model: models.advanced as LanguageModel,
		system: buildReflectionInstructions(appContext),
		tools: createTools(context),
		stopWhen: stepCountIs(40),
		temperature: 0,
	};
}
