import "./polyfills/compression";

import {
	basketLoggerDrain,
	enrichBasketWideEvent,
	flushBatchedAxiomDrain,
} from "@lib/evlog-basket";
import { disconnectProducer } from "@lib/producer";
import { buildBasketErrorPayload } from "@lib/structured-errors";
import { captureError } from "@lib/tracing";
import basketRouter from "@routes/basket";
import llmRouter from "@routes/llm";
import { trackRoute } from "@routes/track";
import { paddleWebhook } from "@routes/webhooks/paddle";
import { stripeWebhook } from "@routes/webhooks/stripe";
import { closeGeoIPReader } from "@utils/ip-geo";
import { Elysia } from "elysia";
import { initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";

initLogger({
	env: { service: "basket" },
	drain: basketLoggerDrain,
	sampling: {
		rates: { info: 20, warn: 50, debug: 5 },
		keep: [{ status: 400 }, { duration: 1500 }],
	},
});

process.on("unhandledRejection", (reason, _promise) => {
	captureError(reason);
	log.error({
		process: "unhandledRejection",
		reason: reason instanceof Error ? reason.message : String(reason),
	});
});

process.on("uncaughtException", (error) => {
	captureError(error);
	log.error({
		process: "uncaughtException",
		error: error instanceof Error ? error.message : String(error),
	});
});

process.on("SIGTERM", async () => {
	log.info("lifecycle", "SIGTERM received, shutting down gracefully");
	await flushBatchedAxiomDrain().catch((error) =>
		log.error({
			lifecycle: "drainFlush",
			error: error instanceof Error ? error.message : String(error),
		})
	);
	await disconnectProducer().catch((error) =>
		log.error({
			lifecycle: "shutdown",
			error: error instanceof Error ? error.message : String(error),
		})
	);
	closeGeoIPReader();
	process.exit(0);
});

process.on("SIGINT", async () => {
	log.info("lifecycle", "SIGINT received, shutting down gracefully");
	await flushBatchedAxiomDrain().catch((error) =>
		log.error({
			lifecycle: "drainFlush",
			error: error instanceof Error ? error.message : String(error),
		})
	);
	await disconnectProducer().catch((error) =>
		log.error({
			lifecycle: "shutdown",
			error: error instanceof Error ? error.message : String(error),
		})
	);
	closeGeoIPReader();
	process.exit(0);
});

const app = new Elysia()
	.use(
		evlog({
			enrich: enrichBasketWideEvent,
		})
	)
	.onBeforeHandle(function handleCors({ request, set }) {
		const origin = request.headers.get("origin");
		if (origin) {
			set.headers ??= {};
			set.headers["Access-Control-Allow-Origin"] = origin;
			set.headers["Access-Control-Allow-Methods"] =
				"POST, GET, OPTIONS, PUT, DELETE";
			set.headers["Access-Control-Allow-Headers"] =
				"Content-Type, Authorization, X-Requested-With, databuddy-client-id, databuddy-sdk-name, databuddy-sdk-version";
			set.headers["Access-Control-Allow-Credentials"] = "true";
		}
	})
	.onError(function handleError({ error, code }) {
		if (code === "NOT_FOUND") {
			return new Response(null, { status: 404 });
		}

		captureError(error);

		const { status, payload } = buildBasketErrorPayload(error, {
			elysiaCode: code ?? "INTERNAL_SERVER_ERROR",
		});

		return new Response(JSON.stringify(payload), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	})
	.options("*", () => new Response(null, { status: 204 }))
	.use(basketRouter)
	.use(llmRouter)
	.use(trackRoute)
	.use(stripeWebhook)
	.use(paddleWebhook)
	.get("/health", function healthCheck() {
		return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
	});

const port = process.env.PORT || 4000;

export default {
	fetch: app.fetch,
	port,
};
