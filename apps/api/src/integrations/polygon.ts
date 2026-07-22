import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Candle, Quote, TickerResult, Timeframe } from "@alphasignal/shared";
import type { AppConfig } from "../config/env.js";
import { normalizeTicker, historicalStartDate, toPolygonWindow } from "../utils/market.js";
import { ProviderCircuit } from "./circuit-breaker.js";
import { fetchJson } from "./fetch-json.js";
import type { MarketProvider } from "./types.js";
import type { YahooFinanceIntegration } from "./yahoo-finance.js";

const aggregateSchema = z.object({
  results: z
    .array(
      z.object({
        t: z.number(),
        o: z.number(),
        h: z.number(),
        l: z.number(),
        c: z.number(),
        v: z.number().optional().default(0),
      }),
    )
    .optional()
    .default([]),
});
const tradeSchema = z.object({
  results: z.object({
    p: z.number(),
    t: z.number(),
  }),
});
const tickersSchema = z.object({
  results: z
    .array(
      z.object({
        ticker: z.string(),
        name: z.string(),
        market: z.string().optional(),
        currency_name: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

export class PolygonIntegration implements MarketProvider {
  readonly market = "FUTURES" as const;
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    private readonly fallback: YahooFinanceIntegration,
    logger: FastifyBaseLogger,
  ) {
    this.circuit = new ProviderCircuit("polygon", logger);
  }

  async getOHLCV(ticker: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    try {
      return await this.circuit.execute(async () => {
        const symbol = normalizeTicker(ticker);
        const window = toPolygonWindow(timeframe);
        const from = historicalStartDate(timeframe, limit);
        const to = new Date().toISOString().slice(0, 10);
        const url = new URL(
          `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${window.multiplier}/${window.timespan}/${from}/${to}`,
          this.config.POLYGON_BASE_URL,
        );
        url.searchParams.set("adjusted", "true");
        url.searchParams.set("sort", "asc");
        url.searchParams.set("limit", String(Math.min(limit, 50_000)));
        url.searchParams.set("apiKey", this.config.POLYGON_API_KEY);
        const result = await fetchJson("polygon", url, aggregateSchema);
        const bars = result.results ?? [];
        if (bars.length === 0) {
          throw new Error("No Polygon results");
        }

        return bars.slice(-limit).map((bar) => ({
          time: Math.floor(bar.t / 1000),
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v ?? 0,
        }));
      });
    } catch {
      return this.fallback.getOHLCV(ticker, timeframe, limit);
    }
  }

  async getQuote(ticker: string): Promise<Quote> {
    try {
      return await this.circuit.execute(async () => {
        const symbol = normalizeTicker(ticker);
        const url = new URL(`/v2/last/trade/${encodeURIComponent(symbol)}`, this.config.POLYGON_BASE_URL);
        url.searchParams.set("apiKey", this.config.POLYGON_API_KEY);
        const result = await fetchJson("polygon", url, tradeSchema);

        return {
          ticker: symbol,
          market: "FUTURES",
          price: result.results.p,
          timestamp: Math.floor(result.results.t / 1_000_000_000),
        };
      });
    } catch {
      return this.fallback.getQuote(ticker);
    }
  }

  searchTickers(query: string): Promise<TickerResult[]> {
    return this.circuit.execute(async () => {
      const url = new URL("/v3/reference/tickers", this.config.POLYGON_BASE_URL);
      url.searchParams.set("search", query.trim());
      url.searchParams.set("active", "true");
      url.searchParams.set("limit", "20");
      url.searchParams.set("apiKey", this.config.POLYGON_API_KEY);
      const result = await fetchJson("polygon", url, tickersSchema);

      return (result.results ?? []).map((ticker) => ({
        ticker: ticker.ticker,
        market: "FUTURES",
        name: ticker.name,
        ...(ticker.market ? { exchange: ticker.market } : {}),
        ...(ticker.currency_name ? { currency: ticker.currency_name } : {}),
      }));
    });
  }
}
