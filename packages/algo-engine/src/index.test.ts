import { describe, expect, it } from "vitest";
import type {
  Candle,
  ComputedIndicators,
  FairValueGap,
  LiquidityLevel,
  MarketStructure,
  OrderBlock,
  PatternDetectionResult,
  SignalStrategy,
} from "@alphasignal/shared";
import { runDetection } from "./index.js";

const killZoneStart = Date.UTC(2026, 0, 5, 15, 0, 0) / 1000;
const patternCases: {
  pattern: SignalStrategy;
  direction: PatternDetectionResult["direction"];
  candles: Candle[];
  indicators: ComputedIndicators;
}[] = [
  silverBulletCase(),
  turtleSoupCase(),
  obFvgCase(),
  bosChochCase(),
  liquiditySweepCase(),
  wyckoffSpringCase(),
  wyckoffUpthrustCase(),
  wyckoffAccumulationCase(),
  wyckoffDistributionCase(),
  emaCrossCase(),
  rsiDivergenceCase(),
  macdCase(),
  breakerBlockCase(),
  supplyDemandCase(),
  doubleTopCase(),
];

describe("runDetection", () => {
  it.each(patternCases)("detects $pattern", ({ pattern, direction, candles, indicators }) => {
    const detections = runDetection({
      candles,
      indicators,
      timeframe: "M5",
      market: "STOCKS",
      ticker: "TEST",
      enabledPatterns: [pattern],
    });

    expect(detections).toHaveLength(1);
    expect(detections[0]!.pattern).toBe(pattern);
    expect(detections[0]!.direction).toBe(direction);
    expect(detections[0]!.confidence).toBeGreaterThanOrEqual(40);
    expect(detections[0]!.riskRewardRatio).toBeGreaterThan(0);
    expect(detections[0]!.rationale).toContain("TEST");
  });

  it("ignores non-algorithm signal sources and insufficient candle windows", () => {
    const candles = trendingCandles(6, 100, 1);
    const indicators = indicatorSet(candles);

    expect(
      runDetection({
        candles,
        indicators,
        timeframe: "M5",
        market: "STOCKS",
        ticker: "TEST",
        enabledPatterns: ["MANUAL", "AI_HYBRID", "CUSTOM"],
      }),
    ).toEqual([]);

    expect(
      runDetection({
        candles: candles.slice(0, 4),
        indicators: indicatorSet(candles.slice(0, 4)),
        timeframe: "M5",
        market: "STOCKS",
        ticker: "TEST",
        enabledPatterns: ["ICT_SILVER_BULLET"],
      }),
    ).toEqual([]);
  });
});

function silverBulletCase() {
  const candles = trendingCandles(12, 104, 0.15, killZoneStart);
  candles[8] = candle(8, 101.4, 102, 98, 100.8, 130, killZoneStart);
  candles[9] = candle(9, 101, 103.5, 101.2, 103, 150, killZoneStart);
  candles[10] = candle(10, 103.2, 104.5, 102.5, 104, 150, killZoneStart);
  candles[11] = candle(11, 103.8, 105, 103, 104.6, 160, killZoneStart);

  const liquidityLevels: LiquidityLevel[] = [
    { type: "equal_lows", price: 100, touches: 2, indices: [2, 5] },
    { type: "equal_highs", price: 108, touches: 2, indices: [4, 7] },
  ];
  const fairValueGaps: FairValueGap[] = [
    { type: "bullish", index: 9, low: 101.2, high: 102.2, midpoint: 101.7, filled: false },
  ];

  return {
    pattern: "ICT_SILVER_BULLET" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles, {
      fairValueGaps,
      liquidityLevels,
      swingHighs: [{ index: 7, time: candles[7]!.time, price: 108, strength: 2 }],
      swingLows: [{ index: 5, time: candles[5]!.time, price: 100, strength: 2 }],
      ema9: series(candles.length, 104),
      ema21: series(candles.length, 103),
      ema50: series(candles.length, 102),
    }),
  };
}

