import { runDetection } from "@alphasignal/algo-engine";
import {
  algoSignalStrategySchema,
  marketSchema,
} from "@alphasignal/shared";
import type { AlgoSignalStrategy, Market, PatternDetectionResult, Timeframe } from "@alphasignal/shared";
import type { FastifyBaseLogger } from "fastify";
import type { AlgoRepository, ProviderConfigRecord } from "../repositories/algo.repository.js";
import type { AlgoService } from "../services/algo.service.js";
import type { MarketDataService } from "../services/market-data.service.js";
import type { SignalService } from "../services/signal.service.js";
import { computeFullIndicators } from "../utils/indicators.js";

interface ScanTarget {
  ticker: string;
  market: Market;
}

interface EnabledConfig {
  record: ProviderConfigRecord;
  patterns: AlgoSignalStrategy[];
  markets: Market[];
}

export class AlgoScanProcessor {
  constructor(
    private readonly repository: AlgoRepository,
    private readonly marketData: MarketDataService,
    private readonly signals: SignalService,
    private readonly algo: AlgoService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async process(timeframe: Timeframe): Promise<{ scanned: number; detections: number; signals: number }> {
    const configs = (await this.repository.findEnabledConfigs(timeframe))
      .map(toEnabledConfig)
      .filter((config): config is EnabledConfig => config !== null);
    if (configs.length === 0) {
      return { scanned: 0, detections: 0, signals: 0 };
    }

    const markets = [...new Set(configs.flatMap((config) => config.markets))];
    const targets = await this.targets(markets);
    let scanned = 0;
    let detectionCount = 0;
    let signalCount = 0;
    let failures = 0;

    for (const target of targets) {
      const targetConfigs = configs.filter((config) => config.markets.includes(target.market));
      const enabledPatterns = [...new Set(targetConfigs.flatMap((config) => config.patterns))];
      try {
        const candles = await this.marketData.getOHLCV(target.ticker, target.market, timeframe, 250);
        if (candles.length < 200) {
          continue;
        }

        scanned += 1;
        const detections = runDetection({
          candles,
          indicators: computeFullIndicators(candles),
          timeframe,
          market: target.market,
          ticker: target.ticker,
          enabledPatterns,
        });
        for (const detection of detections) {
          const eligible = targetConfigs.filter(
            (config) =>
              config.patterns.includes(detection.pattern as AlgoSignalStrategy) &&
              detection.confidence >= config.record.minConfidence &&
              detection.riskRewardRatio >= config.record.riskRewardMin,
          );
          if (eligible.length === 0 || (await this.isDuplicate(target, timeframe, detection))) {
            continue;
          }

          const stored = await this.repository.createDetection({
            ticker: target.ticker,
            market: target.market,
            timeframe,
            result: detection,
          });
          detectionCount += 1;

          for (const config of eligible) {
            const status =
              config.record.autoPublish && config.record.provider.algoMode === "AUTO"
                ? "PUBLISHED"
                : "PENDING_APPROVAL";
            const signal = await this.repository.createDetectionSignal({
              providerId: config.record.provider.userId,
              detectionId: stored.id,
              ticker: target.ticker,
              market: target.market,
              timeframe,
              result: detection,
              status,
            });
            signalCount += 1;
            if (status === "PUBLISHED") {
              await this.signals.announcePublishedSignal(signal);
            } else {
              await this.algo.announcePending(config.record.provider.userId, signal);
            }
          }
        }
      } catch (error) {
        failures += 1;
        this.logger.error({ err: error, ticker: target.ticker, market: target.market, timeframe }, "Algo scan failed");
      }
    }

    if (targets.length > 0 && failures === targets.length) {
      throw new Error(`All ${timeframe} market scan targets failed.`);
    }

    this.logger.info({ timeframe, scanned, detectionCount, signalCount }, "Algo scan completed");
    return { scanned, detections: detectionCount, signals: signalCount };
  }

  private async targets(markets: Market[]): Promise<ScanTarget[]> {
    const popular = markets.flatMap((market) => POPULAR_TICKERS[market].map((ticker) => ({ ticker, market })));
    const watchlist = await this.repository.listWatchlistSymbols(markets);
    const unique = new Map<string, ScanTarget>();

    for (const target of [...popular, ...watchlist]) {
      unique.set(`${target.market}:${target.ticker}`, target);
    }

    return [...unique.values()];
  }

  private async isDuplicate(
    target: ScanTarget,
    timeframe: Timeframe,
    result: PatternDetectionResult,
  ): Promise<boolean> {
    const pattern = algoSignalStrategySchema.parse(result.pattern);
    const recent = await this.repository.findRecentDetections({
      ticker: target.ticker,
      market: target.market,
      timeframe,
      pattern,
      direction: result.direction,
    });

    return recent.some((detection) => Math.abs(detection.entry - result.entry) / result.entry <= 0.005);
  }
}

function toEnabledConfig(record: ProviderConfigRecord): EnabledConfig | null {
  const patterns = record.patternTypes
    .map((pattern) => algoSignalStrategySchema.safeParse(pattern))
    .filter((result) => result.success)
    .map((result) => result.data);
  const markets = record.markets
    .map((market) => marketSchema.safeParse(market))
    .filter((result) => result.success)
    .map((result) => result.data);
  if (patterns.length === 0 || markets.length === 0) {
    return null;
  }

  return { record, patterns, markets };
}

const POPULAR_TICKERS: Record<Market, string[]> = {
  STOCKS: [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK.B", "AVGO", "JPM",
    "LLY", "V", "UNH", "XOM", "MA", "COST", "WMT", "ORCL", "HD", "PG",
    "NFLX", "BAC", "JNJ", "CRM", "ABBV", "AMD", "KO", "PEP", "MRK", "CVX",
    "ADBE", "TMO", "WFC", "ACN", "LIN", "MCD", "CSCO", "DIS", "ABT", "QCOM",
    "INTU", "IBM", "TXN", "AMAT", "GE", "CAT", "UBER", "NOW", "GS", "SPY",
  ],
  CRYPTO: [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT",
    "TRXUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "SUIUSDT", "LTCUSDT", "BCHUSDT",
    "UNIUSDT", "ATOMUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "OPUSDT",
  ],
  FOREX: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP", "EURJPY", "GBPJPY"],
  FUTURES: ["ES=F", "NQ=F", "YM=F", "RTY=F", "CL=F", "GC=F", "SI=F", "NG=F", "ZB=F", "ZN=F"],
};
