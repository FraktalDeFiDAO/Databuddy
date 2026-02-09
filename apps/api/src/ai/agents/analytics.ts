import { type LanguageModel, stepCountIs } from "ai";
import type { AppContext } from "../config/context";
import { models } from "../config/models";
import { buildAnalyticsInstructions } from "../prompts/analytics";
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
		system: buildAnalyticsInstructions(appContext),
		tools: createTools(context),
		stopWhen: stepCountIs(20),
		temperature: 0.3,
	};
}
