import type { PlanDisplay } from "@/components/providers/billing-provider";

const TIER_ORDER = ["free", "hobby", "pro", "scale"] as const;

function getScenario(
	plan: PlanDisplay,
	currentPlanId: string | null,
	hasActiveSubscription: boolean
): string {
	if (currentPlanId === plan.id && hasActiveSubscription) {
		return "active";
	}
	if (plan.freeTrial) {
		return "new";
	}
	if (!currentPlanId || currentPlanId === "free") {
		return "new";
	}
	const currentIdx = TIER_ORDER.indexOf(
		currentPlanId as (typeof TIER_ORDER)[number]
	);
	const planIdx = TIER_ORDER.indexOf(plan.id as (typeof TIER_ORDER)[number]);
	if (currentIdx < 0 || planIdx < 0) {
		return "new";
	}
	if (planIdx > currentIdx) {
		return "upgrade";
	}
	if (planIdx < currentIdx) {
		return "downgrade";
	}
	return "new";
}

function getPlanButtonContent(
	plan: PlanDisplay,
	currentPlanId: string | null,
	hasActiveSubscription: boolean
) {
	const scenario = getScenario(plan, currentPlanId, hasActiveSubscription);

	if (plan.freeTrial) {
		return { buttonText: <p>Start Free Trial</p> };
	}

	switch (scenario) {
		case "active":
			return { buttonText: <p>Current Plan</p> };
		case "upgrade":
			return { buttonText: <p>Upgrade</p> };
		case "downgrade":
			return { buttonText: <p>Downgrade</p> };
		default:
			return { buttonText: <p>Get started</p> };
	}
}

export { getPlanButtonContent };
