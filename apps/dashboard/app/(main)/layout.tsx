import { auth } from "@databuddy/auth";
import { AutumnProvider } from "autumn-js/react";
import { headers } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BillingProvider } from "@/components/providers/billing-provider";
import { CommandSearchProvider } from "@/components/ui/command-search";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const headersList = await headers();
	const session = await auth.api.getSession({
		headers: headersList,
	});

	const user = session?.user || {
		name: null,
		email: null,
		image: null,
	};

	return (
		<AutumnProvider
			backendUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
		>
			<BillingProvider>
				<CommandSearchProvider>
					<SidebarProvider>
						<AppSidebar user={user} />
						<SidebarInset>
							<div className="flex-1 overflow-y-auto overflow-x-hidden">
								{children}
							</div>
						</SidebarInset>
					</SidebarProvider>
				</CommandSearchProvider>
			</BillingProvider>
		</AutumnProvider>
	);
}
