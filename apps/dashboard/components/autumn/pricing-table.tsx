"use client";

import {
	FEATURE_METADATA,
	type FeatureLimit,
	type GatedFeatureId,
	HIDDEN_PRICING_FEATURES,
	PLAN_FEATURE_LIMITS,
	PLAN_IDS,
	type PlanId,
} from "@databuddy/shared/types/features";
import {
	ArrowDownIcon,
	CheckIcon,
	CircleNotchIcon,
	CrownIcon,
	RocketLaunchIcon,
	SparkleIcon,
	StarIcon,
} from "@phosphor-icons/react";
import type { PlanDisplay } from "@/components/providers/billing-provider";

type PlanItem = PlanDisplay["items"][number];

import { useCustomer } from "autumn-js/react";
import { createContext, useContext, useState } from "react";
import { PricingTiersTooltip } from "@/app/(main)/billing/components/pricing-tiers-tooltip";
import { useBillingContext } from "@/components/providers/billing-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { getPlanButtonContent } from "@/lib/autumn/pricing-table-content";
import { cn } from "@/lib/utils";

const PLAN_ICONS: Record<string, typeof CrownIcon> = {
	free: SparkleIcon,
	hobby: RocketLaunchIcon,
	pro: StarIcon,
	scale: CrownIcon,
	buddy: CrownIcon,
};

function getPlanIcon(planId: string) {
	return PLAN_ICONS[planId] || CrownIcon;
}

function getNewFeaturesForPlan(planId: string): Array<{
	feature: GatedFeatureId;
	limit: FeatureLimit;
	isNew: boolean;
}> {
	const plan = planId as PlanId;
	const planLimits = PLAN_FEATURE_LIMITS[plan];
	if (!planLimits) {
		return [];
	}

	if (plan === PLAN_IDS.FREE) {
		return Object.entries(planLimits)
			.filter(([feature, limit]) => {
				// Filter out hidden features
				if (HIDDEN_PRICING_FEATURES.includes(feature as GatedFeatureId)) {
					return false;
				}
				return limit !== false;
			})
			.map(([feature, limit]) => ({
				feature: feature as GatedFeatureId,
				limit,
				isNew: true,
			}));
	}

	const tierOrder: PlanId[] = [
		PLAN_IDS.FREE,
		PLAN_IDS.HOBBY,
		PLAN_IDS.PRO,
		PLAN_IDS.SCALE,
	];
	const currentIndex = tierOrder.indexOf(plan);
	const previousPlan = tierOrder[currentIndex - 1];
	const previousLimits = PLAN_FEATURE_LIMITS[previousPlan] ?? {};

	return Object.entries(planLimits)
		.filter(([feature, limit]) => {
			// Filter out hidden features
			if (HIDDEN_PRICING_FEATURES.includes(feature as GatedFeatureId)) {
				return false;
			}
			if (limit === false) {
				return false;
			}
			const previousLimit = previousLimits[feature as GatedFeatureId];
			// Show if: newly enabled, or limit increased
			if (previousLimit === false) {
				return true;
			}
			if (limit === "unlimited" && previousLimit !== "unlimited") {
				return true;
			}
			if (
				typeof limit === "number" &&
				typeof previousLimit === "number" &&
				limit > previousLimit
			) {
				return true;
			}
			return false;
		})
		.map(([feature, limit]) => ({
			feature: feature as GatedFeatureId,
			limit,
			isNew:
				previousLimits[feature as GatedFeatureId] === false ||
				previousLimits[feature as GatedFeatureId] === undefined,
		}));
}

function PricingTableSkeleton() {
	return (
		<div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{[1, 2, 3].map((i) => (
				<div
					className="flex h-96 w-full animate-pulse flex-col rounded border p-5"
					key={i}
				>
					<div className="mb-4 flex items-center gap-3">
						<div className="h-11 w-11 rounded border bg-muted" />
						<div className="flex-1 space-y-2">
							<div className="h-5 w-24 rounded bg-muted" />
							<div className="h-3 w-32 rounded bg-muted" />
						</div>
					</div>
					<div className="mb-4 border-y py-4">
						<div className="h-7 w-20 rounded bg-muted" />
					</div>
					<div className="flex-1 space-y-3">
						{[1, 2, 3, 4].map((j) => (
							<div className="flex items-center gap-2" key={j}>
								<div className="size-4 rounded bg-muted" />
								<div className="h-4 flex-1 rounded bg-muted" />
							</div>
						))}
					</div>
					<div className="mt-4 h-10 w-full rounded bg-muted" />
				</div>
			))}
		</div>
	);
}

