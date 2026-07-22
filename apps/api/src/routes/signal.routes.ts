import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { SignalController } from "../controllers/signal.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

const providerRoles = ["PROVIDER", "ADMIN"] as const;
const idParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
} as const;
const jobParams = {
  type: "object",
  required: ["jobId"],
  additionalProperties: false,
  properties: { jobId: { type: "string", minLength: 1, maxLength: 128 } },
} as const;

export async function registerSignalRoutes(
  app: FastifyInstance,
  controller: SignalController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  const read = [auth.authenticate, limits.byUser(policies.signalsRead)];
  const providerWrite: preHandlerHookHandler[] = [
    auth.authenticate,
    auth.requireRoles([...providerRoles]),
    limits.byUser(policies.signalsWrite),
  ];
  const authenticated: preHandlerHookHandler[] = [auth.authenticate];

  app.get(
    "/signals",
    {
      preHandler: read,
      schema: {
        tags: ["signals"],
        summary: "List visible signals",
        querystring: signalQuerystring,
      },
    },
    controller.list,
  );

  app.post(
    "/signals",
    {
      preHandler: providerWrite,
      schema: {
        tags: ["signals"],
        summary: "Create a manual or AI-assisted signal",
        body: createSignalBody,
      },
    },
    controller.create,
  );

  app.post(
    "/signals/analyze",
    {
      preHandler: [...authenticated, limits.byAnalysisPlan()],
      schema: {
        tags: ["signals"],
        summary: "Queue AI-hybrid signal analysis",
        body: analysisBody,
      },
    },
    controller.analyze,
  );

  app.get(
    "/signals/analyze/:jobId",
    {
      preHandler: authenticated,
      schema: {
        tags: ["signals"],
        summary: "Poll AI-hybrid analysis status",
        params: jobParams,
      },
    },
    controller.analysisStatus,
  );

  app.get(
    "/signals/:id",
    {
      preHandler: read,
      schema: { tags: ["signals"], summary: "Get a signal", params: idParams },
    },
    controller.get,
  );

  app.patch(
    "/signals/:id",
    {
      preHandler: providerWrite,
      schema: {
        tags: ["signals"],
        summary: "Edit a draft or pending algo signal",
        params: idParams,
        body: updateSignalBody,
      },
    },
    controller.update,
  );

  app.post(
    "/signals/:id/close",
    {
      preHandler: providerWrite,
      schema: {
        tags: ["signals"],
        summary: "Close a published signal",
        params: idParams,
        body: {
          type: "object",
          required: ["result", "pnlPercent"],
          additionalProperties: false,
          properties: {
            result: { type: "string", enum: ["WIN", "LOSS", "BREAKEVEN"] },
            pnlPercent: { type: "number", minimum: -100, maximum: 10_000 },
          },
        },
      },
    },
    controller.close,
  );

  app.delete(
    "/signals/:id",
    {
      preHandler: providerWrite,
      schema: { tags: ["signals"], summary: "Delete a draft signal", params: idParams },
    },
    controller.delete,
  );
}

const marketEnum = ["STOCKS", "FOREX", "CRYPTO", "FUTURES"] as const;
const timeframeEnum = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as const;
const directionEnum = ["LONG", "SHORT"] as const;
const strategyEnum = [
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
  "AI_HYBRID",
  "MANUAL",
  "CUSTOM",
] as const;

const createSignalBody = {
  type: "object",
  required: [
    "ticker",
    "market",
    "direction",
    "entryPrice",
    "stopLoss",
    "takeProfit1",
    "takeProfit2",
    "takeProfit3",
    "timeframe",
    "strategy",
    "confidence",
    "rationale",
    "source",
    "riskRewardRatio",
  ],
  additionalProperties: false,
  properties: {
    ticker: { type: "string", minLength: 1, maxLength: 24 },
    market: { type: "string", enum: marketEnum },
    direction: { type: "string", enum: directionEnum },
    entryPrice: { type: "number", exclusiveMinimum: 0 },
    stopLoss: { type: "number", exclusiveMinimum: 0 },
    takeProfit1: { type: "number", exclusiveMinimum: 0 },
    takeProfit2: { type: "number", exclusiveMinimum: 0 },
    takeProfit3: { type: "number", exclusiveMinimum: 0 },
    timeframe: { type: "string", enum: timeframeEnum },
    strategy: { type: "string", enum: strategyEnum },
    confidence: { type: "integer", minimum: 1, maximum: 100 },
    rationale: { type: "string", minLength: 10, maxLength: 4000 },
    keyLevels: { type: "object", additionalProperties: true },
    source: { type: "string", enum: ["AI_HYBRID", "MANUAL"] },
    status: { type: "string", enum: ["DRAFT", "PUBLISHED"], default: "DRAFT" },
    riskRewardRatio: { type: "number", exclusiveMinimum: 0 },
  },
} as const;

const analysisBody = {
  type: "object",
  required: ["ticker", "market", "timeframe"],
  additionalProperties: false,
  properties: {
    ticker: { type: "string", minLength: 1, maxLength: 24 },
    market: { type: "string", enum: marketEnum },
    timeframe: { type: "string", enum: timeframeEnum },
  },
} as const;

const updateSignalBody = {
  type: "object",
  required: [],
  minProperties: 1,
  additionalProperties: false,
  properties: {
    ticker: createSignalBody.properties.ticker,
    market: createSignalBody.properties.market,
    direction: createSignalBody.properties.direction,
    entryPrice: createSignalBody.properties.entryPrice,
    stopLoss: createSignalBody.properties.stopLoss,
    takeProfit1: createSignalBody.properties.takeProfit1,
    takeProfit2: createSignalBody.properties.takeProfit2,
    takeProfit3: createSignalBody.properties.takeProfit3,
    timeframe: createSignalBody.properties.timeframe,
    strategy: createSignalBody.properties.strategy,
    confidence: createSignalBody.properties.confidence,
    rationale: createSignalBody.properties.rationale,
    keyLevels: createSignalBody.properties.keyLevels,
    status: createSignalBody.properties.status,
    riskRewardRatio: createSignalBody.properties.riskRewardRatio,
  },
} as const;

const signalQuerystring = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    ticker: { type: "string", minLength: 1, maxLength: 24 },
    market: { type: "string", enum: marketEnum },
    timeframe: { type: "string", enum: timeframeEnum },
    strategy: { type: "string", enum: strategyEnum },
    source: { type: "string", enum: ["ALGO", "AI_HYBRID", "MANUAL"] },
    status: { type: "string", enum: ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "CLOSED"] },
    providerId: { type: "string", minLength: 1 },
  },
} as const;
