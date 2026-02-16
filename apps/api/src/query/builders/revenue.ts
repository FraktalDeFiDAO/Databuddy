import { Analytics } from "../../types/tables";
import type { Filter, SimpleQueryConfig, TimeUnit } from "../types";

/**
 * Revenue Attribution CTE Pattern
 *
 * Attribution uses a multi-level fallback approach:
 * 1. session_id match (most accurate, when available)
 * 2. anonymous_id match (fallback for transactions with tracked users)
 * 3. Time-based "last touch" attribution (fallback: attribute to the last
 *    pageview that occurred before/on the purchase date)
 *
 * Transactions without any matches are labeled "Unattributed"
 */
const ATTRIBUTION_CTE = `
	-- First touch data by session/anonymous ID
	first_touch AS (
		SELECT 
			session_id,
			anonymous_id,
			argMin(country, time) as first_country,
			argMin(region, time) as first_region,
			argMin(city, time) as first_city,
			argMin(browser_name, time) as first_browser,
			argMin(device_type, time) as first_device,
			argMin(os_name, time) as first_os,
			argMin(domain(referrer), time) as first_referrer,
			argMin(utm_source, time) as first_utm_source,
			argMin(utm_medium, time) as first_utm_medium,
			argMin(utm_campaign, time) as first_utm_campaign,
			argMin(path, time) as first_path
		FROM ${Analytics.events}
		WHERE client_id = {websiteId:String}
			AND (session_id != '' OR anonymous_id != '')
		GROUP BY session_id, anonymous_id
	),
	-- Get all revenue in the date range first
	revenue_base AS (
		SELECT 
			r.transaction_id,
			r.amount,
			r.type,
			r.anonymous_id as r_anonymous_id,
			r.session_id as r_session_id,
			r.customer_id as r_customer_id,
			r.product_id,
			r.product_name,
			r.provider,
			r.created
		FROM ${Analytics.revenue} r
		WHERE 
			(r.owner_id = {websiteId:String} OR r.website_id = {websiteId:String})
			AND r.created >= toDateTime({startDate:String})
			AND r.created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
	),
	-- Time-based fallback: last pageview on or before each transaction date
	time_based_attribution AS (
		SELECT 
			rb.transaction_id,
			argMax(e.country, e.time) as last_country,
			argMax(e.region, e.time) as last_region,
			argMax(e.city, e.time) as last_city,
			argMax(e.browser_name, e.time) as last_browser,
			argMax(e.device_type, e.time) as last_device,
			argMax(e.os_name, e.time) as last_os,
			argMax(domain(e.referrer), e.time) as last_referrer,
			argMax(e.utm_source, e.time) as last_utm_source,
			argMax(e.utm_medium, e.time) as last_utm_medium,
			argMax(e.utm_campaign, e.time) as last_utm_campaign,
			argMax(e.path, e.time) as last_path
		FROM revenue_base rb
		INNER JOIN ${Analytics.events} e 
			ON e.client_id = {websiteId:String}
			AND e.event_name = 'screen_view'
			AND e.time <= rb.created
			AND e.time >= rb.created - INTERVAL 7 DAY
		WHERE rb.r_session_id IS NULL OR rb.r_session_id = ''
		GROUP BY rb.transaction_id
	),
	revenue_attributed AS (
		SELECT 
			rb.transaction_id,
			rb.amount,
			rb.type,
			rb.r_anonymous_id,
			rb.r_session_id,
			rb.r_customer_id,
			rb.product_id,
			rb.product_name,
			rb.provider,
			rb.created,
			-- Attribution priority: session_id > anonymous_id > time-based
			CASE
				WHEN rb.r_session_id IS NOT NULL AND rb.r_session_id != '' AND ft_session.session_id IS NOT NULL
					THEN 1
				WHEN rb.r_anonymous_id IS NOT NULL AND rb.r_anonymous_id != '' AND ft_anon.anonymous_id IS NOT NULL
					THEN 1
				WHEN tba.transaction_id IS NOT NULL
					THEN 1
				ELSE 0
			END as is_attributed,
			-- Use session match > anonymous match > time-based match
			coalesce(ft_session.first_country, ft_anon.first_country, tba.last_country) as country,
			coalesce(ft_session.first_region, ft_anon.first_region, tba.last_region) as region,
			coalesce(ft_session.first_city, ft_anon.first_city, tba.last_city) as city,
			coalesce(ft_session.first_browser, ft_anon.first_browser, tba.last_browser) as browser_name,
			coalesce(ft_session.first_device, ft_anon.first_device, tba.last_device) as device_type,
			coalesce(ft_session.first_os, ft_anon.first_os, tba.last_os) as os_name,
			coalesce(ft_session.first_referrer, ft_anon.first_referrer, tba.last_referrer) as referrer_domain,
			coalesce(ft_session.first_utm_source, ft_anon.first_utm_source, tba.last_utm_source) as utm_source,
			coalesce(ft_session.first_utm_medium, ft_anon.first_utm_medium, tba.last_utm_medium) as utm_medium,
			coalesce(ft_session.first_utm_campaign, ft_anon.first_utm_campaign, tba.last_utm_campaign) as utm_campaign,
			coalesce(ft_session.first_path, ft_anon.first_path, tba.last_path) as entry_path
		FROM revenue_base rb
		-- Try session_id match first
		LEFT JOIN first_touch ft_session 
			ON rb.r_session_id = ft_session.session_id 
			AND rb.r_session_id IS NOT NULL 
			AND rb.r_session_id != ''
		-- Try anonymous_id match second
		LEFT JOIN first_touch ft_anon 
			ON rb.r_anonymous_id = ft_anon.anonymous_id 
			AND rb.r_anonymous_id IS NOT NULL 
			AND rb.r_anonymous_id != ''
			AND ft_session.session_id IS NULL
		-- Time-based fallback
		LEFT JOIN time_based_attribution tba 
			ON rb.transaction_id = tba.transaction_id
			AND ft_session.session_id IS NULL
			AND ft_anon.anonymous_id IS NULL
	)
`;

