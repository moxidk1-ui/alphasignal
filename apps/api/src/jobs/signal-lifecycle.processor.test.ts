import { describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { SignalRepository } from "../repositories/signal.repository.js";
import type { MarketDataService } from "../services/market-data.service.js";
import type { SignalService } from "../services/signal.service.js";
import { SignalLifecycleProcessor } from "./signal-lifecycle.processor.js";

describe("SignalLifecycleProcessor", () => {
  it("closes a published signal from market evidence", async () => {
    const publishedAt = new Date("2026-07-22T12:00:00.000Z");
    const repository = {
      listPublishedForLifecycle: vi.fn().mockResolvedValue([
        {
          id: "signal-1",
          providerId: "provider-1",
          ticker: "AAPL",
          market: "STOCKS",
          timeframe: "M15",
          direction: "LONG",
          entryPrice: 100,
          stopLoss: 98,
          takeProfit1: 102,
          publishedAt,
        },
      ]),
    } as unknown as SignalRepository;
    const marketData = {
      getOHLCV: vi.fn().mockResolvedValue([
        {
          time: Math.floor(new Date("2026-07-22T12:15:00.000Z").getTime() / 1_000),
          open: 100,
          high: 102.5,
          low: 99.5,
          close: 102,
          volume: 1_000,
        },
      ]),
    } as unknown as MarketDataService;
    const signals = {
      closeFromMarket: vi.fn().mockResolvedValue(true),
    } as unknown as SignalService;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;
    const processor = new SignalLifecycleProcessor(repository, marketData, signals, logger);

    await expect(processor.process()).resolves.toEqual({
      evaluated: 1,
      closed: 1,
      ambiguous: 0,
      failures: 0,
    });
    expect(signals.closeFromMarket).toHaveBeenCalledWith(
      "signal-1",
      expect.objectContaining({
        result: "WIN",
        outcomePrice: 102,
        pnlPercent: 2,
      }),
    );
  });
});
