"use client";

import { AutumnProvider } from "autumn-js/react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BillingProvider } from "@/components/providers/billing-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

function DemoLayoutContent({ children }: { children: React.ReactNode }) {
	const [isEmbed] = useQueryState("embed", parseAsBoolean.withDefault(false));

	if (isEmbed) {
		return (
			<div className="h-dvh overflow-hidden text-foreground">
				<div className="h-dvh overflow-y-auto overflow-x-hidden">
					{children}
				</div>
			</div>
		);
	}

	return (
		<SidebarProvider>
			<AppSidebar user={null} />
			<SidebarInset>
				<div className="flex-1 overflow-y-auto overflow-x-hidden">
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function DemoLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AutumnProvider
			backendUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
		>
			<BillingProvider>
				<DemoLayoutContent>{children}</DemoLayoutContent>
			</BillingProvider>
		</AutumnProvider>
	);
}