function turtleSoupCase() {
  const candles = trendingCandles(15, 100, 0.2, killZoneStart);
  candles[6] = candle(6, 107, 110, 106, 108, 100, killZoneStart);
  candles[10] = candle(10, 108, 112, 107, 111, 120, killZoneStart);
  candles[11] = candle(11, 111, 111.5, 109.2, 110.6, 110, killZoneStart);
  candles[12] = candle(12, 110.4, 110.7, 106.5, 108.8, 140, killZoneStart);
  candles[13] = candle(13, 108.8, 109.4, 107.8, 108.2, 120, killZoneStart);
  candles[14] = candle(14, 108.1, 108.7, 107.4, 107.8, 120, killZoneStart);

  return {
    pattern: "ICT_TURTLE_SOUP" as const,
    direction: "SHORT" as const,
    candles,
    indicators: indicatorSet(candles, {
      swingHighs: [{ index: 6, time: candles[6]!.time, price: 110, strength: 3 }],
      rsi14: series(candles.length, 75),
    }),
  };
}

function obFvgCase() {
  const candles = trendingCandles(12, 100, 0.2);
  candles[11] = candle(11, 101.2, 102.2, 100.8, 101.5);
  const block: OrderBlock = {
    type: "bullish",
    startIndex: 7,
    endIndex: 7,
    low: 100,
    high: 102,
    mitigationCount: 0,
  };
  const gap: FairValueGap = {
    type: "bullish",
    index: 8,
    low: 101,
    high: 103,
    midpoint: 102,
    filled: false,
  };

  return {
    pattern: "ICT_OB_FVG" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles, {
      orderBlocks: [block],
      fairValueGaps: [gap],
      ema9: series(candles.length, 103),
      ema21: series(candles.length, 102),
      ema50: series(candles.length, 101),
    }),
  };
}

function bosChochCase() {
  const candles = trendingCandles(14, 100, 0.5);
  const marketStructure: MarketStructure = {
    trend: "BULLISH",
    bos: [{ direction: "LONG", index: 12, level: 105 }],
    choch: [],
  };

  return {
    pattern: "ICT_BOS_CHOCH" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles, {
      marketStructure,
      swingLows: [{ index: 10, time: candles[10]!.time, price: 102, strength: 1 }],
      liquidityLevels: [{ type: "equal_highs", price: 110, touches: 2, indices: [7, 9] }],
      volumeSma20: series(candles.length, 100),
    }),
  };
}

function liquiditySweepCase() {
  const candles = trendingCandles(12, 104, 0.1);
  candles[10] = candle(10, 101, 101.6, 98.6, 100.8, 120);
  candles[11] = candle(11, 100.4, 103.2, 100.1, 102.8, 150);

  return {
    pattern: "ICT_LIQUIDITY_SWEEP" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles, {
      liquidityLevels: [{ type: "equal_lows", price: 100, touches: 2, indices: [4, 7] }],
    }),
  };
}

function wyckoffSpringCase() {
  const candles = rangeCandles(15, 99, 105);
  candles.push(candle(15, 100.4, 101, 97.8, 100.2, 70));
  candles.push(candle(16, 100.3, 104, 100, 103.4, 180));

  return {
    pattern: "WYCKOFF_SPRING" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles),
  };
}

function wyckoffUpthrustCase() {
  const candles = rangeCandles(15, 99, 105);
  candles.push(candle(15, 104.2, 107.2, 103.8, 104.4, 220));
  candles.push(candle(16, 104.3, 104.6, 100.8, 101.4, 180));

  return {
    pattern: "WYCKOFF_UPTHRUST" as const,
    direction: "SHORT" as const,
    candles,
    indicators: indicatorSet(candles),
  };
}

