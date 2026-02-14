import type {
	AICallSpan,
	AnalyticsEvent,
	BlockedTraffic,
	CustomEvent,
	CustomOutgoingLink,
	ErrorHourlyAggregate,
	ErrorSpanRow,
	RevenueTransaction,
	UptimeMonitor,
	WebVitalsHourlyAggregate,
	WebVitalsSpan,
} from "@databuddy/db";

export const Analytics = {
	events: "analytics.events",
	error_spans: "analytics.error_spans",
	error_hourly: "analytics.error_hourly",
	web_vitals_spans: "analytics.web_vitals_spans",
	web_vitals_hourly: "analytics.web_vitals_hourly",
	custom_events: "analytics.custom_events",
	blocked_traffic: "analytics.blocked_traffic",
	outgoing_links: "analytics.outgoing_links",
	link_visits: "analytics.link_visits",
	uptime_monitor: "uptime.uptime_monitor",
	revenue: "analytics.revenue",
} as const;

export const Observability = {
	ai_call_spans: "observability.ai_call_spans",
} as const;

export type AnalyticsTable = (typeof Analytics)[keyof typeof Analytics];

export interface TableFieldsMap {
	"analytics.events": keyof AnalyticsEvent;
	"analytics.error_spans": keyof ErrorSpanRow;
	"analytics.error_hourly": keyof ErrorHourlyAggregate;
	"analytics.web_vitals_spans": keyof WebVitalsSpan;
	"analytics.web_vitals_hourly": keyof WebVitalsHourlyAggregate;
	"analytics.custom_events": keyof CustomEvent;
	"analytics.blocked_traffic": keyof BlockedTraffic;
	"analytics.outgoing_links": keyof CustomOutgoingLink;
	"analytics.revenue": keyof RevenueTransaction;
	"uptime.uptime_monitor": keyof UptimeMonitor;
	"observability.ai_call_spans": keyof AICallSpan;
}
