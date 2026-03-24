"use client";

import {
	CaretDownIcon,
	CaretRightIcon,
	DotsThreeIcon,
	Folder,
	FolderOpen,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FolderNode {
	name: string;
	path: string;
	flags: number;
	children: Map<string, FolderNode>;
}

interface FolderManagementModalProps {
	isOpen: boolean;
	onClose: () => void;
	folders: string[];
	flagCounts: Record<string, number>;
	onCreateFolder: (name: string) => void;
	onRenameFolder: (oldPath: string, newPath: string) => void;
	onDeleteFolder: (path: string) => void;
}

export function FolderManagementModal({
	isOpen,
	onClose,
	folders,
	flagCounts,
	onCreateFolder,
	onRenameFolder,
	onDeleteFolder,
}: FolderManagementModalProps) {
	const [newFolderName, setNewFolderName] = useState("");
	const [editingFolder, setEditingFolder] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);

	// Build folder tree
	const folderTree = useState(() => {
		const root: FolderNode = {
			name: "Root",
			path: "",
			flags: 0,
			children: new Map(),
		};

		for (const folder of folders) {
			if (!folder) continue;

			const parts = folder.split("/");
			let currentNode = root;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const currentPath = parts.slice(0, i + 1).join("/");

				if (!currentNode.children.has(part)) {
					currentNode.children.set(part, {
						name: part,
						path: currentPath,
						flags: 0,
						children: new Map(),
					});
				}

				const nextNode = currentNode.children.get(part);
				if (nextNode) {
					currentNode = nextNode;
				}
			}

			// Add flag count to the leaf folder
			currentNode.flags = flagCounts[folder] ?? 0;
		}

		return root;
	})[0];

	const handleCreateFolder = () => {
		if (newFolderName.trim()) {
			onCreateFolder(newFolderName.trim());
			setNewFolderName("");
		}
	};

	const handleStartEdit = (folder: FolderNode) => {
		setEditingFolder(folder.path);
		setEditValue(folder.name);
	};

	const handleSaveEdit = (folder: FolderNode) => {
		if (editValue.trim() && editValue.trim() !== folder.name) {
			const newPath = folder.path
				.split("/")
				.slice(0, -1)
				.concat(editValue.trim())
				.join("/");
			onRenameFolder(folder.path, newPath);
		}
		setEditingFolder(null);
		setEditValue("");
	};

	const handleCancelEdit = () => {
		setEditingFolder(null);
		setEditValue("");
	};

	const handleStartDelete = (path: string) => {
		setDeleteConfirmPath(path);
	};

	const handleConfirmDelete = () => {
		if (deleteConfirmPath) {
			onDeleteFolder(deleteConfirmPath);
			setDeleteConfirmPath(null);
		}
	};

	const handleCancelDelete = () => {
		setDeleteConfirmPath(null);
	};

	return (
		<>
			<Dialog onOpenChange={onClose} open={isOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Manage Folders</DialogTitle>
						<DialogDescription>
							Organize your feature flags into folders. Create, rename, or
							delete folders.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						{/* Create New Folder */}
						<div className="flex items-center gap-2">
							<Input
								placeholder="New folder name…"
								value={newFolderName}
								onChange={(e) => setNewFolderName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										handleCreateFolder();
									}
								}}
							/>
							<Button
								disabled={!newFolderName.trim()}
								onClick={handleCreateFolder}
								size="sm"
							>
								<PlusIcon className="size-4" weight="duotone" />
								Add
							</Button>
						</div>

						{/* Folder Tree */}
						<div className="max-h-64 overflow-y-auto rounded border bg-muted/30 p-2">
							{folderTree.children.size === 0 ? (
								<p className="py-4 text-center text-muted-foreground text-sm">
									No folders yet. Create one above!
								</p>
							) : (
								<div className="space-y-1">
									{Array.from(folderTree.children.values()).map((node) => (
										<FolderTreeItem
											key={node.path}
											node={node}
											editingFolder={editingFolder}
											editValue={editValue}
											onStartEdit={handleStartEdit}
											onSaveEdit={handleSaveEdit}
											onCancelEdit={handleCancelEdit}
											onEditValueChange={setEditValue}
											onStartDelete={handleStartDelete}
										/>
									))}
								</div>
							)}
						</div>
					</div>

					<DialogFooter>
						<Button onClick={onClose} variant="ghost">
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog onOpenChange={handleCancelDelete} open={deleteConfirmPath !== null}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Delete Folder</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this folder? Flags in this folder
							will be moved to "Uncategorized".
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={handleCancelDelete} variant="ghost">
							Cancel
						</Button>
						<Button onClick={handleConfirmDelete} variant="destructive">
							<TrashIcon className="mr-2 size-4" weight="duotone" />
							Delete Folder
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function FolderTreeItem({
	node,
	editingFolder,
	editValue,
	onStartEdit,
	onSaveEdit,
	onCancelEdit,
	onEditValueChange,
	onStartDelete,
	level = 0,
}: {
	node: FolderNode;
	editingFolder: string | null;
	editValue: string;
	onStartEdit: (folder: FolderNode) => void;
	onSaveEdit: (folder: FolderNode) => void;
	onCancelEdit: () => void;
	onEditValueChange: (value: string) => void;
	onStartDelete: (path: string) => void;
	level?: number;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = node.children.size > 0;
	const isEditing = editingFolder === node.path;

	return (
		<div>
			<div
				className={cn(
					"flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-accent",
					isEditing && "bg-accent"
				)}
				style={{ paddingLeft: `${level * 16 + 8}px` }}
			>
				{hasChildren ? (
					<button
						className="flex size-4 items-center justify-center"
						onClick={() => setIsExpanded(!isExpanded)}
						type="button"
					>
						{isExpanded ? (
							<CaretDownIcon className="size-4 text-muted-foreground" />
						) : (
							<CaretRightIcon className="size-4 text-muted-foreground" />
						)}
					</button>
				) : (
					<span className="size-4" />
				)}

				<Folder
					className="size-4 text-primary"
					weight={isExpanded ? "fill" : "duotone"}
				/>

				{isEditing ? (
					<Input
						autoFocus
						className="h-7 flex-1"
						onBlur={() => onSaveEdit(node)}
						onChange={(e) => onEditValueChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								onSaveEdit(node);
							} else if (e.key === "Escape") {
								onCancelEdit();
							}
						}}
						value={editValue}
					/>
				) : (
					<span className="flex-1 truncate font-medium text-sm">
						{node.name}
					</span>
				)}

				<span className="text-muted-foreground text-xs">
					{node.flags} {node.flags === 1 ? "flag" : "flags"}
				</span>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label="Folder actions"
							className="size-7 opacity-50 hover:opacity-100"
							size="icon"
							variant="ghost"
						>
							<DotsThreeIcon className="size-4" weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							className="gap-2"
							onClick={() => onStartEdit(node)}
						>
							<PencilSimpleIcon className="size-4" weight="duotone" />
							Rename
						</DropdownMenuItem>
						<DropdownMenuItem
							className="gap-2 text-destructive focus:text-destructive"
							onClick={() => onStartDelete(node.path)}
							variant="destructive"
						>
							<TrashIcon className="size-4 fill-destructive" weight="duotone" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{isExpanded && node.children.size > 0 && (
				<div>
					{Array.from(node.children.values()).map((childNode) => (
						<FolderTreeItem
							key={childNode.path}
							node={childNode}
							editingFolder={editingFolder}
							editValue={editValue}
							level={level + 1}
							onStartDelete={onStartDelete}
							onStartEdit={onStartEdit}
							onCancelEdit={onCancelEdit}
							onEditValueChange={onEditValueChange}
							onSaveEdit={onSaveEdit}
						/>
					))}
				</div>
			)}
		</div>
	);
}
