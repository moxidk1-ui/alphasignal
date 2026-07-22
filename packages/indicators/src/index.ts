import type {
  Candle,
  FairValueGap,
  LiquidityLevel,
  MarketStructure,
  OrderBlock,
  StructureEvent,
  SwingPoint,
} from "@alphasignal/shared";

const EMPTY_NUMBER_SERIES: number[] = [];

export type {
  Candle,
  FairValueGap as FVG,
  LiquidityLevel,
  MarketStructure,
  OrderBlock,
  SwingPoint,
};

export function computeEMA(candles: Candle[], period: number): number[] {
  assertPositiveInteger(period, "period");
  if (candles.length === 0) {
    return EMPTY_NUMBER_SERIES;
  }

  const closes = candles.map((candle) => candle.close);
  return computeEMAFromValues(closes, period);
}

export function computeRSI(candles: Candle[], period: number): number[] {
  assertPositiveInteger(period, "period");
  const rsi = createNumberSeries(candles.length);

  if (candles.length <= period) {
    return rsi;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = candles[index]!.close - candles[index - 1]!.close;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  rsi[period] = toRsi(averageGain, averageLoss);

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index]!.close - candles[index - 1]!.close;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    rsi[index] = toRsi(averageGain, averageLoss);
  }

  return rsi;
}

export function computeMACD(
  candles: Candle[],
  fast: number,
  slow: number,
  sig: number,
): { macd: number; signal: number; histogram: number }[] {
  assertPositiveInteger(fast, "fast");
  assertPositiveInteger(slow, "slow");
  assertPositiveInteger(sig, "sig");

  if (fast >= slow) {
    throw new Error("fast period must be lower than slow period");
  }

  const closes = candles.map((candle) => candle.close);
  const fastEma = computeEMAFromValues(closes, fast);
  const slowEma = computeEMAFromValues(closes, slow);
  const macd = closes.map((_close, index) =>
    Number.isFinite(fastEma[index]) && Number.isFinite(slowEma[index])
      ? fastEma[index]! - slowEma[index]!
      : Number.NaN,
  );
  const signal = computeEMAFromSparseValues(macd, sig);

  return macd.map((value, index) => ({
    macd: value,
    signal: signal[index]!,
    histogram:
      Number.isFinite(value) && Number.isFinite(signal[index])
        ? value - signal[index]!
        : Number.NaN,
  }));
}

export function computeATR(candles: Candle[], period: number): number[] {
  assertPositiveInteger(period, "period");
  const atr = createNumberSeries(candles.length);

  if (candles.length <= period) {
    return atr;
  }

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) {
      return candle.high - candle.low;
    }

    const previousClose = candles[index - 1]!.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  const seed = trueRanges.slice(1, period + 1).reduce((sum, value) => sum + value, 0) / period;
  atr[period] = seed;

  for (let index = period + 1; index < candles.length; index += 1) {
    atr[index] = (atr[index - 1]! * (period - 1) + trueRanges[index]!) / period;
  }

  return atr;
}

export function computeVolumeSMA(candles: Candle[], period: number): number[] {
  assertPositiveInteger(period, "period");
  return computeSMA(candles.map((candle) => candle.volume), period);
}

export function computeBollingerBands(
  candles: Candle[],
  period: number,
  std: number,
): { upper: number; mid: number; lower: number }[] {
  assertPositiveInteger(period, "period");
  assertPositiveNumber(std, "std");

  const closes = candles.map((candle) => candle.close);
  return closes.map((_close, index) => {
    if (index < period - 1) {
      return { upper: Number.NaN, mid: Number.NaN, lower: Number.NaN };
    }

    const window = closes.slice(index - period + 1, index + 1);
    const mid = average(window);
    const variance = average(window.map((value) => (value - mid) ** 2));
    const deviation = Math.sqrt(variance);

    return {
      upper: mid + std * deviation,
      mid,
      lower: mid - std * deviation,
    };
  });
}

