import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { Candle, Market, Quote, TickerResult, Timeframe } from "@alphasignal/shared";
import type { MarketProvider, QuoteCallback, UnsubscribeFn } from "../integrations/types.js";
import { MarketDataError } from "../utils/errors.js";
import { normalizeTicker } from "../utils/market.js";

const candleCacheSchema = z.array(
  z.object({
    time: z.number(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
  }),
);
const quoteCacheSchema = z
  .object({
    ticker: z.string(),
    market: z.enum(["STOCKS", "FOREX", "CRYPTO", "FUTURES"]),
    bid: z.number().optional(),
    ask: z.number().optional(),
    price: z.number(),
    changePercent: z.number().optional(),
    timestamp: z.number(),
  })
  .transform(
    (quote): Quote => ({
      ticker: quote.ticker,
      market: quote.market,
      price: quote.price,
      timestamp: quote.timestamp,
      ...(quote.bid !== undefined ? { bid: quote.bid } : {}),
      ...(quote.ask !== undefined ? { ask: quote.ask } : {}),
      ...(quote.changePercent !== undefined ? { changePercent: quote.changePercent } : {}),
    }),
  );
const tickerResultsCacheSchema = z
  .array(
    z.object({
      ticker: z.string(),
      market: z.enum(["STOCKS", "FOREX", "CRYPTO", "FUTURES"]),
      name: z.string(),
      exchange: z.string().optional(),
      currency: z.string().optional(),
    }),
  )
  .transform((tickers): TickerResult[] =>
    tickers.map((ticker) => ({
      ticker: ticker.ticker,
      market: ticker.market,
      name: ticker.name,
      ...(ticker.exchange !== undefined ? { exchange: ticker.exchange } : {}),
      ...(ticker.currency !== undefined ? { currency: ticker.currency } : {}),
    })),
  );

export class MarketDataService {
  constructor(
    private readonly redis: Redis,
    private readonly providers: Record<Market, MarketProvider>,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async getOHLCV(ticker: string, market: Market, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const symbol = normalizeTicker(ticker);
    const key = `mkt:ohlcv:${market}:${symbol}:${timeframe}`;
    const ttl = ["M1", "M5", "M15"].includes(timeframe) ? 60 : 300;
    const candles = await this.loadWithStaleFallback(
      key,
      ttl,
      candleCacheSchema,
      () => this.providers[market].getOHLCV(symbol, timeframe, limit),
      (cached) => cached.length >= limit,
    );

    return candles.slice(-limit);
  }

  getQuote(ticker: string, market: Market): Promise<Quote> {
    const symbol = normalizeTicker(ticker);
    const key = `mkt:quote:${market}:${symbol}`;

    return this.loadWithStaleFallback<Quote>(
      key,
      10,
      quoteCacheSchema,
      () => this.providers[market].getQuote(symbol),
    );
  }

  searchTickers(query: string, market: Market): Promise<TickerResult[]> {
    const normalizedQuery = query.trim().toUpperCase();
    const key = `mkt:search:${market}:${normalizedQuery}`;

    return this.loadWithStaleFallback<TickerResult[]>(
      key,
      3600,
      tickerResultsCacheSchema,
      () => this.providers[market].searchTickers(normalizedQuery),
    );
  }

  subscribeQuote(ticker: string, market: Market, callback: QuoteCallback): UnsubscribeFn {
    const symbol = normalizeTicker(ticker);
    const provider = this.providers[market];
    const forward = (quote: Quote): void => {
      void this.writeCache(`mkt:quote:${market}:${symbol}`, quote, 10).catch((error: unknown) => {
        this.logger.warn({ err: error, market, ticker: symbol }, "Unable to cache streaming quote");
      });
      callback(quote);
    };

    if (provider.subscribeQuote) {
      return provider.subscribeQuote(symbol, forward);
    }

    let active = true;
    const poll = async (): Promise<void> => {
      try {
        const quote = await this.getQuote(symbol, market);
        if (active) {
          forward(quote);
        }
      } catch (error) {
        this.logger.warn({ err: error, market, ticker: symbol }, "Quote subscription poll failed");
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 10_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }

  private async loadWithStaleFallback<T>(
    key: string,
    ttl: number,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    loader: () => Promise<T>,
    acceptCached: (cached: T) => boolean = () => true,
  ): Promise<T> {
    const cached = await this.readCache(key, schema);
    if (cached !== null && acceptCached(cached)) {
      return cached;
    }

    try {
      const result = await loader();
      await Promise.all([this.writeCache(key, result, ttl), this.writeCache(`${key}:stale`, result, 86_400)]);
      return result;
    } catch (error) {
      const stale = await this.readCache(`${key}:stale`, schema);
      if (stale !== null) {
        this.logger.warn({ key }, "Serving stale market data after provider failure");
        return stale;
      }

      if (error instanceof MarketDataError) {
        throw error;
      }

      throw new MarketDataError("unknown");
    }
  }

  private async readCache<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) {
      return null;
    }

    let data: unknown;
    try {
      data = JSON.parse(value) as unknown;
    } catch {
      await this.redis.del(key);
      return null;
    }

    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      await this.redis.del(key);
      return null;
    }

    return parsed.data;
  }

  private async writeCache(key: string, value: unknown, ttl: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), "EX", ttl);
  }
}
