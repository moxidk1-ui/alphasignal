import { runDetection } from "@alphasignal/algo-engine";
import { supportedAlgoPatterns } from "@alphasignal/queue";
import type { AiAnalysisJobData } from "@alphasignal/queue";
import {
  aiSignalRecommendationSchema,
} from "@alphasignal/shared";
import type { AiSignalRecommendation } from "@alphasignal/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { AnthropicIntegration } from "../integrations/anthropic.js";
import type { MarketDataService } from "../services/market-data.service.js";
import type { RealtimePublisher } from "../services/phase5.ports.js";
import { serviceUnavailable } from "../utils/errors.js";
import { computeFullIndicators } from "../utils/indicators.js";

const systemPrompt =
  "You are an expert trading analyst specializing in ICT/SMC (order blocks, fair value gaps, liquidity sweeps, market structure BOS/CHOCH, Silver Bullet, Turtle Soup), Wyckoff methodology (accumulation/distribution, spring, upthrust), price action (breaker blocks, supply/demand zones, double tops/bottoms), and momentum analysis (EMA stack, RSI divergence, MACD). Respond only with valid JSON matching the schema provided. No prose, no markdown, no explanation outside the JSON.";

export class AiAnalysisProcessor {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly anthropic: AnthropicIntegration,
    private readonly redis: Redis,
    private readonly realtime: RealtimePublisher,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async process(jobId: string, data: AiAnalysisJobData): Promise<AiSignalRecommendation> {
    const candles = await this.marketData.getOHLCV(data.ticker, data.market, data.timeframe, 200);
    if (candles.length < 200) {
      throw serviceUnavailable("Insufficient candle history for AI analysis.");
    }

    const indicators = computeFullIndicators(candles);
    const detections = runDetection({
      candles,
      indicators,
      ticker: data.ticker,
      market: data.market,
      timeframe: data.timeframe,
      enabledPatterns: supportedAlgoPatterns,
    });
    const prompt = buildPrompt(data, candles, indicators, detections);
    const rawResponse = await this.anthropic.completeAnalysis(systemPrompt, prompt);
    const recommendation = parseRecommendation(rawResponse);

    await this.redis.set(`signal:ai:${jobId}`, JSON.stringify(recommendation), "EX", 30 * 60);
    await this.realtime.publishToUser(data.requesterId, "ai-analysis:ready", {
      jobId,
      ticker: data.ticker,
      market: data.market,
      timeframe: data.timeframe,
    });
    this.logger.info(
      { jobId, requesterId: data.requesterId, ticker: data.ticker, market: data.market },
      "AI signal analysis completed",
    );

    return recommendation;
  }
}

function parseRecommendation(rawResponse: string): AiSignalRecommendation {
  try {
    return aiSignalRecommendationSchema.parse(JSON.parse(rawResponse) as unknown);
  } catch {
    throw serviceUnavailable("AI analysis response did not match the required signal schema.");
  }
}

function buildPrompt(
  data: AiAnalysisJobData,
  candles: Parameters<typeof computeFullIndicators>[0],
  indicators: ReturnType<typeof computeFullIndicators>,
  detections: ReturnType<typeof runDetection>,
): string {
  const last = candles.length - 1;
  const latestVolumeAverage = indicators.volumeSma20[last]!;
  const volumeRatio = latestVolumeAverage > 0 ? candles[last]!.volume / latestVolumeAverage : 0;
  const latestMacd = indicators.macd[last]!;

  return `Analyze the ${data.timeframe} chart for ${data.ticker} on ${data.market}.

OHLCV (last 200 bars, chronological, newest last):
${JSON.stringify(candles)}

Computed Indicators (last value):
EMA9=${format(indicators.ema9[last]!)} EMA21=${format(indicators.ema21[last]!)} EMA50=${format(indicators.ema50[last]!)} EMA200=${format(indicators.ema200[last]!)}
RSI14=${format(indicators.rsi14[last]!)} MACD=${format(latestMacd.macd)} Signal=${format(latestMacd.signal)} Histogram=${format(latestMacd.histogram)}
ATR14=${format(indicators.atr14[last]!)} VolRatio=${format(volumeRatio)}x (vs 20-bar avg)

Detected algo patterns (from rule engine, for context): ${JSON.stringify(detections)}

Respond ONLY with this exact JSON:
{
  "direction": "LONG"|"SHORT"|"NEUTRAL",
  "confidence": <1-100>,
  "entryPrice": <float>,
  "entryZone": { "low": <float>, "high": <float> },
  "stopLoss": <float>,
  "takeProfit1": <float>,
  "takeProfit2": <float>,
  "takeProfit3": <float>,
  "riskRewardRatio": <float>,
  "strategy": "<strategy enum value>",
  "keyLevels": {
    "support": [<float>],
    "resistance": [<float>],
    "orderBlocks": [{ "price": <float>, "type": "bullish"|"bearish" }],
    "fvg": [{ "low": <float>, "high": <float> }],
    "liquidityLevels": [<float>]
  },
  "marketStructure": "BULLISH"|"BEARISH"|"RANGING",
  "rationale": "<2-3 sentences citing specific price levels>",
  "invalidationLevel": <float>,
  "timeframeAlignment": "<comment on HTF bias>"
}`;
}

function format(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "unavailable";
}
