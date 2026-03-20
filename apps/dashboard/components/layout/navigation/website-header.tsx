import type { Website } from "@databuddy/shared/types/website";
import { CaretLeftIcon, PlanetIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Skeleton } from "@/components/ui/skeleton";

interface WebsiteHeaderProps {
	website: Website | null | undefined;
	showBackButton?: boolean;
}

export function WebsiteHeader({
	website,
	showBackButton = true,
}: WebsiteHeaderProps) {
	const displayName = website?.name || website?.domain;

	return (
		<div>
			<div className="flex min-w-0 items-center gap-3 border-b border-sidebar-border px-4 py-2.5">
				<div className="shrink-0 rounded bg-sidebar-accent p-1.5 ring-1 ring-sidebar-border/50">
					<FaviconImage
						altText={`${displayName || "Website"} favicon`}
						className="size-4"
						domain={website?.domain || ""}
						fallbackIcon={
							<PlanetIcon
								className="text-sidebar-foreground/70"
								size={16}
								weight="duotone"
							/>
						}
						size={16}
					/>
				</div>
				<div className="min-w-0 flex-1">
					{displayName ? (
						<p className="truncate font-medium text-sidebar-foreground text-sm">
							{displayName}
						</p>
					) : (
						<Skeleton className="h-4 w-32" />
					)}
					{website?.domain ? (
						<p className="truncate text-sidebar-foreground/50 text-xs">
							{website.domain}
						</p>
					) : (
						<Skeleton className="mt-0.5 h-3 w-24" />
					)}
				</div>
			</div>

			{showBackButton && (
				<Link
					className="group flex min-w-0 items-center gap-1.5 border-b border-sidebar-border px-4 py-2 text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
					href="/websites"
				>
					<CaretLeftIcon
						className="size-3 shrink-0 transition-transform group-hover:-translate-x-0.5"
						weight="fill"
					/>
					<span className="truncate text-xs font-medium">
						All websites
					</span>
				</Link>
			)}
		</div>
	);
}