export function findSwingHighs(candles: Candle[], lookback: number): SwingPoint[] {
  assertPositiveInteger(lookback, "lookback");

  const points: SwingPoint[] = [];
  for (let index = lookback; index < candles.length - lookback; index += 1) {
    const high = candles[index]!.high;
    const left = candles.slice(index - lookback, index);
    const right = candles.slice(index + 1, index + lookback + 1);
    const isSwingHigh =
      left.every((candle) => high > candle.high) && right.every((candle) => high >= candle.high);

    if (isSwingHigh) {
      const neighborMax = Math.max(...left.map((candle) => candle.high), ...right.map((candle) => candle.high));
      points.push({
        index,
        time: candles[index]!.time,
        price: high,
        strength: high - neighborMax,
      });
    }
  }

  return points;
}

export function findSwingLows(candles: Candle[], lookback: number): SwingPoint[] {
  assertPositiveInteger(lookback, "lookback");

  const points: SwingPoint[] = [];
  for (let index = lookback; index < candles.length - lookback; index += 1) {
    const low = candles[index]!.low;
    const left = candles.slice(index - lookback, index);
    const right = candles.slice(index + 1, index + lookback + 1);
    const isSwingLow =
      left.every((candle) => low < candle.low) && right.every((candle) => low <= candle.low);

    if (isSwingLow) {
      const neighborMin = Math.min(...left.map((candle) => candle.low), ...right.map((candle) => candle.low));
      points.push({
        index,
        time: candles[index]!.time,
        price: low,
        strength: neighborMin - low,
      });
    }
  }

  return points;
}

export function findOrderBlocks(candles: Candle[]): OrderBlock[] {
  if (candles.length < 5) {
    return [];
  }

  const atr = computeATR(candles, Math.min(14, Math.max(2, Math.floor(candles.length / 3))));
  const blocks: OrderBlock[] = [];

  for (let index = 1; index < candles.length - 3; index += 1) {
    const currentAtr = latestFiniteAtOrBefore(atr, index) ?? averageRange(candles.slice(0, index + 1));
    const oneCandleMove = candles[index + 1]!.close - candles[index]!.close;
    const threeCandleMove = candles[index + 3]!.close - candles[index]!.close;
    const impulse = Math.abs(oneCandleMove) >= 1.5 * currentAtr ? oneCandleMove : threeCandleMove;

    if (Math.abs(impulse) < 1.5 * currentAtr) {
      continue;
    }

    if (impulse > 0 && isBearish(candles[index]!)) {
      blocks.push(toOrderBlock(candles, index, "bullish"));
    }

    if (impulse < 0 && isBullish(candles[index]!)) {
      blocks.push(toOrderBlock(candles, index, "bearish"));
    }
  }

  return dedupeZones(blocks);
}

export function findFairValueGaps(candles: Candle[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];

  for (let index = 0; index < candles.length - 2; index += 1) {
    const first = candles[index]!;
    const third = candles[index + 2]!;

    if (first.high < third.low) {
      gaps.push({
        type: "bullish",
        index: index + 1,
        low: first.high,
        high: third.low,
        midpoint: (first.high + third.low) / 2,
        filled: candles.slice(index + 3).some((candle) => candle.low <= (first.high + third.low) / 2),
      });
    }

    if (first.low > third.high) {
      gaps.push({
        type: "bearish",
        index: index + 1,
        low: third.high,
        high: first.low,
        midpoint: (third.high + first.low) / 2,
        filled: candles.slice(index + 3).some((candle) => candle.high >= (third.high + first.low) / 2),
      });
    }
  }

  return gaps;
}

export function detectMarketStructure(candles: Candle[]): MarketStructure {
  const swingHighs = findSwingHighs(candles, 2);
  const swingLows = findSwingLows(candles, 2);
  const trend = classifyTrend(swingHighs, swingLows);
  const bos: StructureEvent[] = [];
  const choch: StructureEvent[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const previousHigh = lastSwingBefore(swingHighs, index);
    const previousLow = lastSwingBefore(swingLows, index);

    if (previousHigh && candles[index]!.close > previousHigh.price) {
      const event = { direction: "LONG" as const, index, level: previousHigh.price };
      if (trend === "BEARISH") {
        choch.push(event);
      } else {
        bos.push(event);
      }
    }

    if (previousLow && candles[index]!.close < previousLow.price) {
      const event = { direction: "SHORT" as const, index, level: previousLow.price };
      if (trend === "BULLISH") {
        choch.push(event);
      } else {
        bos.push(event);
      }
    }
  }

  return { trend, bos: dedupeStructureEvents(bos), choch: dedupeStructureEvents(choch) };
}

