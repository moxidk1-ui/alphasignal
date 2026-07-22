import { describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { Candle, Market } from "@alphasignal/shared";
import type { MarketProvider } from "../integrations/types.js";
import { MarketDataError } from "../utils/errors.js";
import { MarketDataService } from "./market-data.service.js";

class MemoryRedis {
  readonly values = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(key: string, value: string): Promise<"OK"> {
    this.values.set(key, value);
    return Promise.resolve("OK");
  }

  del(key: string): Promise<number> {
    const removed = this.values.delete(key);
    return Promise.resolve(removed ? 1 : 0);
  }
}

describe("MarketDataService", () => {
  it("serves a sufficiently deep OHLCV cache without calling its provider", async () => {
    const redis = new MemoryRedis();
    const candles = fixtureCandles(3);
    redis.values.set("mkt:ohlcv:STOCKS:AAPL:M5", JSON.stringify(candles));
    const stockProvider = provider();
    const service = buildService(redis, stockProvider);

    await expect(service.getOHLCV(" aapl ", "STOCKS", "M5", 2)).resolves.toEqual(candles.slice(-2));
    expect(stockProvider.getOHLCV).not.toHaveBeenCalled();
  });

  it("refreshes an OHLCV cache that is too short for the requested window", async () => {
    const redis = new MemoryRedis();
    redis.values.set("mkt:ohlcv:STOCKS:AAPL:H1", JSON.stringify(fixtureCandles(1)));
    const loaded = fixtureCandles(4);
    const stockProvider = provider({
      getOHLCV: vi.fn().mockResolvedValue(loaded),
    });
    const service = buildService(redis, stockProvider);

    await expect(service.getOHLCV("AAPL", "STOCKS", "H1", 4)).resolves.toEqual(loaded);
    expect(stockProvider.getOHLCV).toHaveBeenCalledWith("AAPL", "H1", 4);
    expect(redis.values.get("mkt:ohlcv:STOCKS:AAPL:H1")).toBe(JSON.stringify(loaded));
  });

  it("serves stale quotes when a market provider fails", async () => {
    const redis = new MemoryRedis();
    const stale = { ticker: "BTCUSDT", market: "CRYPTO", price: 100, timestamp: 1_700_000_000 };
    redis.values.set("mkt:quote:CRYPTO:BTCUSDT:stale", JSON.stringify(stale));
    const cryptoProvider = provider({
      market: "CRYPTO",
      getQuote: vi.fn().mockRejectedValue(new MarketDataError("binance")),
    });
    const service = buildService(redis, cryptoProvider, "CRYPTO");

    await expect(service.getQuote("btcusdt", "CRYPTO")).resolves.toEqual(stale);
  });

  it("removes malformed cached JSON and fetches fresh data", async () => {
    const redis = new MemoryRedis();
    redis.values.set("mkt:quote:STOCKS:AAPL", "{invalid");
    const quote = { ticker: "AAPL", market: "STOCKS" as const, price: 190, timestamp: 1_700_000_000 };
    const stockProvider = provider({ getQuote: vi.fn().mockResolvedValue(quote) });
    const service = buildService(redis, stockProvider);

    await expect(service.getQuote("AAPL", "STOCKS")).resolves.toEqual(quote);
    expect(stockProvider.getQuote).toHaveBeenCalledWith("AAPL");
  });
});

function buildService(redis: MemoryRedis, selectedProvider: MarketProvider, selectedMarket: Market = "STOCKS") {
  const fallback = provider();
  const providers: Record<Market, MarketProvider> = {
    STOCKS: fallback,
    FOREX: fallback,
    CRYPTO: fallback,
    FUTURES: fallback,
    [selectedMarket]: selectedProvider,
  };
  const logger = { warn: vi.fn() } as unknown as FastifyBaseLogger;

  return new MarketDataService(redis as unknown as Redis, providers, logger);
}

function provider(overrides: Partial<MarketProvider> = {}): MarketProvider {
  return {
    market: "STOCKS",
    getOHLCV: vi.fn().mockResolvedValue(fixtureCandles(1)),
    getQuote: vi.fn().mockResolvedValue({
      ticker: "AAPL",
      market: "STOCKS",
      price: 190,
      timestamp: 1_700_000_000,
    }),
    searchTickers: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function fixtureCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: 1_700_000_000 + index * 60,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1_000 + index,
  }));
}
