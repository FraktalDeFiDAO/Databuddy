"use client";

import { ArrowSquareOutIcon, LockSimpleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { NavigationItem as NavigationItemType } from "./types";

interface NavigationItemProps extends Omit<NavigationItemType, "icon"> {
	icon: NavigationItemType["icon"];
	isActive: boolean;
	isRootLevel: boolean;
	isExternal?: boolean;
	currentWebsiteId?: string | null;
	sectionName?: string;
	isLocked?: boolean;
	lockedPlanName?: string | null;
}

export function NavigationItem({
	name,
	icon: Icon,
	href,
	alpha,
	tag,
	isActive,
	isRootLevel,
	isExternal,
	production,
	currentWebsiteId,
	domain,
	disabled,
	badge,
	isLocked = false,
	lockedPlanName,
}: NavigationItemProps) {
	const pathname = usePathname();

	const fullPath = useMemo(() => {
		if (isRootLevel) {
			return href;
		}
		if (pathname.startsWith("/demo/")) {
			return href === ""
				? `/demo/${currentWebsiteId}`
				: `/demo/${currentWebsiteId}${href}`;
		}
		return `/websites/${currentWebsiteId}${href}`;
	}, [href, isRootLevel, currentWebsiteId, pathname]);

	if (production === false && process.env.NODE_ENV === "production") {
		return null;
	}

	const iconElement = domain ? (
		<FaviconImage
			className="shrink-0 rounded"
			domain={domain}
			fallbackIcon={
				<Icon aria-hidden className="size-4 shrink-0" weight="duotone" />
			}
			size={18}
		/>
	) : (
		<Icon aria-hidden className="size-4 shrink-0" weight="duotone" />
	);

	const trailingContent = (alpha || tag || badge || isExternal) && (
		<span className="ml-auto flex shrink-0 items-center gap-1">
			{alpha && (
				<span className="font-mono text-[10px] text-sidebar-foreground/40 uppercase">
					Alpha
				</span>
			)}
			{tag && (
				<span className="font-mono text-[10px] text-sidebar-foreground/40 uppercase">
					{tag}
				</span>
			)}
			{badge && (
				<span
					className={cn(
						"rounded px-1.5 py-0.5 font-medium text-[10px] leading-none",
						badge.variant === "purple" &&
							"bg-accent text-accent-foreground",
						badge.variant === "blue" &&
							"bg-accent text-accent-foreground",
						badge.variant === "green" &&
							"bg-accent text-accent-foreground",
						badge.variant === "orange" &&
							"bg-amber-500/10 text-amber-600 dark:text-amber-500",
						badge.variant === "red" &&
							"bg-destructive/10 text-destructive"
					)}
				>
					{badge.text}
				</span>
			)}
			{isExternal && (
				<ArrowSquareOutIcon
					aria-hidden
					className="size-3 text-sidebar-foreground/30"
					weight="duotone"
				/>
			)}
		</span>
	);

	if (isLocked) {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton
					className="cursor-not-allowed opacity-40"
					disabled
					size="sm"
					tooltip={
						lockedPlanName ? `Requires ${lockedPlanName} plan` : undefined
					}
				>
					{iconElement}
					<span className="truncate">{name}</span>
					<span className="ml-auto flex shrink-0 items-center gap-1">
						<LockSimpleIcon aria-hidden className="size-3" />
						{lockedPlanName && (
							<span className="font-medium text-[10px] uppercase">
								{lockedPlanName}
							</span>
						)}
					</span>
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	}

	if (disabled) {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton
					className="cursor-not-allowed opacity-30"
					disabled
					size="sm"
				>
					{iconElement}
					<span className="truncate">{name}</span>
					{trailingContent}
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	}

	const linkProps = isExternal
		? { href, target: "_blank", rel: "noopener noreferrer" }
		: { href: fullPath, prefetch: true };

	const LinkComponent = isExternal ? "a" : Link;

	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={isActive} size="sm" tooltip={name}>
				<LinkComponent
					{...linkProps}
					aria-label={`${name}${isExternal ? " (opens in new tab)" : ""}`}
					data-track="navigation-item-click"
				>
					{iconElement}
					<span className="truncate">{name}</span>
					{trailingContent}
				</LinkComponent>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}