function wyckoffAccumulationCase() {
  const candles = [
    ...trendingCandles(10, 120, -2),
    candle(10, 101, 103, 86, 88, 700),
    candle(11, 89, 96, 88, 95, 120),
    candle(12, 95, 101, 94, 100, 130),
    candle(13, 100, 104, 98, 103, 140),
    candle(14, 101, 102, 87.5, 90, 170),
    candle(15, 90, 97, 89, 96, 110),
    candle(16, 96, 101, 95, 100, 100),
    candle(17, 100, 106, 99, 105.5, 420),
    candle(18, 104.5, 106.2, 103.5, 105.2, 160),
  ];

  return {
    pattern: "WYCKOFF_ACCUMULATION" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles),
  };
}

function wyckoffDistributionCase() {
  const candles = [
    ...trendingCandles(10, 80, 2),
    candle(10, 99, 116, 98, 114, 700),
    candle(11, 113, 114, 106, 107, 120),
    candle(12, 107, 108, 101, 102, 130),
    candle(13, 102, 103, 98, 99, 140),
    candle(14, 104, 115.4, 102, 112, 170),
    candle(15, 112, 113, 105, 106, 110),
    candle(16, 106, 107, 101, 102, 100),
    candle(17, 102, 103, 96, 97, 420),
    candle(18, 97.5, 99.8, 96.5, 97.8, 160),
  ];

  return {
    pattern: "WYCKOFF_DISTRIBUTION" as const,
    direction: "SHORT" as const,
    candles,
    indicators: indicatorSet(candles),
  };
}

function emaCrossCase() {
  const candles = trendingCandles(20, 100, 1);
  const ema9 = series(candles.length, 105);
  const ema21 = series(candles.length, 104);
  ema9[candles.length - 2] = 103;
  ema21[candles.length - 2] = 104;

  return {
    pattern: "MOMENTUM_EMA_CROSS" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles, {
      ema9,
      ema21,
      ema50: series(candles.length, 102),
      ema200: series(candles.length, 100),
      rsi14: risingSeries(candles.length, 55, 0.5),
      macd: macdSeries(candles.length, 1, 0.5, 0.5),
    }),
  };
}

function rsiDivergenceCase() {
  const candles = trendingCandles(18, 100, -0.2);
  candles[12] = candle(12, 94, 95, 91, 92);
  candles[15] = candle(15, 92, 93, 89, 90);
  candles[17] = candle(17, 92, 95, 91.5, 94);
  const rsi = series(candles.length, 45);
  rsi[12] = 28;
  rsi[15] = 36;

  return {
    pattern: "MOMENTUM_RSI_DIV" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles, {
      swingLows: [
        { index: 12, time: candles[12]!.time, price: 91, strength: 2 },
        { index: 15, time: candles[15]!.time, price: 89, strength: 2 },
      ],
      rsi14: rsi,
      macd: macdSeries(candles.length, -0.2, -0.1, 0.2, { previousHistogram: -0.1 }),
    }),
  };
}

function macdCase() {
  const candles = trendingCandles(20, 90, 0.4);
  const macd = macdSeries(candles.length, -0.1, -0.2, 0.1, {
    previousMacd: -0.4,
    previousSignal: -0.3,
    previousHistogram: -0.1,
  });

  return {
    pattern: "MOMENTUM_MACD" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles, {
      macd,
      ema50: risingSeries(candles.length, 92, 0.1),
      ema9: series(candles.length, 96),
      ema21: series(candles.length, 95),
    }),
  };
}

function breakerBlockCase() {
  const candles = trendingCandles(13, 104, -0.1);
  candles[9] = candle(9, 99, 100, 96, 97);
  candles[12] = candle(12, 100.8, 102, 100.2, 100.5);
  const block: OrderBlock = {
    type: "bullish",
    startIndex: 5,
    endIndex: 5,
    low: 100,
    high: 102,
    mitigationCount: 1,
  };

  return {
    pattern: "PA_BREAKER_BLOCK" as const,
    direction: "SHORT" as const,
    candles,
    indicators: indicatorSet(candles, { orderBlocks: [block] }),
  };
}