const PricingTableContext = createContext<{
	plans: PlanDisplay[];
	selectedPlan?: string | null;
	currentPlanId: PlanId | null;
	hasActiveSubscription: boolean;
}>({
	plans: [],
	selectedPlan: null,
	currentPlanId: null,
	hasActiveSubscription: false,
});

function usePricingTableCtx() {
	return useContext(PricingTableContext);
}

export default function PricingTable({
	selectedPlan,
}: {
	selectedPlan?: string | null;
}) {
	const { attach } = useCustomer();
	const { plans, isLoading, currentPlanId, hasActiveSubscription } =
		useBillingContext();

	if (isLoading) {
		return (
			<div className="flex flex-col items-center">
				<PricingTableSkeleton />
				<span className="mt-4 text-muted-foreground text-sm">
					Loading plans…
				</span>
			</div>
		);
	}

	const filteredPlans =
		plans?.filter((p) => ["hobby", "pro", "scale"].includes(p.id)) ?? [];

	return (
		<PricingTableContext.Provider
			value={{
				plans: plans ?? [],
				selectedPlan,
				currentPlanId: currentPlanId ?? null,
				hasActiveSubscription: hasActiveSubscription ?? false,
			}}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{filteredPlans.map((plan) => (
					<PricingCard
						attachAction={async () => {
							await attach({
								planId: plan.id,
								successUrl: `${window.location.origin}/billing`,
								...(plan.id === "hobby" && { reward: "SAVE80" }),
							});
						}}
						isSelected={selectedPlan === plan.id}
						key={plan.id}
						planId={plan.id}
					/>
				))}
			</div>
		</PricingTableContext.Provider>
	);
}