export const RevenueBuilders: Record<string, SimpleQueryConfig> = {
	revenue_overview: {
		customSql: (websiteId: string, startDate: string, endDate: string) => ({
			sql: `
				WITH ${ATTRIBUTION_CTE}
				SELECT 
					sumIf(amount, type != 'refund') as total_revenue,
					countIf(type != 'refund') as total_transactions,
					sumIf(amount, type = 'refund') as refund_amount,
					countIf(type = 'refund') as refund_count,
					sumIf(amount, type = 'subscription') as subscription_revenue,
					countIf(type = 'subscription') as subscription_count,
					sumIf(amount, type = 'sale') as sale_revenue,
					countIf(type = 'sale') as sale_count,
					uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as unique_customers,
					countIf(is_attributed = 1 AND type != 'refund') as attributed_transactions,
					sumIf(amount, is_attributed = 1 AND type != 'refund') as attributed_revenue
				FROM revenue_attributed
			`,
			params: { websiteId, startDate, endDate },
		}),
		timeField: "created",
		customizable: false,
	},

	revenue_time_series: {
		customSql: (websiteId: string, startDate: string, endDate: string) => ({
			sql: `
				WITH ${ATTRIBUTION_CTE}
				SELECT 
					toDate(created) as date,
					sumIf(amount, type != 'refund') as revenue,
					countIf(type != 'refund') as transactions,
					uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
					sumIf(amount, is_attributed = 1 AND type != 'refund') as attributed_revenue,
					countIf(is_attributed = 1 AND type != 'refund') as attributed_transactions
				FROM revenue_attributed
				GROUP BY date
				ORDER BY date ASC
			`,
			params: { websiteId, startDate, endDate },
		}),
		timeField: "created",
		customizable: false,
	},

	revenue_by_provider: {
		customSql: (websiteId: string, startDate: string, endDate: string) => ({
			sql: `
				WITH ${ATTRIBUTION_CTE}
				SELECT 
					provider as name,
					sumIf(amount, type != 'refund') as revenue,
					countIf(type != 'refund') as transactions,
					uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
					ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
				FROM revenue_attributed
				GROUP BY provider
				ORDER BY revenue DESC
			`,
			params: { websiteId, startDate, endDate },
		}),
		timeField: "created",
		customizable: false,
	},

	revenue_by_product: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 50;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						coalesce(product_name, 'Unknown') as name,
						product_id,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY product_name, product_id
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	// Attribution overview - shows attributed vs unattributed breakdown
	revenue_attribution_overview: {
		customSql: (websiteId: string, startDate: string, endDate: string) => ({
			sql: `
				WITH ${ATTRIBUTION_CTE}
				SELECT 
					CASE WHEN is_attributed = 1 THEN 'Attributed' ELSE 'Unattributed' END as name,
					sumIf(amount, type != 'refund') as revenue,
					countIf(type != 'refund') as transactions,
					uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
					ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
				FROM revenue_attributed
				GROUP BY is_attributed
				ORDER BY revenue DESC
			`,
			params: { websiteId, startDate, endDate },
		}),
		timeField: "created",
		customizable: false,
	},

	revenue_by_country: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 20;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN country = '' OR country IS NULL THEN 'Unknown'
							ELSE country 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
		plugins: {
			normalizeGeo: true,
		},
	},

	revenue_by_region: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 20;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN region = '' OR region IS NULL THEN 'Unknown'
							ELSE region 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	revenue_by_city: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 20;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN city = '' OR city IS NULL THEN 'Unknown'
							ELSE city 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	revenue_by_browser: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 10;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN browser_name = '' OR browser_name IS NULL THEN 'Unknown'
							ELSE browser_name 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	revenue_by_device: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 10;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN device_type = '' OR device_type IS NULL THEN 'Unknown'
							ELSE device_type 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	revenue_by_os: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 10;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN os_name = '' OR os_name IS NULL THEN 'Unknown'
							ELSE os_name 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	revenue_by_referrer: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 20;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE},
					referrer_agg AS (
						SELECT 
							CASE 
								WHEN is_attributed = 0 THEN 'Unattributed'
								WHEN referrer_domain = '' OR referrer_domain IS NULL THEN 'Direct'
								ELSE referrer_domain 
							END as referrer_name,
							amount,
							type,
							r_anonymous_id,
							r_customer_id,
							transaction_id
						FROM revenue_attributed
					)
					SELECT 
						referrer_name as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM referrer_agg
					GROUP BY referrer_name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	revenue_by_utm_source: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 20;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN utm_source = '' OR utm_source IS NULL THEN 'None'
							ELSE utm_source 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	revenue_by_utm_medium: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 20;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN utm_medium = '' OR utm_medium IS NULL THEN 'None'
							ELSE utm_medium 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	revenue_by_utm_campaign: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 20;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN utm_campaign = '' OR utm_campaign IS NULL THEN 'None'
							ELSE utm_campaign 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	// Revenue by entry page (first page viewed in session)
	revenue_by_entry_page: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 20;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						CASE 
							WHEN is_attributed = 0 THEN 'Unattributed'
							WHEN entry_path = '' OR entry_path IS NULL THEN 'Unknown'
							ELSE entry_path 
						END as name,
						sumIf(amount, type != 'refund') as revenue,
						countIf(type != 'refund') as transactions,
						uniq(coalesce(nullIf(trim(r_anonymous_id), ''), r_customer_id, transaction_id)) as customers,
						ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage
					FROM revenue_attributed
					GROUP BY name
					ORDER BY revenue DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
	},

	recent_transactions: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number
		) => {
			const limit = _limit ?? 50;
			return {
				sql: `
					WITH ${ATTRIBUTION_CTE}
					SELECT 
						transaction_id,
						provider,
						type,
						amount,
						r_anonymous_id as anonymous_id,
						product_name,
						created,
						is_attributed,
						CASE WHEN is_attributed = 0 THEN 'Unattributed' ELSE coalesce(nullIf(country, ''), 'Unknown') END as country,
						CASE WHEN is_attributed = 0 THEN 'Unattributed' ELSE coalesce(nullIf(browser_name, ''), 'Unknown') END as browser_name,
						CASE WHEN is_attributed = 0 THEN 'Unattributed' ELSE coalesce(nullIf(device_type, ''), 'Unknown') END as device_type,
						CASE WHEN is_attributed = 0 THEN 'Unattributed' ELSE coalesce(nullIf(referrer_domain, ''), 'Direct') END as referrer,
						CASE WHEN is_attributed = 0 THEN 'Unattributed' ELSE coalesce(nullIf(utm_source, ''), 'None') END as utm_source,
						CASE WHEN is_attributed = 0 THEN 'Unattributed' ELSE coalesce(nullIf(utm_campaign, ''), 'None') END as utm_campaign
					FROM revenue_attributed
					WHERE type != 'refund'
					ORDER BY created DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
		timeField: "created",
		customizable: true,
		plugins: {
			normalizeGeo: true,
		},
	},
};