function supplyDemandCase() {
  const candles = trendingCandles(12, 104, 0.1);
  candles[5] = candle(5, 100.6, 101, 99.8, 100);
  candles[6] = candle(6, 101, 104, 100.8, 103.8);
  candles[11] = candle(11, 100.2, 101, 99.9, 100.6);

  return {
    pattern: "PA_SUPPLY_DEMAND" as const,
    direction: "LONG" as const,
    candles,
    indicators: indicatorSet(candles, { atr14: series(candles.length, 1) }),
  };
}

function doubleTopCase() {
  const candles = trendingCandles(18, 100, 0);
  candles[5] = candle(5, 109, 112, 108, 111);
  candles[9] = candle(9, 104, 105, 101, 102);
  candles[12] = candle(12, 110, 112.2, 109, 111.4);
  candles[17] = candle(17, 101.2, 102, 99, 100);

  return {
    pattern: "PA_DOUBLE_TOP_BOTTOM" as const,
    direction: "SHORT" as const,
    candles,
    indicators: indicatorSet(candles, {
      swingHighs: [
        { index: 5, time: candles[5]!.time, price: 112, strength: 3 },
        { index: 12, time: candles[12]!.time, price: 112.2, strength: 3 },
      ],
      swingLows: [{ index: 9, time: candles[9]!.time, price: 101, strength: 2 }],
    }),
  };
}

function indicatorSet(candles: Candle[], overrides: Partial<ComputedIndicators> = {}): ComputedIndicators {
  const length = candles.length;
  return {
    ema9: series(length, candles.at(-1)?.close ?? 0),
    ema21: series(length, candles.at(-1)?.close ?? 0),
    ema50: series(length, candles.at(-1)?.close ?? 0),
    ema200: series(length, candles.at(-1)?.close ?? 0),
    rsi14: series(length, 50),
    macd: macdSeries(length, 0, 0, 0),
    atr14: series(length, 2),
    volumeSma20: series(length, 100),
    bollingerBands: Array.from({ length }, () => ({ upper: Number.NaN, mid: Number.NaN, lower: Number.NaN })),
    swingHighs: [],
    swingLows: [],
    orderBlocks: [],
    fairValueGaps: [],
    marketStructure: { trend: "RANGING", bos: [], choch: [] },
    liquidityLevels: [],
    ...overrides,
  };
}

function trendingCandles(length: number, start: number, step: number, startTime = 1_700_000_000): Candle[] {
  return Array.from({ length }, (_value, index) => {
    const open = start + index * step;
    const close = open + step * 0.6;
    return candle(index, open, Math.max(open, close) + 1, Math.min(open, close) - 1, close, 100, startTime);
  });
}

function rangeCandles(length: number, low: number, high: number): Candle[] {
  const mid = (low + high) / 2;
  return Array.from({ length }, (_value, index) => {
    const close = index % 2 === 0 ? mid + 1 : mid - 1;
    return candle(index, mid, high - 0.2, low + 0.2, close, 100);
  });
}

function candle(
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100,
  startTime = 1_700_000_000,
): Candle {
  return {
    time: startTime + index * 300,
    open,
    high,
    low,
    close,
    volume,
  };
}

function series(length: number, value: number): number[] {
  return Array.from({ length }, () => value);
}

function risingSeries(length: number, start: number, step: number): number[] {
  return Array.from({ length }, (_value, index) => start + index * step);
}

function macdSeries(
  length: number,
  macd: number,
  signal: number,
  histogram: number,
  overrides: {
    previousMacd?: number;
    previousSignal?: number;
    previousHistogram?: number;
  } = {},
): { macd: number; signal: number; histogram: number }[] {
  const result = Array.from({ length }, () => ({ macd, signal, histogram }));
  if (length >= 2) {
    result[length - 2] = {
      macd: overrides.previousMacd ?? macd,
      signal: overrides.previousSignal ?? signal,
      histogram: overrides.previousHistogram ?? histogram,
    };
  }

  return result;
}
