"use client";

import { DefaultChatTransport } from "ai";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function useAgentChatTransport(chatId: string) {
	const params = useParams();
	const websiteId = params.id as string;

	return useMemo(
		() =>
			new DefaultChatTransport({
				api: `${API_URL}/v1/agent/chat`,
				credentials: "include",
				prepareSendMessagesRequest({ messages }) {
					return {
						body: {
							id: chatId,
							websiteId,
							messages,
							timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
						},
					};
				},
			}),
		[chatId, websiteId]
	);
}
