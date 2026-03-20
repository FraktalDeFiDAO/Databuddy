"use client";

import { authClient } from "@databuddy/auth/client";
import { PLAN_IDS, type PlanId } from "@databuddy/shared/types/features";
import {
	CaretDownIcon,
	CheckIcon,
	PlusIcon,
	SpinnerGapIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import { useBillingContext } from "@/components/providers/billing-provider";
import {
	AUTH_QUERY_KEYS,
	useOrganizationsContext,
} from "@/components/providers/organizations-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const getDicebearUrl = (seed: string | undefined) =>
	`https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed || "")}`;

const getPlanDisplayInfo = (planId: PlanId | null) => {
	if (!planId || planId === PLAN_IDS.FREE) {
		return { name: "Free", variant: "gray" as const };
	}
	if (planId === PLAN_IDS.HOBBY) {
		return { name: "Hobby", variant: "blue" as const };
	}
	if (planId === PLAN_IDS.PRO) {
		return { name: "Pro", variant: "green" as const };
	}
	if (planId === PLAN_IDS.SCALE) {
		return { name: "Scale", variant: "amber" as const };
	}

	return null;
};

const MENU_ITEM_BASE_CLASSES =
	"flex h-9 cursor-pointer items-center gap-2.5 px-3 text-sm text-sidebar-foreground/70 hover:bg-accent/50 hover:text-foreground";
const MENU_ITEM_ACTIVE_CLASSES =
	"bg-accent font-medium text-foreground";

function filterOrganizations<T extends { name: string; slug?: string | null }>(
	orgs: T[] | undefined,
	query: string
): T[] {
	if (!orgs?.length) {
		return [];
	}
	if (!query) {
		return orgs;
	}
	const q = query.toLowerCase();
	return orgs.filter(
		(org) =>
			org.name.toLowerCase().includes(q) || org.slug?.toLowerCase().includes(q)
	);
}

interface OrganizationSelectorTriggerProps {
	activeOrganization: {
		id?: string;
		name: string;
		slug?: string | null;
		logo?: string | null;
	} | null;
	isOpen: boolean;
	isSettingActiveOrganization: boolean;
	currentPlanId: PlanId | null;
}

function OrganizationSelectorTrigger({
	activeOrganization,
	isOpen,
	isSettingActiveOrganization,
	currentPlanId,
}: OrganizationSelectorTriggerProps) {
	const planInfo = getPlanDisplayInfo(currentPlanId);

	return (
		<div
			className={cn(
				"flex w-full items-center overflow-hidden border-b border-sidebar-border px-4 py-2.5",
				"hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
				isSettingActiveOrganization ? "cursor-not-allowed opacity-70" : "",
				isOpen ? "bg-sidebar-accent/40" : ""
			)}
		>
			<div className="flex w-full min-w-0 items-center gap-2.5">
				<div className="shrink-0">
					<Avatar className="size-7 rounded ring-1 ring-sidebar-border ring-inset">
						<AvatarImage
							alt={activeOrganization?.name ?? "Workspace"}
							className="rounded"
							src={getDicebearUrl(
								activeOrganization?.logo || activeOrganization?.id
							)}
						/>
						<AvatarFallback className="rounded bg-sidebar-accent">
							<Image
								alt={activeOrganization?.name ?? "Workspace"}
								className="rounded"
								height={28}
								src={getDicebearUrl(
									activeOrganization?.logo || activeOrganization?.id
								)}
								unoptimized
								width={28}
							/>
						</AvatarFallback>
					</Avatar>
				</div>
				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<div className="flex min-w-0 items-center gap-2">
						<span className="min-w-0 flex-1 truncate text-left font-medium text-sidebar-foreground text-sm">
							{activeOrganization?.name ?? "Select workspace"}
						</span>
						<Badge
							className="shrink-0 py-0.5 text-[10px] leading-none"
							variant={planInfo?.variant || "gray"}
						>
							{planInfo?.name || "Free"}
						</Badge>
					</div>
					<p className="truncate text-left text-sidebar-foreground/50 text-xs">
						{activeOrganization?.slug ?? "No workspace selected"}
					</p>
				</div>
				{isSettingActiveOrganization ? (
					<SpinnerGapIcon
						aria-label="Switching workspace"
						className="size-3.5 shrink-0 animate-spin text-sidebar-foreground/40"
						weight="duotone"
					/>
				) : (
					<CaretDownIcon
						className={cn(
							"size-3.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-200",
							isOpen ? "rotate-180" : ""
						)}
					/>
				)}
			</div>
		</div>
	);
}

export function OrganizationSelector() {
	const queryClient = useQueryClient();
	const { organizations, activeOrganization, isLoading } =
		useOrganizationsContext();
	const { currentPlanId } = useBillingContext();
	const [isOpen, setIsOpen] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [query, setQuery] = useState("");
	const [isSwitching, setIsSwitching] = useState(false);

	const handleSelectOrganization = async (organizationId: string) => {
		if (organizationId === activeOrganization?.id) {
			return;
		}

		setIsSwitching(true);
		setIsOpen(false);

		const { error } = await authClient.organization.setActive({
			organizationId,
		});

		if (error) {
			toast.error(error.message || "Failed to switch workspace");
			setIsSwitching(false);
			return;
		}

		await queryClient.invalidateQueries({
			queryKey: AUTH_QUERY_KEYS.activeOrganization,
		});
		queryClient.invalidateQueries();

		setIsSwitching(false);
		toast.success("Workspace updated");
	};

	const filteredOrganizations = filterOrganizations(organizations, query);

	if (isLoading) {
		return (
			<div className="flex w-full items-center border-b border-sidebar-border px-4 py-2.5">
				<div className="flex w-full min-w-0 items-center gap-2.5">
					<Skeleton className="size-7 shrink-0 rounded" />
					<div className="flex min-w-0 flex-1 flex-col items-start gap-1">
						<Skeleton className="h-3.5 w-24 rounded" />
						<Skeleton className="h-3 w-16 rounded" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<DropdownMenu
				onOpenChange={(open) => {
					setIsOpen(open);
					if (!open) {
						setQuery("");
					}
				}}
				open={isOpen}
			>
				<DropdownMenuTrigger asChild>
					<Button
						aria-expanded={isOpen}
						aria-haspopup="listbox"
						className="h-auto w-full overflow-hidden rounded-none p-0 hover:bg-transparent"
						disabled={isSwitching}
						type="button"
						variant="ghost"
					>
						<OrganizationSelectorTrigger
							activeOrganization={activeOrganization}
							currentPlanId={currentPlanId}
							isOpen={isOpen}
							isSettingActiveOrganization={isSwitching}
						/>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-64 p-1"
					sideOffset={4}
				>
					{filteredOrganizations.length > 0 && (
						<div className="flex flex-col">
							{filteredOrganizations.map((org) => (
								<DropdownMenuItem
									className={cn(
										MENU_ITEM_BASE_CLASSES,
										activeOrganization?.id === org.id &&
											MENU_ITEM_ACTIVE_CLASSES
									)}
									key={org.id}
									onClick={() => handleSelectOrganization(org.id)}
								>
									<Avatar className="size-5 ring-1 ring-black/10 ring-inset">
										<AvatarImage
											alt={org.name}
											src={getDicebearUrl(org.logo || org.id)}
										/>
										<AvatarFallback className="bg-sidebar-primary/30">
											<Image
												alt={org.name}
												className="rounded"
												height={20}
												src={getDicebearUrl(org.logo || org.id)}
												unoptimized
												width={20}
											/>
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-1 flex-col items-start overflow-hidden text-left">
										<span className="w-full truncate text-left font-medium text-sm">
											{org.name}
										</span>
										<span className="w-full truncate text-left text-sidebar-foreground/70 text-xs">
											{org.slug}
										</span>
									</div>
									{activeOrganization?.id === org.id && (
										<CheckIcon className="size-4 text-accent-foreground" />
									)}
								</DropdownMenuItem>
							))}
						</div>
					)}

					<DropdownMenuSeparator className="m-0 p-0" />
					<DropdownMenuItem
						className={MENU_ITEM_BASE_CLASSES}
						onClick={() => {
							setShowCreateDialog(true);
							setIsOpen(false);
						}}
					>
						<PlusIcon className="size-5 text-accent-foreground" />
						<span className="font-medium text-sm">Create Organization</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<CreateOrganizationDialog
				isOpen={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
			/>
		</>
	);
}
