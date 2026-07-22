import { runDetection } from "@alphasignal/algo-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { Candle, PatternDetectionResult } from "@alphasignal/shared";
import type { AlgoRepository, ProviderConfigRecord } from "../repositories/algo.repository.js";
import type { AlgoService } from "../services/algo.service.js";
import type { MarketDataService } from "../services/market-data.service.js";
import type { SignalService } from "../services/signal.service.js";
import { AlgoScanProcessor } from "./algo-scan.processor.js";

vi.mock("@alphasignal/algo-engine", () => ({
  runDetection: vi.fn(),
}));

describe("AlgoScanProcessor", () => {
  beforeEach(() => {
    vi.mocked(runDetection).mockReset();
  });

  it("persists and routes an eligible scanner detection for provider approval", async () => {
    vi.mocked(runDetection).mockImplementation((input) => (input.ticker === "EURUSD" ? [detection] : []));
    const repository = {
      findEnabledConfigs: vi.fn().mockResolvedValue([config]),
      listWatchlistSymbols: vi.fn().mockResolvedValue([]),
      findRecentDetections: vi.fn().mockResolvedValue([]),
      createDetection: vi.fn().mockResolvedValue({ id: "detection-1" }),
      createDetectionSignal: vi.fn().mockResolvedValue({
        id: "signal-1",
        providerId: "provider-1",
        algoDetectionId: "detection-1",
      }),
    } as unknown as AlgoRepository;
    const marketData = { getOHLCV: vi.fn().mockResolvedValue(candles()) } as unknown as MarketDataService;
    const signals = { announcePublishedSignal: vi.fn() } as unknown as SignalService;
    const algo = { announcePending: vi.fn().mockResolvedValue(undefined) } as unknown as AlgoService;
    const logger = { info: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;
    const processor = new AlgoScanProcessor(repository, marketData, signals, algo, logger);

    await expect(processor.process("M15")).resolves.toEqual({ scanned: 10, detections: 1, signals: 1 });
    expect(repository.createDetection).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "EURUSD", timeframe: "M15", result: detection }),
    );
    expect(repository.createDetectionSignal).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "provider-1", status: "PENDING_APPROVAL" }),
    );
    expect(algo.announcePending).toHaveBeenCalledWith(
      "provider-1",
      expect.objectContaining({ algoDetectionId: "detection-1" }),
    );
  });
});

const detection: PatternDetectionResult = {
  pattern: "ICT_LIQUIDITY_SWEEP",
  confidence: 86,
  direction: "LONG",
  entry: 1.1,
  stopLoss: 1.09,
  takeProfit1: 1.11,
  takeProfit2: 1.12,
  takeProfit3: 1.13,
  riskRewardRatio: 2,
  keyLevels: { support: [1.09], resistance: [1.12], orderBlocks: [], fvg: [], liquidityLevels: [] },
  rationale: "Liquidity sweep below support reclaimed the range and produced a confirmation close.",
  timestamp: 1_700_000_000,
};

const config = {
  id: "config-1",
  providerId: "profile-1",
  patternTypes: ["ICT_LIQUIDITY_SWEEP"],
  markets: ["FOREX"],
  timeframes: ["M15"],
  minConfidence: 80,
  autoPublish: false,
  riskRewardMin: 1.5,
  createdAt: new Date(),
  updatedAt: new Date(),
  provider: {
    userId: "provider-1",
    algoMode: "APPROVAL",
  },
} satisfies ProviderConfigRecord;

function candles(): Candle[] {
  return Array.from({ length: 200 }, (_, index) => ({
    time: 1_700_000_000 + index * 900,
    open: 1.1,
    high: 1.101,
    low: 1.099,
    close: 1.1,
    volume: 1_000,
  }));
}
