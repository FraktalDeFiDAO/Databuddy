"use client";

import {
	CaretDownIcon,
	CaretRightIcon,
	Folder,
	FolderOpen,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Flag } from "./types";

interface FolderTreeProps {
	flags: Flag[];
	onFolderSelect?: (folder: string | null) => void;
	selectedFolder?: string | null;
}

interface FolderNode {
	name: string;
	path: string;
	flags: Flag[];
	children: Map<string, FolderNode>;
	parent: string | null;
}

export function FolderTree({
	flags,
	onFolderSelect,
	selectedFolder,
}: FolderTreeProps) {
	// Build folder tree from flags
	const folderTree = useState(() => {
		const root: FolderNode = {
			name: "Root",
			path: "",
			flags: [],
			children: new Map(),
			parent: null,
		};

		// Group flags by folder
		for (const flag of flags) {
			if (flag.folder) {
				const parts = flag.folder.split("/");
				let currentNode = root;

				for (let i = 0; i < parts.length; i++) {
					const part = parts[i];
					const currentPath = parts.slice(0, i + 1).join("/");

					if (!currentNode.children.has(part)) {
						currentNode.children.set(part, {
							name: part,
							path: currentPath,
							flags: [],
							children: new Map(),
							parent: i === 0 ? null : parts.slice(0, i).join("/"),
						});
					}

					const nextNode = currentNode.children.get(part);
					if (nextNode) {
						currentNode = nextNode;
					}
				}

				currentNode.flags.push(flag);
			} else {
				root.flags.push(flag);
			}
		}

		return root;
	})[0];

	return (
		<div className="space-y-1">
			{/* Root/Uncategorized flags */}
			{folderTree.flags.length > 0 && (
				<div className="space-y-1">
					<div className="flex items-center justify-between px-2 py-1.5">
						<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
							Uncategorized ({folderTree.flags.length})
						</span>
					</div>
					{folderTree.flags.map((flag) => (
						<FlagFolderItem
							flag={flag}
							isSelected={selectedFolder === null}
							key={flag.id}
							onSelect={() => onFolderSelect?.(null)}
						/>
					))}
				</div>
			)}

			{/* Folder tree */}
			{folderTree.children.size > 0 && (
				<div className="space-y-1">
					<div className="flex items-center justify-between px-2 py-1.5">
						<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
							Folders
						</span>
					</div>
					{Array.from(folderTree.children.values()).map((node) => (
						<FolderNode
							key={node.path}
							node={node}
							onFolderSelect={onFolderSelect}
							selectedFolder={selectedFolder}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function FolderNode({
	node,
	selectedFolder,
	onFolderSelect,
}: {
	node: FolderNode;
	selectedFolder?: string | null;
	onFolderSelect?: (folder: string | null) => void;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = node.children.size > 0;
	const isSelected = selectedFolder === node.path;

	const handleClick = () => {
		if (hasChildren) {
			setIsExpanded(!isExpanded);
		}
		onFolderSelect?.(node.path);
	};

	const totalFlags = countAllFlags(node);

	return (
		<div>
			<button
				className={cn(
					"flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-accent",
					isSelected && "bg-accent"
				)}
				onClick={handleClick}
				type="button"
			>
				{hasChildren ? (
					isExpanded ? (
						<CaretDownIcon className="size-4 text-muted-foreground" />
					) : (
						<CaretRightIcon className="size-4 text-muted-foreground" />
					)
				) : (
					<span className="size-4" />
				)}
				<Folder
					className={cn(
						"size-4",
						isSelected ? "text-primary" : "text-muted-foreground"
					)}
					weight={isSelected ? "fill" : "duotone"}
				/>
				<span className="flex-1 truncate font-medium text-sm">{node.name}</span>
				<span className="text-muted-foreground text-xs">{totalFlags}</span>
			</button>

			{isExpanded && node.children.size > 0 && (
				<div className="ml-4 space-y-1">
					{Array.from(node.children.values()).map((childNode) => (
						<FolderNode
							key={childNode.path}
							node={childNode}
							onFolderSelect={onFolderSelect}
							selectedFolder={selectedFolder}
						/>
					))}
				</div>
			)}

			{isExpanded && node.flags.length > 0 && (
				<div className="ml-4 space-y-1">
					{node.flags.map((flag) => (
						<FlagFolderItem
							flag={flag}
							isSelected={false}
							key={flag.id}
							onSelect={() => {}}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function FlagFolderItem({
	flag,
	isSelected,
	onSelect,
}: {
	flag: Flag;
	isSelected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			className={cn(
				"flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-accent/50",
				isSelected && "bg-accent/50"
			)}
			onClick={onSelect}
			type="button"
		>
			<span className="size-4" />
			<FolderOpen className="size-4 text-muted-foreground" weight="duotone" />
			<span className="flex-1 truncate text-muted-foreground text-sm">
				{flag.name || flag.key}
			</span>
		</button>
	);
}

function countAllFlags(node: FolderNode): number {
	let count = node.flags.length;
	for (const child of node.children.values()) {
		count += countAllFlags(child);
	}
	return count;
}
