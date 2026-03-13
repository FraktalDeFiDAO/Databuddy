import type { Customer, Plan, Subscription } from "autumn-js";
import { useCustomer, useListPlans } from "autumn-js/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trackCancelFeedbackAction } from "../actions/cancel-feedback-action";
import type { CancelFeedback } from "../components/cancel-subscription-dialog";
import {
	balanceToFeatureUsage,
	type FeatureUsage,
	type PricingTier,
} from "../utils/feature-usage";
import { getStripeMetadata } from "../utils/stripe-metadata";

export interface Usage {
	features: FeatureUsage[];
}

export interface CancelTarget {
	id: string;
	name: string;
	currentPeriodEnd?: number;
}

export type { CancelFeedback } from "../components/cancel-subscription-dialog";
export type { CustomerWithPaymentMethod } from "../types/billing";

export function useBilling(refetch?: () => void) {
	const { data: customer, attach, updateSubscription, openCustomerPortal } =
		useCustomer({
			expand: ["invoices", "payment_method"],
		});
	const [isLoading, setIsLoading] = useState(false);
	const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);

	const handleUpgrade = async (planId: string) => {
		try {
			await attach({
				planId,
				successUrl: `${window.location.origin}/billing`,
				metadata: getStripeMetadata(),
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "An unexpected error occurred."
			);
		}
	};

	const handleCancel = async (planId: string, immediate = false) => {
		if (!customer?.id) {
			return;
		}
		setIsLoading(true);
		try {
			await updateSubscription({
				planId,
				cancelAction: immediate ? "immediately" : "end_of_period",
			});
			toast.success(
				immediate
					? "Subscription cancelled immediately."
					: "Subscription cancelled."
			);
			if (refetch) {
				setTimeout(refetch, 500);
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to cancel subscription."
			);
		} finally {
			setIsLoading(false);
		}
	};

	const getSubscriptionStatusDetails = (subscription: Subscription) => {
		if (subscription.canceledAt && subscription.currentPeriodEnd) {
			return `Access until ${dayjs(subscription.currentPeriodEnd).format("MMM D, YYYY")}`;
		}
		if (subscription.status === "scheduled") {
			return `Starts on ${dayjs(subscription.startedAt).format("MMM D, YYYY")}`;
		}
		if (subscription.currentPeriodEnd) {
			return `Renews on ${dayjs(subscription.currentPeriodEnd).format("MMM D, YYYY")}`;
		}
		return "";
	};

	const handleAttachAddOn = async (planId: string) => {
		try {
			await attach({
				planId,
				successUrl: `${window.location.origin}/billing`,
				metadata: getStripeMetadata(),
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "An unexpected error occurred."
			);
		}
	};

	return {
		isLoading,
		onUpgrade: handleUpgrade,
		onAttachAddOn: handleAttachAddOn,
		onCancel: handleCancel,
		onCancelClick: (id: string, name: string, currentPeriodEnd?: number) =>
			setCancelTarget({ id, name, currentPeriodEnd }),
		onCancelConfirm: async (immediate: boolean, feedback?: CancelFeedback) => {
			if (!cancelTarget) {
				return;
			}
			if (feedback) {
				trackCancelFeedbackAction({
					feedback,
					planId: cancelTarget.id,
					planName: cancelTarget.name,
					immediate,
				});
			}
			await handleCancel(cancelTarget.id, immediate);
			setCancelTarget(null);
		},
		onCancelDialogClose: () => setCancelTarget(null),
		onManageBilling: () =>
			openCustomerPortal({ returnUrl: `${window.location.origin}/billing` }),
		showCancelDialog: !!cancelTarget,
		cancelTarget,
		getSubscriptionStatusDetails,
	};
}

export function useBillingData() {
	const {
		data: customer,
		isLoading: isCustomerLoading,
		error: customerError,
		refetch: refetchCustomer,
	} = useCustomer({ expand: ["invoices", "payment_method"] });

	const {
		data: plans = [],
		isLoading: isPlansLoading,
		refetch: refetchPlans,
	} = useListPlans();

	const featureConfig = useMemo(() => {
		const limits: Record<string, number> = {};
		const tiers: Record<string, PricingTier[]> = {};

		const activeSubscription = customer?.subscriptions?.find(
			(s) =>
				s.status === "active" ||
				(s.canceledAt &&
					s.currentPeriodEnd &&
					dayjs(s.currentPeriodEnd).isAfter(dayjs()))
		);

		const activePlan = activeSubscription
			? plans.find((p) => p.id === activeSubscription.planId)
			: undefined;

		for (const item of activePlan?.items ?? []) {
			const featureId = item.featureId;
			if (featureId) {
				if (typeof item.included === "number") {
					limits[featureId] = item.included;
				}
				const itemTiers = (item as { tiers?: PricingTier[] }).tiers;
				if (Array.isArray(itemTiers)) {
					tiers[featureId] = itemTiers;
				}
			}
		}

		return { limits, tiers };
	}, [customer?.subscriptions, plans]);

	const usage: Usage = {
		features: customer?.balances
			? Object.values(customer.balances).map((b) =>
				balanceToFeatureUsage(
					b,
					featureConfig.limits[b.featureId],
					featureConfig.tiers[b.featureId]
				)
			)
			: [],
	};

	const refetch = () => {
		refetchCustomer();
		if (typeof refetchPlans === "function") {
			refetchPlans();
		}
	};

	return {
		plans,
		usage,
		customer,
		customerData: customer,
		isLoading: isCustomerLoading || isPlansLoading,
		error: customerError,
		refetch,
	};
}

export type { Customer, Plan };
