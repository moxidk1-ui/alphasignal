import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Candle, Quote, Timeframe } from "@alphasignal/shared";
import type { AppConfig } from "../config/env.js";
import { MarketDataError } from "../utils/errors.js";
import { normalizeTicker, toBinanceInterval } from "../utils/market.js";
import { ProviderCircuit } from "./circuit-breaker.js";
import { fetchJson } from "./fetch-json.js";

const yahooChartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            regularMarketPrice: z.number().optional(),
            regularMarketTime: z.number().optional(),
          }),
          timestamp: z.array(z.number()).nullable(),
          indicators: z.object({
            quote: z.array(
              z.object({
                open: z.array(z.number().nullable()).optional(),
                high: z.array(z.number().nullable()).optional(),
                low: z.array(z.number().nullable()).optional(),
                close: z.array(z.number().nullable()).optional(),
                volume: z.array(z.number().nullable()).optional(),
              }),
            ),
          }),
        }),
      )
      .nullable(),
  }),
});

export class YahooFinanceIntegration {
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    logger: FastifyBaseLogger,
  ) {
    this.circuit = new ProviderCircuit("yahoo-finance", logger);
  }

  getOHLCV(ticker: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    return this.circuit.execute(async () => {
      const url = chartUrl(this.config.YAHOO_FINANCE_BASE_URL, ticker, timeframe);
      const result = await fetchJson("yahoo-finance", url, yahooChartSchema);
      const chart = result.chart.result?.[0];
      const quote = chart?.indicators.quote[0];
      if (!chart?.timestamp || !quote) {
        throw new MarketDataError("yahoo-finance");
      }

      const candles = chart.timestamp
        .map((time, index) => {
          const open = quote.open?.[index];
          const high = quote.high?.[index];
          const low = quote.low?.[index];
          const close = quote.close?.[index];
          const volume = quote.volume?.[index] ?? 0;
          if (open == null || high == null || low == null || close == null) {
            return null;
          }
          return { time, open, high, low, close, volume };
        })
        .filter((candle): candle is Candle => candle !== null);
      const normalized = timeframe === "H4" ? aggregateCandles(candles, 4) : candles;

      return normalized.slice(-limit);
    });
  }

  getQuote(ticker: string): Promise<Quote> {
    return this.circuit.execute(async () => {
      const url = chartUrl(this.config.YAHOO_FINANCE_BASE_URL, ticker, "M1");
      const result = await fetchJson("yahoo-finance", url, yahooChartSchema);
      const meta = result.chart.result?.[0]?.meta;
      if (!meta?.regularMarketPrice || !meta.regularMarketTime) {
        throw new MarketDataError("yahoo-finance");
      }

      return {
        ticker: normalizeTicker(ticker),
        market: "FUTURES",
        price: meta.regularMarketPrice,
        timestamp: meta.regularMarketTime,
      };
    });
  }
}

function chartUrl(baseUrl: string, ticker: string, timeframe: Timeframe): URL {
  const url = new URL(`/v8/finance/chart/${encodeURIComponent(normalizeTicker(ticker))}`, baseUrl);
  url.searchParams.set("interval", yahooInterval(timeframe));
  url.searchParams.set("range", timeframe === "W1" ? "5y" : timeframe === "D1" ? "1y" : "60d");
  return url;
}

function yahooInterval(timeframe: Timeframe): string {
  if (timeframe === "M1") {
    return "1m";
  }
  if (timeframe === "H1") {
    return "60m";
  }
  if (timeframe === "H4") {
    return "1h";
  }
  return toBinanceInterval(timeframe);
}

function aggregateCandles(candles: Candle[], size: number): Candle[] {
  const result: Candle[] = [];
  for (let index = 0; index < candles.length; index += size) {
    const group = candles.slice(index, index + size);
    if (group.length < size) {
      continue;
    }

    result.push({
      time: group[0]!.time,
      open: group[0]!.open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group[group.length - 1]!.close,
      volume: group.reduce((total, candle) => total + candle.volume, 0),
    });
  }

  return result;
}
