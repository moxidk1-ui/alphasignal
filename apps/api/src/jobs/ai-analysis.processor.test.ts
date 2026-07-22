import { describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { Candle } from "@alphasignal/shared";
import type { AnthropicIntegration } from "../integrations/anthropic.js";
import type { MarketDataService } from "../services/market-data.service.js";
import { AiAnalysisProcessor } from "./ai-analysis.processor.js";

describe("AiAnalysisProcessor", () => {
  it("validates, caches and broadcasts a structured Claude recommendation", async () => {
    const marketData = {
      getOHLCV: vi.fn().mockResolvedValue(candles()),
    } as unknown as MarketDataService;
    const recommendation = {
      direction: "LONG",
      confidence: 81,
      entryPrice: 125,
      entryZone: { low: 124.5, high: 125.2 },
      stopLoss: 122,
      takeProfit1: 128,
      takeProfit2: 131,
      takeProfit3: 134,
      riskRewardRatio: 2,
      strategy: "ICT_LIQUIDITY_SWEEP",
      keyLevels: {
        support: [122],
        resistance: [128, 131],
        orderBlocks: [{ price: 124.5, type: "bullish" }],
        fvg: [{ low: 124.4, high: 125 }],
        liquidityLevels: [128],
      },
      marketStructure: "BULLISH",
      rationale: "Price reclaimed support at 122 and displaced above 125. Opposing liquidity remains at 128 and 131.",
      invalidationLevel: 122,
      timeframeAlignment: "Higher timeframe structure remains bullish.",
    } as const;
    const anthropic = {
      completeAnalysis: vi.fn().mockResolvedValue(JSON.stringify(recommendation)),
    } as unknown as AnthropicIntegration;
    const redis = { set: vi.fn().mockResolvedValue("OK") } as unknown as Redis;
    const realtime = {
      publishToUser: vi.fn().mockResolvedValue(undefined),
      publishToUsers: vi.fn(),
    };
    const logger = { info: vi.fn() } as unknown as FastifyBaseLogger;
    const processor = new AiAnalysisProcessor(marketData, anthropic, redis, realtime, logger);

    await expect(
      processor.process("job-1", {
        requesterId: "provider-1",
        ticker: "AAPL",
        market: "STOCKS",
        timeframe: "M15",
      }),
    ).resolves.toEqual(recommendation);
    expect(redis.set).toHaveBeenCalledWith("signal:ai:job-1", JSON.stringify(recommendation), "EX", 1800);
    expect(realtime.publishToUser).toHaveBeenCalledWith(
      "provider-1",
      "ai-analysis:ready",
      expect.objectContaining({ jobId: "job-1", ticker: "AAPL" }),
    );
  });
});

function candles(): Candle[] {
  return Array.from({ length: 200 }, (_, index) => ({
    time: 1_700_000_000 + index * 900,
    open: 100 + index * 0.1,
    high: 101 + index * 0.1,
    low: 99 + index * 0.1,
    close: 100.5 + index * 0.1,
    volume: 10_000 + index,
  }));
}
