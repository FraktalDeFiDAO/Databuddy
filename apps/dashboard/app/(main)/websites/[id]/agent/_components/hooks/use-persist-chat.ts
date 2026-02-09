"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { useChat } from "@/contexts/chat-context";
import { useChatList } from "./use-chat-db";

function extractTitle(messages: UIMessage[]): string {
	const firstUserMessage = messages.find((m) => m.role === "user");
	if (!firstUserMessage) {
		return "New conversation";
	}

	const text = firstUserMessage.parts
		.filter((p): p is Extract<UIMessage["parts"][number], { type: "text" }> => p.type === "text")
		.map((p) => p.text)
		.join(" ")
		.trim();

	return text.slice(0, 100) || "New conversation";
}

/**
 * Persists the chat record to IndexedDB when messages change.
 * Only saves when there is at least one user message.
 * useEffect is required here — persistence is a side effect.
 */
export function usePersistChat(chatId: string, websiteId: string) {
	const { messages } = useChat();
	const { saveChat } = useChatList(websiteId);
	const titleRef = useRef<string | null>(null);

	useEffect(() => {
		const hasUserMessage = messages.some((m) => m.role === "user");
		if (!hasUserMessage) {
			return;
		}

		if (!titleRef.current) {
			titleRef.current = extractTitle(messages);
		}

		saveChat({ id: chatId, websiteId, title: titleRef.current });
	}, [messages.length, chatId, websiteId, saveChat]);
}
