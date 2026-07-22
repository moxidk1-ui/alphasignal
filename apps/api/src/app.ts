import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { createLoggerOptions } from "./config/logger.js";
import { closeRedisClient } from "./config/redis.js";
import type { AppConfig } from "./config/env.js";
import { loadEnv } from "./config/env.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { registerRoutes } from "./routes/index.js";

export interface BuildAppOptions {
  config?: AppConfig;
  startBackgroundJobs?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadEnv();

  const app = Fastify({
    ajv: {
      customOptions: {
        coerceTypes: "array",
        removeAdditional: "all",
      },
    },
    disableRequestLogging: config.NODE_ENV === "test",
    logger: createLoggerOptions(config),
    trustProxy: true,
  });

  registerErrorHandler(app);

  await app.register(sensible);
  await app.register(cookie, {
    hook: "onRequest",
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", config.FRONTEND_URL],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    global: true,
    hsts: config.NODE_ENV === "production",
    referrerPolicy: {
      policy: "no-referrer",
    },
  });
  await app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || origin === config.FRONTEND_URL) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin is not allowed"), false);
    },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "AlphaSignal API",
        description: "Trading signal platform API.",
        version: "0.1.0",
      },
      servers: [
        {
          url: "http://localhost:4000",
          description: "Local development",
        },
      ],
      tags: [
        { name: "health", description: "Service health probes" },
        { name: "auth", description: "Authentication and sessions" },
        { name: "users", description: "User account operations" },
        { name: "market", description: "Quotes, candles, and instrument search" },
        { name: "signals", description: "Signal creation and lifecycle" },
        { name: "algo", description: "Automated detection configuration and review" },
        { name: "notifications", description: "In-app alert inbox" },
        { name: "providers", description: "Provider discovery and subscriptions" },
        { name: "watchlist", description: "Saved market instruments" },
        { name: "billing", description: "Stripe subscriptions and entitlements" },
        { name: "admin", description: "Platform administration" },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      deepLinking: true,
      displayRequestDuration: true,
    },
  });

  const runtime = await registerRoutes(app, config);
  if (options.startBackgroundJobs) {
    await runtime.start();
  }

  app.addHook("onClose", async () => {
    await runtime.close();
    await closeRedisClient();
  });

  return app;
}
