import type { Timeframe } from "@alphasignal/shared";

export interface AggregateWindow {
  multiplier: number;
  timespan: "minute" | "hour" | "day" | "week";
}

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replaceAll(" ", "");
}

export function toMilliseconds(timestamp: number | string): number {
  const numeric = typeof timestamp === "string" ? Date.parse(timestamp) : timestamp;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

export function toSeconds(timestamp: number | string): number {
  return Math.floor(toMilliseconds(timestamp) / 1000);
}

export function timeframeToMinutes(timeframe: Timeframe): number {
  switch (timeframe) {
    case "M1":
      return 1;
    case "M5":
      return 5;
    case "M15":
      return 15;
    case "M30":
      return 30;
    case "H1":
      return 60;
    case "H4":
      return 240;
    case "D1":
      return 1440;
    case "W1":
      return 10080;
  }
}

export function toAlpacaTimeframe(timeframe: Timeframe): string {
  switch (timeframe) {
    case "M1":
      return "1Min";
    case "M5":
      return "5Min";
    case "M15":
      return "15Min";
    case "M30":
      return "30Min";
    case "H1":
      return "1Hour";
    case "H4":
      return "4Hour";
    case "D1":
      return "1Day";
    case "W1":
      return "1Week";
  }
}

export function toBinanceInterval(timeframe: Timeframe): string {
  switch (timeframe) {
    case "M1":
      return "1m";
    case "M5":
      return "5m";
    case "M15":
      return "15m";
    case "M30":
      return "30m";
    case "H1":
      return "1h";
    case "H4":
      return "4h";
    case "D1":
      return "1d";
    case "W1":
      return "1w";
  }
}

export function toPolygonWindow(timeframe: Timeframe): AggregateWindow {
  switch (timeframe) {
    case "M1":
      return { multiplier: 1, timespan: "minute" };
    case "M5":
      return { multiplier: 5, timespan: "minute" };
    case "M15":
      return { multiplier: 15, timespan: "minute" };
    case "M30":
      return { multiplier: 30, timespan: "minute" };
    case "H1":
      return { multiplier: 1, timespan: "hour" };
    case "H4":
      return { multiplier: 4, timespan: "hour" };
    case "D1":
      return { multiplier: 1, timespan: "day" };
    case "W1":
      return { multiplier: 1, timespan: "week" };
  }
}

export function historicalStartDate(timeframe: Timeframe, limit: number): string {
  const minutes = timeframeToMinutes(timeframe) * Math.max(limit + 20, 100);
  return new Date(Date.now() - minutes * 60 * 1000).toISOString().slice(0, 10);
}