export function detectLiquidityLevels(candles: Candle[]): LiquidityLevel[] {
  if (candles.length === 0) {
    return [];
  }

  const levels: LiquidityLevel[] = [];
  const swingHighs = findSwingHighs(candles, 2);
  const swingLows = findSwingLows(candles, 2);

  for (const cluster of clusterSwingPoints(swingHighs, 0.001)) {
    if (cluster.length >= 2) {
      levels.push(toLiquidityLevel("equal_highs", cluster));
    }
  }

  for (const cluster of clusterSwingPoints(swingLows, 0.001)) {
    if (cluster.length >= 2) {
      levels.push(toLiquidityLevel("equal_lows", cluster));
    }
  }

  for (const swing of swingHighs) {
    levels.push({
      type: "swing_high",
      price: swing.price,
      touches: 1,
      indices: [swing.index],
    });
  }

  for (const swing of swingLows) {
    levels.push({
      type: "swing_low",
      price: swing.price,
      touches: 1,
      indices: [swing.index],
    });
  }

  const previousSession = previousSessionRange(candles);
  if (previousSession) {
    levels.push({
      type: "session_high",
      price: previousSession.high.price,
      touches: 1,
      indices: [previousSession.high.index],
    });
    levels.push({
      type: "session_low",
      price: previousSession.low.price,
      touches: 1,
      indices: [previousSession.low.index],
    });
  }

  return dedupeLiquidity(levels);
}

function computeEMAFromValues(values: number[], period: number): number[] {
  const result = createNumberSeries(values.length);
  if (values.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  result[period - 1] = average(values.slice(0, period));

  for (let index = period; index < values.length; index += 1) {
    result[index] = (values[index]! - result[index - 1]!) * multiplier + result[index - 1]!;
  }

  return result;
}

function computeEMAFromSparseValues(values: number[], period: number): number[] {
  const result = createNumberSeries(values.length);
  const finiteIndices = values
    .map((value, index) => ({ value, index }))
    .filter((entry) => Number.isFinite(entry.value));

  if (finiteIndices.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  const seedEntries = finiteIndices.slice(0, period);
  const seedIndex = seedEntries[period - 1]!.index;
  result[seedIndex] = average(seedEntries.map((entry) => entry.value));

  let previous = result[seedIndex]!;
  for (const entry of finiteIndices.slice(period)) {
    previous = (entry.value - previous) * multiplier + previous;
    result[entry.index] = previous;
  }

  return result;
}

function computeSMA(values: number[], period: number): number[] {
  const result = createNumberSeries(values.length);
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]!;
    if (index >= period) {
      sum -= values[index - period]!;
    }
    if (index >= period - 1) {
      result[index] = sum / period;
    }
  }

  return result;
}

function createNumberSeries(length: number): number[] {
  return Array.from({ length }, () => Number.NaN);
}

function toRsi(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0 && averageGain === 0) {
    return 50;
  }
  if (averageLoss === 0) {
    return 100;
  }
  if (averageGain === 0) {
    return 0;
  }

  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageRange(candles: Candle[]): number {
  return average(candles.map((candle) => candle.high - candle.low));
}

function latestFiniteAtOrBefore(series: number[], index: number): number | undefined {
  for (let cursor = Math.min(index, series.length - 1); cursor >= 0; cursor -= 1) {
    if (Number.isFinite(series[cursor])) {
      return series[cursor];
    }
  }

  return undefined;
}

function isBullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

function isBearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

function toOrderBlock(candles: Candle[], index: number, type: "bullish" | "bearish"): OrderBlock {
  const candle = candles[index]!;
  const mitigations = candles
    .slice(index + 1)
    .filter((future) => future.low <= Math.max(candle.open, candle.close) && future.high >= Math.min(candle.open, candle.close));

  return {
    type,
    startIndex: index,
    endIndex: index,
    low: Math.min(candle.open, candle.close, candle.low),
    high: Math.max(candle.open, candle.close, candle.high),
    mitigationCount: mitigations.length,
  };
}

