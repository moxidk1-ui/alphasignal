import { describe, expect, it } from "vitest";
import type { Candle } from "@alphasignal/shared";
import { evaluateSignalOutcome } from "./signal-outcome-evaluator.js";

describe("evaluateSignalOutcome", () => {
  it("marks a long signal as a verified win when the first target is reached", () => {
    const outcome = evaluateSignalOutcome(longSignal, [candle({ high: 102.5 })]);

    expect(outcome).toEqual({
      status: "RESOLVED",
      result: "WIN",
      outcomePrice: 102,
      outcomeObservedAt: new Date("2026-07-22T12:15:00.000Z"),
      pnlPercent: 2,
    });
  });

  it("marks a short signal as a verified loss when its stop is reached", () => {
    const outcome = evaluateSignalOutcome(
      { ...longSignal, direction: "SHORT", stopLoss: 102, takeProfit1: 98 },
      [candle({ high: 102.25 })],
    );

    expect(outcome).toEqual(
      expect.objectContaining({
        status: "RESOLVED",
        result: "LOSS",
        outcomePrice: 102,
        pnlPercent: -2,
      }),
    );
  });

  it("refuses to guess intrabar order when stop and target touch in the same candle", () => {
    const outcome = evaluateSignalOutcome(longSignal, [candle({ high: 103, low: 97 })]);

    expect(outcome).toEqual({
      status: "AMBIGUOUS",
      outcomeObservedAt: new Date("2026-07-22T12:15:00.000Z"),
    });
  });

  it("ignores candles that predate publication", () => {
    const outcome = evaluateSignalOutcome(longSignal, [
      candle({ time: epoch("2026-07-22T11:45:00.000Z"), high: 103 }),
      candle({ high: 101, low: 99 }),
    ]);

    expect(outcome).toBeUndefined();
  });
});

const longSignal = {
  direction: "LONG" as const,
  entryPrice: 100,
  stopLoss: 98,
  takeProfit1: 102,
  publishedAt: new Date("2026-07-22T12:00:00.000Z"),
};

function candle(overrides: Partial<Candle>): Candle {
  return {
    time: epoch("2026-07-22T12:15:00.000Z"),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000,
    ...overrides,
  };
}

function epoch(value: string): number {
  return Math.floor(new Date(value).getTime() / 1_000);
}
