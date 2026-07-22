import type { FastifyBaseLogger } from "fastify";
import { WebSocket } from "ws";
import { z } from "zod";
import type { Candle, Quote, TickerResult, Timeframe } from "@alphasignal/shared";
import type { AppConfig } from "../config/env.js";
import { MarketDataError } from "../utils/errors.js";
import { normalizeTicker, toAlpacaTimeframe, toSeconds } from "../utils/market.js";
import { ProviderCircuit } from "./circuit-breaker.js";
import type { ExternalQuotaTracker } from "./external-quota.js";
import { fetchJson } from "./fetch-json.js";
import type { MarketProvider, QuoteCallback, UnsubscribeFn } from "./types.js";

const alpacaBarsSchema = z.object({
  bars: z.array(
    z.object({
      t: z.string(),
      o: z.number(),
      h: z.number(),
      l: z.number(),
      c: z.number(),
      v: z.number(),
    }),
  ),
});

const alpacaLatestQuotesSchema = z.object({
  quotes: z.record(
    z.object({
      t: z.string(),
      ap: z.number(),
      bp: z.number(),
    }),
  ),
});

const alpacaAssetsSchema = z.array(
  z.object({
    symbol: z.string(),
    name: z.string(),
    exchange: z.string().optional(),
    currency: z.string().optional(),
    tradable: z.boolean().optional(),
  }),
);

const streamMessageSchema = z.array(
  z.object({
    T: z.string(),
    S: z.string().optional(),
    t: z.string().optional(),
    ap: z.number().optional(),
    bp: z.number().optional(),
  }),
);

export class AlpacaIntegration implements MarketProvider {
  readonly market = "STOCKS" as const;
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    private readonly quota: ExternalQuotaTracker,
    logger: FastifyBaseLogger,
  ) {
    this.circuit = new ProviderCircuit("alpaca", logger);
  }

  getOHLCV(ticker: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    return this.circuit.execute(async () => {
      await this.quota.trackAlpaca();
      const symbol = normalizeTicker(ticker);
      const url = new URL(
        `/v2/stocks/${encodeURIComponent(symbol)}/bars`,
        this.config.ALPACA_DATA_URL,
      );
      url.searchParams.set("timeframe", toAlpacaTimeframe(timeframe));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("feed", "iex");
      url.searchParams.set("adjustment", "raw");
      url.searchParams.set("sort", "asc");
      const result = await fetchJson("alpaca", url, alpacaBarsSchema, {
        headers: this.headers(),
      });

      return result.bars.map((bar) => ({
        time: toSeconds(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));
    });
  }

  getQuote(ticker: string): Promise<Quote> {
    return this.circuit.execute(async () => {
      await this.quota.trackAlpaca();
      const symbol = normalizeTicker(ticker);
      const url = new URL("/v2/stocks/quotes/latest", this.config.ALPACA_DATA_URL);
      url.searchParams.set("symbols", symbol);
      url.searchParams.set("feed", "iex");
      const result = await fetchJson("alpaca", url, alpacaLatestQuotesSchema, {
        headers: this.headers(),
      });
      const quote = result.quotes[symbol];
      if (!quote) {
        throw new MarketDataError("alpaca", "No quote was returned for this ticker.");
      }

      return toQuote(symbol, quote.bp, quote.ap, quote.t);
    });
  }

  searchTickers(query: string): Promise<TickerResult[]> {
    return this.circuit.execute(async () => {
      await this.quota.trackAlpaca();
      const url = new URL("/v2/assets", this.config.ALPACA_BASE_URL);
      url.searchParams.set("status", "active");
      url.searchParams.set("asset_class", "us_equity");
      const result = await fetchJson("alpaca", url, alpacaAssetsSchema, {
        headers: this.headers(),
      });
      const needle = query.trim().toUpperCase();

      return result
        .filter((asset) => asset.tradable !== false)
        .filter(
          (asset) =>
            asset.symbol.toUpperCase().includes(needle) ||
            asset.name.toUpperCase().includes(needle),
        )
        .slice(0, 20)
        .map((asset) => ({
          ticker: asset.symbol,
          market: "STOCKS",
          name: asset.name,
          ...(asset.exchange ? { exchange: asset.exchange } : {}),
          ...(asset.currency ? { currency: asset.currency } : {}),
        }));
    });
  }

  subscribeQuote(ticker: string, callback: QuoteCallback): UnsubscribeFn {
    const symbol = normalizeTicker(ticker);
    const socket = new WebSocket(this.config.ALPACA_STREAM_URL, {
      headers: this.headers(),
    });
    let disposed = false;

    socket.on("open", () => {
      if (disposed) {
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ action: "subscribe", quotes: [symbol] }));
    });
    socket.on("message", (payload) => {
      let message: unknown;
      try {
        message = JSON.parse(payload.toString()) as unknown;
      } catch {
        return;
      }
      const parsed = streamMessageSchema.safeParse(message);
      if (!parsed.success) {
        return;
      }

      for (const message of parsed.data) {
        if (
          message.T === "q" &&
          message.S === symbol &&
          message.ap !== undefined &&
          message.bp !== undefined &&
          message.t
        ) {
          callback(toQuote(symbol, message.bp, message.ap, message.t));
        }
      }
    });
    // Upstream connection errors must not become uncaught EventEmitter errors.
    // Market data polling and reconnecting can continue independently.
    socket.on("error", () => undefined);

    return () => {
      disposed = true;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    };
  }

  private headers(): Record<string, string> {
    return {
      "APCA-API-KEY-ID": this.config.ALPACA_API_KEY,
      "APCA-API-SECRET-KEY": this.config.ALPACA_API_SECRET,
    };
  }
}

function toQuote(ticker: string, bid: number, ask: number, timestamp: string): Quote {
  return {
    ticker,
    market: "STOCKS",
    bid,
    ask,
    price: (bid + ask) / 2,
    timestamp: toSeconds(timestamp),
  };
}
