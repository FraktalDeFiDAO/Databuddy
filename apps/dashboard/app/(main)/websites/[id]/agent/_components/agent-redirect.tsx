"use client";

import { generateId } from "ai";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useChatList } from "./hooks/use-chat-db";

/**
 * Client component that redirects to the most recent chat
 * or creates a new one. useEffect is required — navigation
 * depends on an async IndexedDB read.
 */
export function AgentRedirect() {
	const router = useRouter();
	const params = useParams();
	const websiteId = params.id as string;
	const { chats, isLoading } = useChatList(websiteId);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		const lastChat = chats.at(0);
		if (lastChat) {
			router.replace(`/websites/${websiteId}/agent/${lastChat.id}`);
		} else {
			const newChatId = generateId();
			router.replace(`/websites/${websiteId}/agent/${newChatId}`);
		}
	}, [isLoading, chats, websiteId, router]);

	return (
		<div className="flex h-full items-center justify-center">
			<div className="animate-pulse text-muted-foreground text-sm">
				Loading agent...
			</div>
		</div>
	);
}