function dedupeZones(blocks: OrderBlock[]): OrderBlock[] {
  const deduped: OrderBlock[] = [];

  for (const block of blocks) {
    const duplicate = deduped.some(
      (existing) =>
        existing.type === block.type &&
        Math.abs(existing.low - block.low) / block.low < 0.001 &&
        Math.abs(existing.high - block.high) / block.high < 0.001,
    );

    if (!duplicate) {
      deduped.push(block);
    }
  }

  return deduped;
}

function classifyTrend(swingHighs: SwingPoint[], swingLows: SwingPoint[]): MarketStructure["trend"] {
  if (swingHighs.length < 2 || swingLows.length < 2) {
    return "RANGING";
  }

  const lastHighs = swingHighs.slice(-2);
  const lastLows = swingLows.slice(-2);
  const higherHigh = lastHighs[1]!.price > lastHighs[0]!.price;
  const higherLow = lastLows[1]!.price > lastLows[0]!.price;
  const lowerHigh = lastHighs[1]!.price < lastHighs[0]!.price;
  const lowerLow = lastLows[1]!.price < lastLows[0]!.price;

  if (higherHigh && higherLow) {
    return "BULLISH";
  }

  if (lowerHigh && lowerLow) {
    return "BEARISH";
  }

  return "RANGING";
}

function lastSwingBefore(swings: SwingPoint[], index: number): SwingPoint | undefined {
  for (let cursor = swings.length - 1; cursor >= 0; cursor -= 1) {
    if (swings[cursor]!.index < index) {
      return swings[cursor];
    }
  }

  return undefined;
}

function dedupeStructureEvents(events: StructureEvent[]): StructureEvent[] {
  const deduped: StructureEvent[] = [];

  for (const event of events) {
    const duplicate = deduped.some(
      (existing) =>
        existing.direction === event.direction &&
        Math.abs(existing.level - event.level) / event.level < 0.0005,
    );

    if (!duplicate) {
      deduped.push(event);
    }
  }

  return deduped;
}

function clusterSwingPoints(points: SwingPoint[], tolerancePercent: number): SwingPoint[][] {
  const clusters: SwingPoint[][] = [];

  for (const point of points) {
    const cluster = clusters.find(
      (candidate) => Math.abs(average(candidate.map((entry) => entry.price)) - point.price) / point.price <= tolerancePercent,
    );

    if (cluster) {
      cluster.push(point);
    } else {
      clusters.push([point]);
    }
  }

  return clusters;
}

function toLiquidityLevel(
  type: Extract<LiquidityLevel["type"], "equal_highs" | "equal_lows">,
  points: SwingPoint[],
): LiquidityLevel {
  return {
    type,
    price: average(points.map((point) => point.price)),
    touches: points.length,
    indices: points.map((point) => point.index),
  };
}

function previousSessionRange(
  candles: Candle[],
): { high: { price: number; index: number }; low: { price: number; index: number } } | undefined {
  if (candles.length < 2) {
    return undefined;
  }

  const lastSessionKey = sessionKey(candles[candles.length - 1]!.time);
  const previous = candles
    .map((candle, index) => ({ candle, index }))
    .filter((entry) => sessionKey(entry.candle.time) !== lastSessionKey);

  if (previous.length === 0) {
    return undefined;
  }

  const targetKey = sessionKey(previous[previous.length - 1]!.candle.time);
  const previousSession = previous.filter((entry) => sessionKey(entry.candle.time) === targetKey);

  const high = previousSession.reduce((best, entry) =>
    entry.candle.high > best.price ? { price: entry.candle.high, index: entry.index } : best,
  { price: -Infinity, index: -1 });
  const low = previousSession.reduce((best, entry) =>
    entry.candle.low < best.price ? { price: entry.candle.low, index: entry.index } : best,
  { price: Infinity, index: -1 });

  return { high, low };
}

function sessionKey(time: number): string {
  const milliseconds = time > 10_000_000_000 ? time : time * 1000;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function dedupeLiquidity(levels: LiquidityLevel[]): LiquidityLevel[] {
  const deduped: LiquidityLevel[] = [];

  for (const level of levels) {
    const duplicate = deduped.some(
      (existing) =>
        existing.type === level.type && Math.abs(existing.price - level.price) / level.price < 0.0005,
    );

    if (!duplicate) {
      deduped.push(level);
    }
  }

  return deduped;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertPositiveNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}
