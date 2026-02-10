"use client";

import { generateId } from "ai";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getLastChatId, setLastChatId } from "./hooks/use-chat-db";

/**
 * Client component that redirects to the last opened chat
 * or creates a new one. Uses localStorage (sync) for instant restore.
 */
export function AgentRedirect() {
	const router = useRouter();
	const params = useParams();
	const websiteId = params.id as string;

	useEffect(() => {
		const lastChatId = getLastChatId(websiteId);
		if (lastChatId) {
			router.replace(`/websites/${websiteId}/agent/${lastChatId}`);
		} else {
			const newChatId = generateId();
			setLastChatId(websiteId, newChatId);
			router.replace(`/websites/${websiteId}/agent/${newChatId}`);
		}
	}, [websiteId, router]);

	return (
		<div className="flex h-full items-center justify-center">
			<div className="animate-pulse text-muted-foreground text-sm">
				Loading agent...
			</div>
		</div>
	);
}
