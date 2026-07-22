import type { FastifyInstance } from "fastify";
import type { MarketController } from "../controllers/market.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

const marketEnum = ["STOCKS", "FOREX", "CRYPTO", "FUTURES"] as const;
const timeframeEnum = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as const;
const candleSchema = {
  type: "object",
  required: ["time", "open", "high", "low", "close", "volume"],
  properties: {
    time: { type: "number" },
    open: { type: "number" },
    high: { type: "number" },
    low: { type: "number" },
    close: { type: "number" },
    volume: { type: "number" },
  },
} as const;

export async function registerMarketRoutes(
  app: FastifyInstance,
  controller: MarketController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  const securedRead = [auth.authenticate, limits.byUser(policies.market)];

  app.get(
    "/market/quote",
    {
      preHandler: securedRead,
      schema: {
        tags: ["market"],
        summary: "Latest market quote",
        querystring: marketTickerQuerySchema,
        response: {
          200: {
            type: "object",
            required: ["quote"],
            properties: {
              quote: {
                type: "object",
                required: ["ticker", "market", "price", "timestamp"],
                properties: {
                  ticker: { type: "string" },
                  market: { type: "string", enum: marketEnum },
                  bid: { type: "number" },
                  ask: { type: "number" },
                  price: { type: "number" },
                  changePercent: { type: "number" },
                  timestamp: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
    controller.quote,
  );

  app.get(
    "/market/ohlcv",
    {
      preHandler: securedRead,
      schema: {
        tags: ["market"],
        summary: "OHLCV candle history",
        querystring: {
          ...marketTickerQuerySchema,
          required: ["ticker", "market", "timeframe"],
          properties: {
            ...marketTickerQuerySchema.properties,
            timeframe: { type: "string", enum: timeframeEnum },
            limit: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
          },
        },
        response: {
          200: {
            type: "object",
            required: ["candles"],
            properties: {
              candles: { type: "array", items: candleSchema },
            },
          },
        },
      },
    },
    controller.ohlcv,
  );

  app.get(
    "/market/search",
    {
      preHandler: securedRead,
      schema: {
        tags: ["market"],
        summary: "Search tradable tickers",
        querystring: {
          type: "object",
          required: ["q", "market"],
          additionalProperties: false,
          properties: {
            q: { type: "string", minLength: 1, maxLength: 64 },
            market: { type: "string", enum: marketEnum },
          },
        },
        response: {
          200: {
            type: "object",
            required: ["tickers"],
            properties: {
              tickers: {
                type: "array",
                items: {
                  type: "object",
                  required: ["ticker", "market", "name"],
                  properties: {
                    ticker: { type: "string" },
                    market: { type: "string", enum: marketEnum },
                    name: { type: "string" },
                    exchange: { type: "string" },
                    currency: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    controller.search,
  );
}

const marketTickerQuerySchema = {
  type: "object",
  required: ["ticker", "market"],
  additionalProperties: false,
  properties: {
    ticker: { type: "string", minLength: 1, maxLength: 32 },
    market: { type: "string", enum: marketEnum },
  },
} as const;
