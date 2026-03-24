"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { FlagIcon, FolderIcon } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureGate } from "@/components/feature-gate";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { orpc } from "@/lib/orpc";
import { isFlagSheetOpenAtom } from "@/stores/jotai/flagsAtoms";
import { FlagSheet } from "./_components/flag-sheet";
import { FlagsList, FlagsListSkeleton } from "./_components/flags-list";
import { FolderManagementModal } from "./_components/folder-management-modal";
import type { Flag, TargetGroup } from "./_components/types";

export default function FlagsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isFlagSheetOpen, setIsFlagSheetOpen] = useAtom(isFlagSheetOpenAtom);
	const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
	const [flagToDelete, setFlagToDelete] = useState<Flag | null>(null);
	const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);

	const { data: flags, isLoading: flagsLoading } = useQuery({
		...orpc.flags.list.queryOptions({ input: { websiteId } }),
	});

	const activeFlags = useMemo(
		() => flags?.filter((f) => f.status !== "archived") ?? [],
		[flags]
	);

	const groupsMap = useMemo(() => {
		const map = new Map<string, TargetGroup[]>();
		for (const flag of activeFlags) {
			if (
				Array.isArray(flag.targetGroups) &&
				flag.targetGroups.length > 0 &&
				typeof flag.targetGroups[0] === "object"
			) {
				map.set(flag.id, flag.targetGroups as TargetGroup[]);
			} else {
				map.set(flag.id, []);
			}
		}
		return map;
	}, [activeFlags]);

	const deleteFlagMutation = useMutation({
		...orpc.flags.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	const handleCreateFlag = () => {
		setEditingFlag(null);
		setIsFlagSheetOpen(true);
	};

	const handleEditFlag = (flag: Flag) => {
		setEditingFlag(flag);
		setIsFlagSheetOpen(true);
	};

	const handleDeleteFlagRequest = (flagId: string) => {
		const flag = flags?.find((f) => f.id === flagId);
		if (flag) {
			setFlagToDelete(flag as Flag);
		}
	};

	const handleConfirmDelete = async () => {
		if (flagToDelete) {
			await deleteFlagMutation.mutateAsync({ id: flagToDelete.id });
			setFlagToDelete(null);
		}
	};

	const handleFlagSheetClose = () => {
		setIsFlagSheetOpen(false);
		setEditingFlag(null);
	};

	// Folder management
	const updateFlagMutation = useMutation({
		...orpc.flags.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.flags.list.key({ input: { websiteId } }),
			});
		},
	});

	// Extract unique folders and flag counts
	const folderData = useMemo(() => {
		const folders = new Set<string>();
		const flagCounts: Record<string, number> = {};

		for (const flag of activeFlags) {
			if (flag.folder) {
				folders.add(flag.folder);
				flagCounts[flag.folder] = (flagCounts[flag.folder] ?? 0) + 1;
			}
		}

		return {
			folders: Array.from(folders).sort(),
			flagCounts,
		};
	}, [activeFlags]);

	const handleCreateFolder = (name: string) => {
		// Creating a folder is just a UI concept - flags will be assigned to it
		toast.success(`Folder "${name}" created`);
		setIsFolderModalOpen(false);
	};

	const handleRenameFolder = async (oldPath: string, newPath: string) => {
		try {
			// Find all flags in the old folder and update them
			const flagsToUpdate = activeFlags.filter(
				(f) => f.folder === oldPath || f.folder?.startsWith(oldPath + "/")
			);

			for (const flag of flagsToUpdate) {
				const newFolder = flag.folder === oldPath
					? newPath
					: newPath + flag.folder.slice(oldPath.length);

				await updateFlagMutation.mutateAsync({
					id: flag.id,
					folder: newFolder || null,
				});
			}

			toast.success(`Folder renamed to "${newPath.split("/").pop()}"`);
		} catch (error) {
			console.error("Failed to rename folder:", error);
			toast.error("Failed to rename folder");
		}
	};

	const handleDeleteFolder = async (path: string) => {
		try {
			// Find all flags in the folder (including nested) and move them to root
			const flagsToUpdate = activeFlags.filter(
				(f) => f.folder === path || f.folder?.startsWith(path + "/")
			);

			for (const flag of flagsToUpdate) {
				await updateFlagMutation.mutateAsync({
					id: flag.id,
					folder: null,
				});
			}

			toast.success("Folder deleted, flags moved to Uncategorized");
			setIsFolderModalOpen(false);
		} catch (error) {
			console.error("Failed to delete folder:", error);
			toast.error("Failed to delete folder");
		}
	};

	return (
		<FeatureGate feature={GATED_FEATURES.FEATURE_FLAGS}>
			<ErrorBoundary>
				<div className="flex h-full flex-col overflow-hidden">
					{/* Folder Management Toolbar */}
					{!flagsLoading && activeFlags.length > 0 && (
						<div className="flex items-center justify-between border-b px-4 py-2">
							<div className="flex items-center gap-2">
								<FolderIcon className="size-4 text-muted-foreground" weight="duotone" />
								<span className="text-muted-foreground text-sm">
									{folderData.folders.length} folder{folderData.folders.length !== 1 ? "s" : ""}
								</span>
							</div>
							<Button
								onClick={() => setIsFolderModalOpen(true)}
								size="sm"
								variant="outline"
							>
								<FolderIcon className="mr-2 size-4" weight="duotone" />
								Manage Folders
							</Button>
						</div>
					)}

					<div className="flex-1 overflow-y-auto">
						<Suspense fallback={<FlagsListSkeleton />}>
							{flagsLoading ? (
								<FlagsListSkeleton />
							) : activeFlags.length === 0 ? (
								<div className="flex flex-1 items-center justify-center py-16">
									<EmptyState
										action={{
											label: "Create Your First Flag",
											onClick: handleCreateFlag,
										}}
										description="Create your first feature flag to start controlling feature rollouts and A/B testing across your application."
										icon={<FlagIcon weight="duotone" />}
										title="No feature flags yet"
										variant="minimal"
									/>
								</div>
							) : (
								<FlagsList
									flags={activeFlags as Flag[]}
									groups={groupsMap}
									onDelete={handleDeleteFlagRequest}
									onEdit={handleEditFlag}
								/>
							)}
						</Suspense>
					</div>

					{isFlagSheetOpen && (
						<Suspense fallback={null}>
							<FlagSheet
								flag={editingFlag}
								isOpen={isFlagSheetOpen}
								onCloseAction={handleFlagSheetClose}
								websiteId={websiteId}
							/>
						</Suspense>
					)}

					<DeleteDialog
						isDeleting={deleteFlagMutation.isPending}
						isOpen={flagToDelete !== null}
						itemName={flagToDelete?.name || flagToDelete?.key}
						onClose={() => setFlagToDelete(null)}
						onConfirm={handleConfirmDelete}
						title="Delete Feature Flag"
					/>

					<FolderManagementModal
						flagCounts={folderData.flagCounts}
						folders={folderData.folders}
						isOpen={isFolderModalOpen}
						onClose={() => setIsFolderModalOpen(false)}
						onCreateFolder={handleCreateFolder}
						onDeleteFolder={handleDeleteFolder}
						onRenameFolder={handleRenameFolder}
					/>
				</div>
			</ErrorBoundary>
		</FeatureGate>
	);
}