function DowngradeConfirmDialog({
	isOpen,
	onClose,
	onConfirm,
	productName,
	currentProductName,
}: {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	productName: string;
	currentProductName?: string;
}) {
	const [isConfirming, setIsConfirming] = useState(false);

	const handleConfirm = async () => {
		setIsConfirming(true);
		try {
			await onConfirm();
		} catch {
			// Error handled by onConfirm
		}
		setIsConfirming(false);
	};

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Downgrade to {productName}</DialogTitle>
					<DialogDescription>
						{currentProductName
							? `Are you sure you want to downgrade from ${currentProductName} to ${productName}? Your current subscription will be cancelled and the new plan will begin at the end of your current billing period.`
							: `Are you sure you want to downgrade to ${productName}? Your current subscription will be cancelled and the new plan will begin at the end of your current billing period.`}
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-3 py-2">
					<div className="flex size-10 shrink-0 items-center justify-center border border-amber-500/20 bg-amber-500/10">
						<ArrowDownIcon
							className="text-amber-600 dark:text-amber-400"
							size={18}
							weight="duotone"
						/>
					</div>
					<p className="text-foreground text-sm">
						You may lose access to features included in your current plan.
					</p>
				</div>
				<DialogFooter>
					<Button disabled={isConfirming} onClick={onClose} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={isConfirming}
						onClick={handleConfirm}
						variant="default"
					>
						{isConfirming ? "Confirming..." : "Confirm Downgrade"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const TIER_ORDER: PlanId[] = [
	PLAN_IDS.FREE,
	PLAN_IDS.HOBBY,
	PLAN_IDS.PRO,
	PLAN_IDS.SCALE,
];

function getPlanScenario(
	planId: string,
	currentPlanId: PlanId | null,
	hasActiveSubscription: boolean
): "active" | "scheduled" | "upgrade" | "downgrade" | "new" {
	if (!currentPlanId || currentPlanId === PLAN_IDS.FREE) {
		return hasActiveSubscription && currentPlanId === planId ? "active" : "new";
	}
	if (currentPlanId === planId) {
		return "active";
	}
	const currentIdx = TIER_ORDER.indexOf(currentPlanId);
	const planIdx = TIER_ORDER.indexOf(planId as PlanId);
	if (planIdx > currentIdx) {
		return "upgrade";
	}
	if (planIdx < currentIdx && planIdx >= 0) {
		return "downgrade";
	}
	return "new";
}

function PricingCard({
	planId,
	className,
	attachAction,
	isSelected = false,
}: {
	planId: string;
	className?: string;
	attachAction?: () => Promise<void>;
	isSelected?: boolean;
}) {
	const { plans, selectedPlan, currentPlanId, hasActiveSubscription } =
		usePricingTableCtx();
	const { attach } = useCustomer();
	const [showDowngradeDialog, setShowDowngradeDialog] = useState(false);
	const [isAttaching, setIsAttaching] = useState(false);
	const plan = plans.find((p) => p.id === planId);

	if (!plan) {
		return null;
	}

	const scenario = getPlanScenario(
		plan.id,
		currentPlanId,
		hasActiveSubscription
	);
	const { buttonText: defaultButtonText } = getPlanButtonContent(
		plan,
		currentPlanId,
		hasActiveSubscription
	);
	const isRecommended = plan.id === "pro";
	const Icon = getPlanIcon(plan.id);
	const isDowngrade = scenario === "downgrade";
	const isDisabled = scenario === "active" || scenario === "scheduled";

	const currentPlan = plans.find(
		(p) =>
			getPlanScenario(p.id, currentPlanId, hasActiveSubscription) ===
				"active" ||
			getPlanScenario(p.id, currentPlanId, hasActiveSubscription) ===
				"scheduled"
	);
	const currentPlanName = currentPlan?.name ?? "";

	const buttonText =
		selectedPlan === planId ? (
			<span className="font-semibold">Complete Purchase →</span>
		) : (
			defaultButtonText
		);

	const handleUpgradeClick = async () => {
		if (isDowngrade) {
			setShowDowngradeDialog(true);
			return;
		}

		setIsAttaching(true);
		try {
			await attachAction?.();
		} catch {
			// Error handled by attachAction
		}
		setIsAttaching(false);
	};

	const mainPrice = plan.price
		? {
				primary_text: `$${plan.price.amount}/${plan.price.interval}`,
				secondary_text: "",
			}
		: { primary_text: "Free", secondary_text: "forever" };

	const supportLevels: Record<string, string> = {
		free: "Community Support",
		hobby: "Email Support",
		pro: "Priority Email Support",
		scale: "Priority Email + Slack Support",
		buddy: "Priority Email + Slack Support",
	};

	const extraFeatures = ["scale", "buddy"].includes(plan.id)
		? [
				{ primaryText: "White Glove Onboarding" },
				{ primaryText: "Beta/Early Access" },
			]
		: [];

	const supportItem = supportLevels[plan.id]
		? { primaryText: supportLevels[plan.id] }
		: null;

	const billingItems = [
		...(plan.price ? plan.items : plan.items),
		...extraFeatures,
		...(supportItem ? [supportItem] : []),
	];

	const newGatedFeatures = getNewFeaturesForPlan(plan.id);

	function getItemKey(
		item: PlanItem | { primaryText: string },
		idx: number
	): string {
		if ("featureId" in item) {
			return item.featureId;
		}
		return `extra-${idx}-${item.primaryText}`;
	}

	return (
		<div
			className={cn(
				"relative flex flex-col rounded border bg-card",
				isRecommended && "border-primary",
				isSelected && "border-primary ring-2 ring-primary/20",
				className
			)}
		>
			{isRecommended && (
				<Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
					<StarIcon className="mr-1" size={12} weight="fill" />
					Recommended
				</Badge>
			)}

			<div className="flex items-center gap-3 p-5 pb-4">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-accent">
					<Icon className="text-accent-foreground" size={16} weight="duotone" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate font-semibold">{plan.name}</h3>
						{isSelected && (
							<Badge className="shrink-0" variant="secondary">
								Selected
							</Badge>
						)}
					</div>
					{plan.description && (
						<p className="truncate text-muted-foreground text-sm">
							{plan.description}
						</p>
					)}
				</div>
			</div>

			<div className="dotted-bg border-y bg-accent px-5 py-4">
				{plan.id === "hobby" ? (
					<div className="flex flex-col gap-1">
						<div className="flex items-baseline gap-1">
							<span className="font-semibold text-2xl">$2</span>
							<span className="text-muted-foreground text-sm">first month</span>
						</div>
						<span className="text-muted-foreground text-xs">
							then $10/month
						</span>
					</div>
				) : (
					<div className="flex items-baseline gap-1">
						<span className="font-semibold text-2xl">
							{mainPrice?.primary_text}
						</span>
						{mainPrice?.secondary_text && (
							<span className="text-muted-foreground text-sm">
								{mainPrice.secondary_text}
							</span>
						)}
					</div>
				)}
			</div>

			<div className="flex-1 p-5">
				{/* Billing features (usage limits) */}
				<div className="space-y-2.5">
					{billingItems.map((item, idx) => (
						<FeatureItem item={item} key={getItemKey(item, idx)} />
					))}
				</div>

				{/* Gated features new to this plan */}
				{newGatedFeatures.length > 0 && (
					<div className="mt-4 space-y-2.5 border-t pt-4">
						<span className="text-muted-foreground text-xs uppercase">
							Features Included
						</span>
						{newGatedFeatures.map(({ feature, limit, isNew }) => {
							const meta = FEATURE_METADATA[feature];
							return (
								<GatedFeatureItem
									isNew={isNew}
									key={feature}
									limit={limit}
									name={meta?.name ?? feature}
									unit={meta?.unit}
								/>
							);
						})}
					</div>
				)}
			</div>

			<div className="p-5 pt-0">
				<Button
					className="w-full"
					disabled={isDisabled || isAttaching}
					onClick={handleUpgradeClick}
					variant={isRecommended ? "default" : "secondary"}
				>
					{isAttaching ? (
						<CircleNotchIcon className="size-4 animate-spin" />
					) : (
						buttonText
					)}
				</Button>
			</div>

			<DowngradeConfirmDialog
				currentProductName={currentPlanName}
				isOpen={showDowngradeDialog}
				onClose={() => setShowDowngradeDialog(false)}
				onConfirm={async () => {
					setShowDowngradeDialog(false);
					setIsAttaching(true);
					try {
						await attach({
							planId: plan.id,
							successUrl: `${window.location.origin}/billing`,
							...(plan.id === "hobby" && { reward: "SAVE80" }),
						});
					} catch {
						// Error handled by attach
					}
					setIsAttaching(false);
				}}
				productName={plan.name}
			/>
		</div>
	);
}

type BillingItem = PlanItem | { primaryText: string };

function FeatureItem({ item }: { item: BillingItem }) {
	if ("primaryText" in item) {
		return (
			<div className="flex items-start gap-2 text-sm">
				<CheckIcon
					className="mt-0.5 size-4 shrink-0 text-accent-foreground"
					weight="bold"
				/>
				<span>{item.primaryText}</span>
			</div>
		);
	}

	const meta = FEATURE_METADATA[item.featureId as GatedFeatureId];
	const primaryText = meta?.name ?? item.featureId;
	const planItem = item as PlanItem & {
		tiers?: { to: number | "inf"; amount: number }[];
	};
	const hasTiers = planItem.tiers && planItem.tiers.length > 0;
	const firstPaidTier =
		hasTiers && planItem.tiers
			? planItem.tiers.find((t: { amount: number }) => t.amount > 0)
			: undefined;
	const secondaryText = firstPaidTier
		? `then $${firstPaidTier.amount.toFixed(6)}/event`
		: hasTiers && planItem.tiers
			? "Included"
			: null;

	return (
		<div className="flex items-start gap-2 text-sm">
			<CheckIcon
				className="mt-0.5 size-4 shrink-0 text-accent-foreground"
				weight="bold"
			/>
			<div className="flex flex-col">
				<span>{primaryText}</span>
				{secondaryText && (
					<div className="flex items-center gap-1">
						<span className="text-muted-foreground text-xs">
							{secondaryText}
						</span>
						{hasTiers && planItem.tiers && (
							<PricingTiersTooltip showText={false} tiers={planItem.tiers} />
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function GatedFeatureItem({
	name,
	limit,
	unit,
	isNew,
}: {
	name: string;
	limit: FeatureLimit;
	unit?: string;
	isNew?: boolean;
}) {
	const getLimitText = () => {
		if (limit === "unlimited") {
			return "Unlimited";
		}
		if (typeof limit === "number") {
			if (unit) {
				return `Up to ${limit.toLocaleString()} ${unit}`;
			}
			return `Up to ${limit.toLocaleString()}`;
		}
		return null;
	};

	const limitText = getLimitText();

	return (
		<div className="flex items-start gap-2 text-sm">
			<CheckIcon
				className="mt-0.5 size-4 shrink-0 text-accent-foreground"
				weight="bold"
			/>
			<div className="flex flex-col">
				<div className="flex items-center gap-2">
					<span>{name}</span>
					{isNew && (
						<Badge className="bg-primary/10 text-primary text-xs">New</Badge>
					)}
				</div>
				{limitText && (
					<span className="text-muted-foreground text-xs">{limitText}</span>
				)}
			</div>
		</div>
	);
}

export { PricingCard, FeatureItem as PricingFeatureItem };
