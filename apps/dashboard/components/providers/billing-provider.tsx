"use client";

import {
	type AiCapabilityId,
	FEATURE_METADATA,
	type FeatureId,
	type GatedFeatureId,
	getMinimumPlanForAiCapability,
	getMinimumPlanForFeature,
	getPlanCapabilities as getPlanCapabilitiesForPlan,
	isPlanAiCapabilityEnabled,
	isPlanFeatureEnabled,
	PLAN_IDS,
	type PlanCapabilities,
	type PlanId,
} from "@databuddy/shared/types/features";
import { useQuery } from "@tanstack/react-query";
import { useCustomer, useListPlans } from "autumn-js/react";
import { useParams, usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { orpc } from "@/lib/orpc";

export interface PlanDisplay {
	id: string;
	name: string;
	description?: string | null;
	price?: { amount: number; interval: string } | null;
	items: Array<{ featureId: string }>;
	addOn?: boolean;
	freeTrial?: unknown;
}

export interface BillingCustomer {
	id?: string | null;
	balances?: Record<
		string,
		{ remaining?: number; granted?: number; unlimited?: boolean }
	>;
}

export interface FeatureAccess {
	allowed: boolean;
	balance: number;
	limit: number;
	unlimited: boolean;
	usagePercent: number | null;
}

export interface GatedFeatureAccess {
	allowed: boolean;
	minPlan: PlanId | null;
	upgradeMessage: string | null;
}

export interface BillingContextValue {
	customer: BillingCustomer | null;
	plans: PlanDisplay[];
	isLoading: boolean;
	hasActiveSubscription: boolean;
	currentPlanId: PlanId | null;
	isFree: boolean;
	// Organization context - true if billing is based on org owner
	isOrganizationBilling: boolean;
	// Whether the current user can upgrade (false if viewing org and not owner)
	canUserUpgrade: boolean;
	// Usage-based features
	canUse: (featureId: FeatureId | string) => boolean;
	getUsage: (featureId: FeatureId | string) => FeatureAccess;
	getFeature: (
		featureId: FeatureId | string
	) => { remaining?: number; granted?: number; unlimited?: boolean } | null;
	// Gated features
	isFeatureEnabled: (feature: GatedFeatureId) => boolean;
	getGatedFeatureAccess: (feature: GatedFeatureId) => GatedFeatureAccess;
	getUpgradeMessage: (
		featureId: FeatureId | GatedFeatureId | string
	) => string | null;
	// AI capabilities
	isAiCapabilityEnabled: (capability: AiCapabilityId) => boolean;
	getPlanCapabilities: () => PlanCapabilities;
	refetch: () => void;
}

const BillingContext = createContext<BillingContextValue | null>(null);

interface BillingProviderProps {
	children: ReactNode;
	/** Optional website ID to get billing context for (for demos/public pages) */
	websiteId?: string;
}

export function BillingProvider({
	children,
	websiteId: propWebsiteId,
}: BillingProviderProps) {
	const params = useParams();
	const pathname = usePathname();

	const isDemoRoute = useMemo(() => pathname?.startsWith("/demo/"), [pathname]);
	const isWebsiteRoute = useMemo(
		() => pathname?.startsWith("/websites/"),
		[pathname]
	);

	const websiteId = useMemo(() => {
		if (propWebsiteId) {
			return propWebsiteId;
		}

		if (isDemoRoute || isWebsiteRoute) {
			const routeId = params?.id;
			if (typeof routeId === "string" && routeId) {
				return routeId;
			}
		}

		return;
	}, [propWebsiteId, params?.id, isDemoRoute, isWebsiteRoute]);

	const {
		data: customer,
		isLoading: isCustomerLoading,
		refetch: refetchCustomer,
	} = useCustomer();

	const {
		data: plans = [],
		isLoading: isPlansLoading,
		refetch: refetchPlans,
	} = useListPlans();

	// Get the correct billing context (handles org/website ownership)
	// Always fetch billing context - the backend handles both:
	// 1. When websiteId is provided: uses website owner's plan
	// 2. When no websiteId: uses authenticated user's/org's plan
	const {
		data: billingContext,
		isLoading: isBillingContextLoading,
		refetch: refetchBillingContext,
	} = useQuery({
		...orpc.organizations.getBillingContext.queryOptions({
			input: websiteId ? { websiteId } : undefined,
		}),
		retry: false,
		throwOnError: false,
	});

	const value = useMemo<BillingContextValue>(() => {
		const effectivePlanId = (billingContext?.planId ?? PLAN_IDS.FREE) as PlanId;
		const isOrganizationBilling = Boolean(billingContext?.isOrganization);
		const canUserUpgrade = Boolean(billingContext?.canUserUpgrade ?? true);

		const currentPlanId = effectivePlanId;
		const currentPlan = plans?.find((p) => p.id === currentPlanId);
		const isFree =
			currentPlanId === PLAN_IDS.FREE ||
			currentPlan?.price === null ||
			!billingContext?.hasActiveSubscription;

		const getFeature = (
			id: FeatureId | string
		): { remaining?: number; granted?: number; unlimited?: boolean } | null =>
			customer?.balances?.[id] ?? null;

		const canUse = (id: FeatureId | string): boolean => {
			const balance = customer?.balances?.[id];
			if (!balance) {
				return false;
			}
			if (balance.unlimited) {
				return true;
			}
			return (balance.remaining ?? 0) > 0;
		};

		const getUsage = (id: FeatureId | string): FeatureAccess => {
			const balance = customer?.balances?.[id];
			if (!balance) {
				return {
					allowed: false,
					balance: 0,
					limit: 0,
					unlimited: false,
					usagePercent: null,
				};
			}

			const remaining = balance.remaining ?? 0;
			const limit = balance.granted ?? 0;
			const unlimited = balance.unlimited ?? false;
			const usagePercent =
				!unlimited && limit > 0
					? Math.round(((limit - remaining) / limit) * 100)
					: null;

			return {
				allowed: unlimited || remaining > 0,
				balance: remaining,
				limit,
				unlimited,
				usagePercent,
			};
		};

		const isFeatureEnabled = (feature: GatedFeatureId): boolean =>
			isPlanFeatureEnabled(currentPlanId, feature);

		const getGatedFeatureAccess = (
			feature: GatedFeatureId
		): GatedFeatureAccess => {
			const allowed = isPlanFeatureEnabled(currentPlanId, feature);
			return {
				allowed,
				minPlan: getMinimumPlanForFeature(feature),
				upgradeMessage: allowed
					? null
					: (FEATURE_METADATA[feature]?.upgradeMessage ?? null),
			};
		};

		const getUpgradeMessage = (
			id: FeatureId | GatedFeatureId | string
		): string | null =>
			FEATURE_METADATA[id as FeatureId | GatedFeatureId]?.upgradeMessage ??
			null;

		const isAiCapabilityEnabled = (capability: AiCapabilityId): boolean =>
			isPlanAiCapabilityEnabled(currentPlanId, capability);

		const getPlanCapabilities = (): PlanCapabilities =>
			getPlanCapabilitiesForPlan(currentPlanId);

		const refetch = () => {
			refetchCustomer();
			refetchBillingContext();
			if (typeof refetchPlans === "function") {
				refetchPlans();
			}
		};

		return {
			customer: customer ?? null,
			plans: plans ?? [],
			isLoading: isCustomerLoading || isPlansLoading || isBillingContextLoading,
			hasActiveSubscription: Boolean(billingContext?.hasActiveSubscription),
			currentPlanId,
			isFree,
			isOrganizationBilling,
			canUserUpgrade,
			canUse,
			getUsage,
			getFeature,
			isFeatureEnabled,
			getGatedFeatureAccess,
			getUpgradeMessage,
			isAiCapabilityEnabled,
			getPlanCapabilities,
			refetch,
		};
	}, [
		customer,
		plans,
		billingContext,
		isCustomerLoading,
		isPlansLoading,
		isBillingContextLoading,
		refetchCustomer,
		refetchBillingContext,
		refetchPlans,
	]);

	return (
		<BillingContext.Provider value={value}>{children}</BillingContext.Provider>
	);
}

export function useBillingContext(): BillingContextValue {
	const context = useContext(BillingContext);
	if (!context) {
		throw new Error("useBillingContext must be used within BillingProvider");
	}
	return context;
}

export function useUsageFeature(featureId: FeatureId) {
	const { canUse, getUsage, getUpgradeMessage, isFree } = useBillingContext();
	return {
		...getUsage(featureId),
		canUse: canUse(featureId),
		upgradeMessage: getUpgradeMessage(featureId),
		isFree,
	};
}

export function useGatedFeature(feature: GatedFeatureId) {
	const { isFeatureEnabled, getGatedFeatureAccess, currentPlanId, isFree } =
		useBillingContext();
	return {
		...getGatedFeatureAccess(feature),
		isEnabled: isFeatureEnabled(feature),
		currentPlanId,
		isFree,
	};
}

export function useAiCapability(capability: AiCapabilityId) {
	const { isAiCapabilityEnabled, currentPlanId, isFree, canUserUpgrade } =
		useBillingContext();
	const isEnabled = isAiCapabilityEnabled(capability);
	const minPlan = getMinimumPlanForAiCapability(capability);

	return {
		isEnabled,
		currentPlanId,
		isFree,
		minPlan,
		canUserUpgrade,
	};
}
