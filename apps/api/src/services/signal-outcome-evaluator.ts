import type { Candle } from "@alphasignal/shared";

export interface PublishedSignalLevels {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  publishedAt: Date;
}

export interface MarketOutcome {
  status: "RESOLVED";
  result: "WIN" | "LOSS";
  outcomePrice: number;
  outcomeObservedAt: Date;
  pnlPercent: number;
}

export interface AmbiguousMarketOutcome {
  status: "AMBIGUOUS";
  outcomeObservedAt: Date;
}

export function evaluateSignalOutcome(
  signal: PublishedSignalLevels,
  candles: Candle[],
): MarketOutcome | AmbiguousMarketOutcome | undefined {
  const publishedAtSeconds = Math.floor(signal.publishedAt.getTime() / 1_000);
  const eligible = candles
    .filter((candle) => candle.time >= publishedAtSeconds)
    .sort((left, right) => left.time - right.time);

  for (const candle of eligible) {
    const targetHit =
      signal.direction === "LONG"
        ? candle.high >= signal.takeProfit1
        : candle.low <= signal.takeProfit1;
    const stopHit =
      signal.direction === "LONG" ? candle.low <= signal.stopLoss : candle.high >= signal.stopLoss;
    const observedAt = new Date(candle.time * 1_000);

    // OHLCV bars do not reveal intrabar ordering. Refuse to manufacture a result
    // when the stop and first target were both touched in the same candle.
    if (targetHit && stopHit) {
      return { status: "AMBIGUOUS", outcomeObservedAt: observedAt };
    }
    if (targetHit) {
      return resolved(signal, "WIN", signal.takeProfit1, observedAt);
    }
    if (stopHit) {
      return resolved(signal, "LOSS", signal.stopLoss, observedAt);
    }
  }

  return undefined;
}

function resolved(
  signal: PublishedSignalLevels,
  result: "WIN" | "LOSS",
  outcomePrice: number,
  outcomeObservedAt: Date,
): MarketOutcome {
  const rawReturn =
    signal.direction === "LONG"
      ? (outcomePrice - signal.entryPrice) / signal.entryPrice
      : (signal.entryPrice - outcomePrice) / signal.entryPrice;

  return {
    status: "RESOLVED",
    result,
    outcomePrice,
    outcomeObservedAt,
    pnlPercent: Math.round(rawReturn * 100 * 10_000) / 10_000,
  };
}
