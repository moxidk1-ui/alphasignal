import type { FastifyBaseLogger } from "fastify";
import { WebSocket } from "ws";
import { z } from "zod";
import type { Candle, Quote, TickerResult, Timeframe } from "@alphasignal/shared";
import type { AppConfig } from "../config/env.js";
import { normalizeTicker, toBinanceInterval } from "../utils/market.js";
import { ProviderCircuit } from "./circuit-breaker.js";
import type { ExternalQuotaTracker } from "./external-quota.js";
import { fetchJson } from "./fetch-json.js";
import type { MarketProvider, QuoteCallback, UnsubscribeFn } from "./types.js";

const binanceKlineSchema = z.array(z.array(z.union([z.number(), z.string()])));
const binanceTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  bidPrice: z.string(),
  askPrice: z.string(),
  priceChangePercent: z.string(),
  closeTime: z.number(),
});
const exchangeInfoSchema = z.object({
  symbols: z.array(
    z.object({
      symbol: z.string(),
      baseAsset: z.string(),
      quoteAsset: z.string(),
      status: z.string(),
    }),
  ),
});
const streamTickerSchema = z.object({
  s: z.string(),
  c: z.string(),
  b: z.string(),
  a: z.string(),
  P: z.string(),
  E: z.number(),
});

export class BinanceIntegration implements MarketProvider {
  readonly market = "CRYPTO" as const;
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    private readonly quota: ExternalQuotaTracker,
    logger: FastifyBaseLogger,
  ) {
    this.circuit = new ProviderCircuit("binance", logger);
  }

  getOHLCV(ticker: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    return this.circuit.execute(async () => {
      await this.quota.trackBinance(2);
      const url = new URL("/api/v3/klines", this.config.BINANCE_BASE_URL);
      url.searchParams.set("symbol", normalizeTicker(ticker));
      url.searchParams.set("interval", toBinanceInterval(timeframe));
      url.searchParams.set("limit", String(Math.min(limit, 1000)));
      const rows = await fetchJson("binance", url, binanceKlineSchema);

      return rows.map((row) => ({
        time: Math.floor(Number(row[0]) / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }));
    });
  }

  getQuote(ticker: string): Promise<Quote> {
    return this.circuit.execute(async () => {
      await this.quota.trackBinance(2);
      const url = new URL("/api/v3/ticker/24hr", this.config.BINANCE_BASE_URL);
      url.searchParams.set("symbol", normalizeTicker(ticker));
      const quote = await fetchJson("binance", url, binanceTickerSchema);

      return {
        ticker: quote.symbol,
        market: "CRYPTO",
        bid: Number(quote.bidPrice),
        ask: Number(quote.askPrice),
        price: Number(quote.lastPrice),
        changePercent: Number(quote.priceChangePercent),
        timestamp: Math.floor(quote.closeTime / 1000),
      };
    });
  }

  searchTickers(query: string): Promise<TickerResult[]> {
    return this.circuit.execute(async () => {
      await this.quota.trackBinance(20);
      const url = new URL("/api/v3/exchangeInfo", this.config.BINANCE_BASE_URL);
      const result = await fetchJson("binance", url, exchangeInfoSchema);
      const needle = query.trim().toUpperCase();

      return result.symbols
        .filter((symbol) => symbol.status === "TRADING" && symbol.symbol.includes(needle))
        .slice(0, 20)
        .map((symbol) => ({
          ticker: symbol.symbol,
          market: "CRYPTO",
          name: `${symbol.baseAsset}/${symbol.quoteAsset}`,
          currency: symbol.quoteAsset,
        }));
    });
  }

  subscribeQuote(ticker: string, callback: QuoteCallback): UnsubscribeFn {
    const symbol = normalizeTicker(ticker).toLowerCase();
    const socket = new WebSocket(`${this.config.BINANCE_STREAM_URL}/${symbol}@ticker`);

    socket.on("message", (payload) => {
      const message = streamTickerSchema.safeParse(JSON.parse(payload.toString()) as unknown);
      if (!message.success) {
        return;
      }

      callback({
        ticker: message.data.s,
        market: "CRYPTO",
        bid: Number(message.data.b),
        ask: Number(message.data.a),
        price: Number(message.data.c),
        changePercent: Number(message.data.P),
        timestamp: Math.floor(message.data.E / 1000),
      });
    });

    return () => socket.close();
  }
}
