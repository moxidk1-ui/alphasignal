import { describe, expect, it } from "vitest";
import type { Candle } from "@alphasignal/shared";
import {
  computeATR,
  computeBollingerBands,
  computeEMA,
  computeMACD,
  computeRSI,
  computeVolumeSMA,
  detectLiquidityLevels,
  detectMarketStructure,
  findFairValueGaps,
  findOrderBlocks,
  findSwingHighs,
  findSwingLows,
} from "./index.js";

describe("indicator math", () => {
  it("computes EMA with index-aligned warmup values", () => {
    const candles = candlesFromCloses([1, 2, 3, 4, 5, 6]);
    const ema = computeEMA(candles, 3);

    expect(ema.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(ema[2]).toBe(2);
    expect(ema[3]).toBe(3);
    expect(ema[5]).toBe(5);
  });

  it("computes RSI using Wilder smoothing", () => {
    const candles = candlesFromCloses([10, 11, 12, 13, 14, 15, 16]);
    const rsi = computeRSI(candles, 3);

    expect(rsi.slice(0, 3).every(Number.isNaN)).toBe(true);
    expect(rsi[3]).toBe(100);
    expect(rsi[6]).toBe(100);
  });

  it("computes MACD, signal, and histogram with sparse warmup alignment", () => {
    const candles = candlesFromCloses([1, 2, 3, 4, 5, 6, 7, 8]);
    const macd = computeMACD(candles, 2, 4, 2);

    expect(macd).toHaveLength(candles.length);
    expect(macd[2]!.macd).toSatisfy(Number.isNaN);
    expect(macd[4]!.macd).toBeGreaterThan(0);
    expect(macd[4]!.signal).toBeGreaterThan(0);
    expect(macd[4]!.histogram).toBeCloseTo(macd[4]!.macd - macd[4]!.signal, 10);
  });

  it("computes ATR with true range gaps", () => {
    const candles = [
      candle(0, 10, 11, 9, 10),
      candle(1, 10, 12, 9, 11),
      candle(2, 15, 16, 14, 15),
      candle(3, 15, 18, 14, 17),
    ];
    const atr = computeATR(candles, 2);

    expect(atr[0]).toSatisfy(Number.isNaN);
    expect(atr[1]).toSatisfy(Number.isNaN);
    expect(atr[2]).toBeCloseTo(4, 10);
    expect(atr[3]).toBeCloseTo(4, 10);
  });

  it("computes volume SMA and Bollinger Bands", () => {
    const candles = candlesFromCloses([10, 12, 14, 16], [100, 200, 300, 400]);
    const volumeSma = computeVolumeSMA(candles, 2);
    const bands = computeBollingerBands(candles, 2, 2);

    expect(volumeSma[0]).toSatisfy(Number.isNaN);
    expect(volumeSma[1]).toBe(150);
    expect(bands[1]!.mid).toBe(11);
    expect(bands[1]!.upper).toBe(13);
    expect(bands[1]!.lower).toBe(9);
  });
});

describe("structure helpers", () => {
  it("finds swing highs and lows", () => {
    const candles = [
      candle(0, 10, 10.5, 9.5, 10),
      candle(1, 10, 12, 9.8, 11),
      candle(2, 11, 11.5, 8.5, 9),
      candle(3, 9, 10.2, 9, 10),
      candle(4, 10, 10.4, 9.4, 10),
    ];

    expect(findSwingHighs(candles, 1)).toEqual([
      { index: 1, time: 1_700_000_060, price: 12, strength: 0.5 },
    ]);
    expect(findSwingLows(candles, 1)).toEqual([
      { index: 2, time: 1_700_000_120, price: 8.5, strength: 0.5 },
    ]);
  });

  it("detects order blocks and fair value gaps", () => {
    const candles = [
      candle(0, 100, 100.5, 99.5, 100.2),
      candle(1, 100.2, 100.5, 99.4, 99.6),
      candle(2, 101, 104, 101, 103.6),
      candle(3, 104, 107, 104.2, 106.2),
      candle(4, 106, 106.5, 103, 104),
      candle(5, 104, 105, 102, 103),
    ];

    expect(findOrderBlocks(candles).some((block) => block.type === "bullish")).toBe(true);
    expect(findFairValueGaps(candles)).toContainEqual({
      type: "bullish",
      index: 1,
      low: 100.5,
      high: 101,
      midpoint: 100.75,
      filled: false,
    });
  });

  it("detects market structure events and liquidity levels", () => {
    const candles = [
      candle(0, 100, 101, 99, 100),
      candle(1, 100, 106, 100, 104),
      candle(2, 104, 112, 102, 108),
      candle(3, 108, 109, 101, 103),
      candle(4, 103, 104, 100, 102),
      candle(5, 102, 112.05, 103, 110),
      candle(6, 110, 111, 104, 105),
      candle(7, 105, 106, 102, 104),
      candle(8, 104, 114, 105, 113),
      candle(9, 113, 113.5, 106, 108),
      candle(10, 108, 113, 107, 112),
      candle(11, 112, 112.5, 108, 111),
    ];

    const structure = detectMarketStructure(candles);
    const liquidity = detectLiquidityLevels([
      ...candles,
      candle(12, 104, 106.003, 102, 105, 100, 1_700_086_400),
      candle(13, 105, 105.5, 101, 102, 100, 1_700_086_400),
    ]);

    expect(structure.trend).toBe("BULLISH");
    expect(structure.bos.length).toBeGreaterThan(0);
    expect(liquidity.some((level) => level.type === "equal_highs")).toBe(true);
    expect(liquidity.some((level) => level.type === "session_high")).toBe(true);
  });
});

function candlesFromCloses(closes: number[], volumes?: number[]): Candle[] {
  return closes.map((close, index) =>
    candle(index, close, close + 1, close - 1, close, volumes?.[index] ?? 100),
  );
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
    time: startTime + index * 60,
    open,
    high,
    low,
    close,
    volume,
  };
}
