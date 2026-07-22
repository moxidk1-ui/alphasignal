import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { AlgoController } from "../controllers/algo.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

export async function registerAlgoRoutes(
  app: FastifyInstance,
  controller: AlgoController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  const providerRead: preHandlerHookHandler[] = [
    auth.authenticate,
    auth.requireRoles(["PROVIDER", "ADMIN"]),
    limits.byUser(policies.authenticated),
  ];
  const approval: preHandlerHookHandler[] = [
    auth.authenticate,
    auth.requireRoles(["PROVIDER", "ADMIN"]),
    limits.byUser(policies.algoApprove),
  ];

  app.get(
    "/algo/detections",
    {
      preHandler: providerRead,
      schema: { tags: ["algo"], summary: "List pending algo detections" },
    },
    controller.pending,
  );
  app.post(
    "/algo/detections/:id/approve",
    {
      preHandler: approval,
      schema: { tags: ["algo"], summary: "Publish a pending algo detection", params: detectionParams },
    },
    controller.approve,
  );
  app.post(
    "/algo/detections/:id/reject",
    {
      preHandler: approval,
      schema: { tags: ["algo"], summary: "Reject a pending algo detection", params: detectionParams },
    },
    controller.reject,
  );
  app.get(
    "/algo/config",
    {
      preHandler: providerRead,
      schema: { tags: ["algo"], summary: "Get algo scanner configuration" },
    },
    controller.config,
  );
  app.put(
    "/algo/config",
    {
      preHandler: providerRead,
      schema: {
        tags: ["algo"],
        summary: "Update algo scanner configuration",
        body: configBody,
      },
    },
    controller.updateConfig,
  );
}

const detectionParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
} as const;

const algoStrategies = [
  "ICT_SILVER_BULLET",
  "ICT_TURTLE_SOUP",
  "ICT_OB_FVG",
  "ICT_BOS_CHOCH",
  "ICT_LIQUIDITY_SWEEP",
  "WYCKOFF_SPRING",
  "WYCKOFF_UPTHRUST",
  "WYCKOFF_ACCUMULATION",
  "WYCKOFF_DISTRIBUTION",
  "MOMENTUM_EMA_CROSS",
  "MOMENTUM_RSI_DIV",
  "MOMENTUM_MACD",
  "PA_BREAKER_BLOCK",
  "PA_SUPPLY_DEMAND",
  "PA_DOUBLE_TOP_BOTTOM",
] as const;

const configBody = {
  type: "object",
  required: ["algoMode", "patternTypes", "markets", "timeframes", "minConfidence", "autoPublish", "riskRewardMin"],
  additionalProperties: false,
  properties: {
    algoMode: { type: "string", enum: ["AUTO", "APPROVAL", "DISABLED"] },
    patternTypes: { type: "array", minItems: 1, items: { type: "string", enum: algoStrategies } },
    markets: { type: "array", minItems: 1, items: { type: "string", enum: ["STOCKS", "FOREX", "CRYPTO", "FUTURES"] } },
    timeframes: { type: "array", minItems: 1, items: { type: "string", enum: ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] } },
    minConfidence: { type: "integer", minimum: 1, maximum: 100 },
    autoPublish: { type: "boolean" },
    riskRewardMin: { type: "number", minimum: 0.5, maximum: 10 },
  },
} as const;
