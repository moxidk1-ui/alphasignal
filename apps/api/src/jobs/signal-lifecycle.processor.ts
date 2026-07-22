import type { FastifyBaseLogger } from "fastify";
import type { SignalRepository } from "../repositories/signal.repository.js";
import type { MarketDataService } from "../services/market-data.service.js";
import type { SignalService } from "../services/signal.service.js";
import { evaluateSignalOutcome } from "../services/signal-outcome-evaluator.js";

export class SignalLifecycleProcessor {
  constructor(
    private readonly repository: SignalRepository,
    private readonly marketData: MarketDataService,
    private readonly signals: SignalService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async process(): Promise<{
    evaluated: number;
    closed: number;
    ambiguous: number;
    failures: number;
  }> {
    const published = await this.repository.listPublishedForLifecycle(250);
    let evaluated = 0;
    let closed = 0;
    let ambiguous = 0;
    let failures = 0;
    const candleCache = new Map<string, Awaited<ReturnType<MarketDataService["getOHLCV"]>>>();

    for (const signal of published) {
      const publishedAt = signal.publishedAt;
      if (!publishedAt) {
        continue;
      }
      try {
        const cacheKey = `${signal.market}:${signal.ticker}:${signal.timeframe}`;
        let candles = candleCache.get(cacheKey);
        if (!candles) {
          candles = await this.marketData.getOHLCV(
            signal.ticker,
            signal.market,
            signal.timeframe,
            200,
          );
          candleCache.set(cacheKey, candles);
        }
        evaluated += 1;
        const outcome = evaluateSignalOutcome({ ...signal, publishedAt }, candles);
        if (!outcome) {
          continue;
        }
        if (outcome.status === "AMBIGUOUS") {
          ambiguous += 1;
          this.logger.warn(
            { signalId: signal.id, candleTime: outcome.outcomeObservedAt.toISOString() },
            "Signal outcome requires manual review because stop and target touched in one candle",
          );
          continue;
        }

        const didClose = await this.signals.closeFromMarket(signal.id, outcome);
        if (didClose) {
          closed += 1;
        }
      } catch (error) {
        failures += 1;
        this.logger.error(
          { err: error, signalId: signal.id },
          "Signal lifecycle evaluation failed",
        );
      }
    }

    if (published.length > 0 && failures === published.length) {
      throw new Error(`All ${published.length} signal lifecycle evaluations failed.`);
    }

    this.logger.info(
      { evaluated, closed, ambiguous, failures },
      "Signal lifecycle evaluation completed",
    );
    return { evaluated, closed, ambiguous, failures };
  }
}
