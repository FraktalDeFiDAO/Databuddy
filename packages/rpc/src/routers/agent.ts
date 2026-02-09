import { redis } from "@databuddy/redis";
import type { UIMessage } from "ai";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

function chatKey(chatId: string): string {
	return `chat:messages:${chatId}`;
}

async function loadMessages(
	chatId: string,
	limit: number
): Promise<UIMessage[]> {
	const raw = await redis.get(chatKey(chatId));
	if (!raw) {
		return [];
	}

	const messages = JSON.parse(raw as string) as UIMessage[];
	return messages.slice(-limit);
}

export const agentRouter = {
	getMessages: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				websiteId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			const messages = await loadMessages(input.chatId, 50);

			return {
				success: true,
				messages,
			};
		}),

	addFeedback: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				messageId: z.string(),
				websiteId: z.string(),
				type: z.enum(["positive", "negative"]),
				comment: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			// TODO: Store feedback in database or cache

			return {
				success: true,
			};
		}),

	deleteFeedback: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				messageId: z.string(),
				websiteId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			// TODO: Delete feedback from database or cache

			return {
				success: true,
			};
		}),
};
