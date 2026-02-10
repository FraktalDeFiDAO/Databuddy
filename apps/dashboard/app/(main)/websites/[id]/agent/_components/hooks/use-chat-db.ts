import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface ChatRecord {
	id: string;
	websiteId: string;
	title: string;
	updatedAt: string;
}

interface ChatListState {
	chats: ChatRecord[];
	isLoading: boolean;
}

const STORAGE_PREFIX = "databunny-chats";
const LAST_CHAT_PREFIX = "databunny-last-chat";

function storageKey(websiteId: string): string {
	return `${STORAGE_PREFIX}:${websiteId}`;
}

function lastChatKey(websiteId: string): string {
	return `${LAST_CHAT_PREFIX}:${websiteId}`;
}

function safeGetItem(key: string): string | null {
	try {
		return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
	} catch {
		return null;
	}
}

function safeSetItem(key: string, value: string): void {
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(key, value);
		}
	} catch {
		// Ignore quota or security errors
	}
}

function safeRemoveItem(key: string): void {
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(key);
		}
	} catch {
		// Ignore
	}
}

function listChats(websiteId: string): ChatRecord[] {
	const raw = safeGetItem(storageKey(websiteId));
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as ChatRecord[];
		return Array.isArray(parsed)
			? parsed.sort(
					(a, b) =>
						new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
				)
			: [];
	} catch {
		return [];
	}
}

function upsertChat(chat: ChatRecord): void {
	const records = listChats(chat.websiteId);
	const idx = records.findIndex((r) => r.id === chat.id);
	const next =
		idx >= 0
			? records.map((r, i) => (i === idx ? chat : r))
			: [...records, chat];
	safeSetItem(
		storageKey(chat.websiteId),
		JSON.stringify(
			next.sort(
				(a, b) =>
					new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
			)
		)
	);
}

function deleteChat(websiteId: string, chatId: string): void {
	const records = listChats(websiteId).filter((r) => r.id !== chatId);
	safeSetItem(storageKey(websiteId), JSON.stringify(records));
}

export function getLastChatId(websiteId: string): string | null {
	return safeGetItem(lastChatKey(websiteId));
}

export function setLastChatId(websiteId: string, chatId: string): void {
	safeSetItem(lastChatKey(websiteId), chatId);
}

export function clearLastChatId(websiteId: string): void {
	safeRemoveItem(lastChatKey(websiteId));
}

const chatListCache = new Map<string, ChatListState>();
const chatListSubscribers = new Map<string, Set<() => void>>();

function notifySubscribers(websiteId: string) {
	const subscribers = chatListSubscribers.get(websiteId);
	if (subscribers) {
		for (const callback of subscribers) {
			callback();
		}
	}
}

function refreshChatList(websiteId: string) {
	const records = listChats(websiteId);
	chatListCache.set(websiteId, { chats: records, isLoading: false });
	notifySubscribers(websiteId);
}

function subscribeToChatList(websiteId: string, callback: () => void) {
	let subscribers = chatListSubscribers.get(websiteId);
	if (!subscribers) {
		subscribers = new Set();
		chatListSubscribers.set(websiteId, subscribers);
		refreshChatList(websiteId);
	}
	subscribers.add(callback);

	return () => {
		subscribers?.delete(callback);
		if (subscribers?.size === 0) {
			chatListSubscribers.delete(websiteId);
		}
	};
}

function getChatListSnapshot(websiteId: string): ChatListState {
	const cached = chatListCache.get(websiteId);
	if (cached) {
		return cached;
	}
	// First read: sync load from localStorage, no loading state
	const chats = listChats(websiteId);
	const state = { chats, isLoading: false };
	chatListCache.set(websiteId, state);
	return state;
}

export function useChatList(websiteId: string) {
	const subscribe = useCallback(
		(callback: () => void) => subscribeToChatList(websiteId, callback),
		[websiteId]
	);

	const getSnapshot = useCallback(
		() => getChatListSnapshot(websiteId),
		[websiteId]
	);

	const getServerSnapshot = useCallback(
		(): ChatListState => ({ chats: [], isLoading: false }),
		[]
	);

	const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const refresh = useCallback(() => {
		refreshChatList(websiteId);
	}, [websiteId]);

	const removeChat = useCallback(
		(chatId: string) => {
			deleteChat(websiteId, chatId);
			refreshChatList(websiteId);
		},
		[websiteId]
	);

	const saveChat = useCallback(
		(chat: Omit<ChatRecord, "updatedAt"> & { updatedAt?: string }) => {
			const record: ChatRecord = {
				...chat,
				websiteId,
				updatedAt: chat.updatedAt ?? new Date().toISOString(),
			};
			upsertChat(record);
			setLastChatId(websiteId, chat.id);
			refreshChatList(websiteId);
		},
		[websiteId]
	);

	return useMemo(
		() => ({
			chats: state.chats,
			isLoading: state.isLoading,
			removeChat,
			refresh,
			saveChat,
		}),
		[state.chats, state.isLoading, refresh, removeChat, saveChat]
	);
}
