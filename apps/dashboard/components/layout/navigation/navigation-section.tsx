"use client";

import { useFlags } from "@databuddy/sdk/react";
import { FEATURE_METADATA } from "@databuddy/shared/types/features";
import { CaretRightIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { memo, useMemo } from "react";
import { useBillingContext } from "@/components/providers/billing-provider";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
} from "@/components/ui/sidebar";
import type { useAccordionStates } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";
import { NavigationItem } from "./navigation-item";
import type { NavigationSection as NavigationSectionType } from "./types";

interface FeatureState {
	isLocked: boolean;
	lockedPlanName: string | null;
}

interface NavigationSectionProps {
	title: string;
	icon: NavigationSectionType["icon"];
	items: NavigationSectionType["items"];
	pathname: string;
	currentWebsiteId?: string | null;
	className?: string;
	accordionStates: ReturnType<typeof useAccordionStates>;
	flag?: string;
}

const buildFullPath = (basePath: string, itemHref: string) =>
	itemHref === "" ? basePath : `${basePath}${itemHref}`;

const isItemActive = (
	item: NavigationSectionType["items"][0],
	pathname: string,
	searchParams: URLSearchParams | null,
	currentWebsiteId?: string | null
): boolean => {
	if (item.rootLevel) {
		if (item.href.includes("?")) {
			const search = searchParams ? `?${searchParams.toString()}` : "";
			return `${pathname}${search}` === item.href;
		}
		return pathname === item.href;
	}

	const fullPath = (() => {
		if (pathname.startsWith("/demo")) {
			return buildFullPath(`/demo/${currentWebsiteId}`, item.href);
		}
		return buildFullPath(`/websites/${currentWebsiteId}`, item.href);
	})();

	if (item.href === "") {
		return pathname === fullPath;
	}

	return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
};

export const NavigationSection = memo(function NavigationSectionComponent({
	title,
	icon: Icon,
	items,
	pathname,
	currentWebsiteId,
	accordionStates,
	flag,
}: NavigationSectionProps) {
	const { getAccordionState, toggleAccordion } = accordionStates;
	const isExpanded = getAccordionState(title, true);
	const currentPathname = usePathname();
	const { isFeatureEnabled, isLoading } = useBillingContext();
	const { isOn } = useFlags();

	const searchParams = useMemo(() => {
		if (typeof window === "undefined") {
			return null;
		}
		return new URLSearchParams(window.location.search);
	}, [currentPathname]);

	if (flag && !isOn(flag)) {
		return null;
	}

	const visibleItems = items.filter((item) => {
		if (item.production === false && process.env.NODE_ENV === "production") {
			return false;
		}
		const isDemo = pathname.startsWith("/demo");
		if (item.hideFromDemo && isDemo) {
			return false;
		}
		if (item.showOnlyOnDemo && !isDemo) {
			return false;
		}
		if (item.flag && !isOn(item.flag)) {
			return false;
		}
		return true;
	});

	const featureStates = (() => {
		const states: Record<string, FeatureState> = {};
		if (isLoading) {
			return states;
		}

		for (const item of visibleItems) {
			if (item.gatedFeature) {
				const locked = !isFeatureEnabled(item.gatedFeature);
				states[item.name] = {
					isLocked: locked,
					lockedPlanName:
						FEATURE_METADATA[item.gatedFeature]?.minPlan?.toUpperCase() ?? null,
				};
			}
		}
		return states;
	})();

	if (visibleItems.length === 0) {
		return null;
	}

	return (
		<Collapsible
			className="group/collapsible"
			onOpenChange={() => toggleAccordion(title, true)}
			open={isExpanded}
		>
			<SidebarGroup className="px-2 py-0">
				<SidebarGroupLabel
					asChild
					className="h-7 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
				>
					<CollapsibleTrigger className="flex w-full items-center gap-1.5">
						<CaretRightIcon
							className={cn(
								"size-3 shrink-0 transition-transform duration-150",
								isExpanded ? "rotate-90" : ""
							)}
							weight="fill"
						/>
						<span className="flex-1 truncate">{title}</span>
					</CollapsibleTrigger>
				</SidebarGroupLabel>
				<CollapsibleContent>
					<SidebarMenu className="gap-0.5 py-0.5">
						{visibleItems.map((item) => {
							const state = featureStates[item.name];
							return (
								<NavigationItem
									alpha={item.alpha}
									badge={item.badge}
									currentWebsiteId={currentWebsiteId}
									disabled={item.disabled}
									domain={item.domain}
									href={item.href}
									icon={item.icon}
									isActive={isItemActive(
										item,
										pathname,
										searchParams,
										currentWebsiteId
									)}
									isExternal={item.external}
									isLocked={state?.isLocked ?? false}
									isRootLevel={!!item.rootLevel}
									key={item.name}
									lockedPlanName={state?.lockedPlanName ?? null}
									name={item.name}
									production={item.production}
									sectionName={title}
									tag={item.tag}
								/>
							);
						})}
					</SidebarMenu>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
});
