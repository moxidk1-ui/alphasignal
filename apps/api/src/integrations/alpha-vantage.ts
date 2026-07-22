import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Candle, Quote, TickerResult, Timeframe } from "@alphasignal/shared";
import type { AppConfig } from "../config/env.js";
import { MarketDataError } from "../utils/errors.js";
import { normalizeTicker, toSeconds } from "../utils/market.js";
import { ProviderCircuit } from "./circuit-breaker.js";
import type { ExternalQuotaTracker } from "./external-quota.js";
import { fetchJson } from "./fetch-json.js";
import type { MarketProvider } from "./types.js";

const alphaPayloadSchema = z.record(z.unknown());
const exchangeRateSchema = z.object({
  "Realtime Currency Exchange Rate": z.object({
    "1. From_Currency Code": z.string(),
    "2. From_Currency Name": z.string(),
    "3. To_Currency Code": z.string(),
    "5. Exchange Rate": z.string(),
    "6. Last Refreshed": z.string(),
    "8. Bid Price": z.string().optional(),
    "9. Ask Price": z.string().optional(),
  }),
});

const majorPairs = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
];

export class AlphaVantageIntegration implements MarketProvider {
  readonly market = "FOREX" as const;
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    private readonly quota: ExternalQuotaTracker,
    logger: FastifyBaseLogger,
  ) {
    this.circuit = new ProviderCircuit("alpha-vantage", logger);
  }

  getOHLCV(ticker: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    return this.circuit.execute(async () => {
      await this.quota.trackAlphaVantage();
      const [fromSymbol, toSymbol] = forexPair(ticker);
      const url = new URL(this.config.ALPHA_VANTAGE_BASE_URL);
      const requestTimeframe = timeframe === "H4" ? "H1" : timeframe;
      url.searchParams.set("function", alphaFunction(requestTimeframe));
      url.searchParams.set("from_symbol", fromSymbol);
      url.searchParams.set("to_symbol", toSymbol);
      if (!["D1", "W1"].includes(requestTimeframe)) {
        url.searchParams.set("interval", alphaInterval(requestTimeframe));
      }
      url.searchParams.set("outputsize", "full");
      url.searchParams.set("apikey", this.config.ALPHA_VANTAGE_API_KEY);

      const payload = await fetchJson("alpha-vantage", url, alphaPayloadSchema);
      const series = extractTimeSeries(payload);
      const candles = Object.entries(series)
        .map(([time, value]) => toCandle(time, value))
        .sort((left, right) => left.time - right.time);
      const normalized = timeframe === "H4" ? aggregateCandles(candles, 4) : candles;

      return normalized.slice(-limit);
    });
  }

  getQuote(ticker: string): Promise<Quote> {
    return this.circuit.execute(async () => {
      await this.quota.trackAlphaVantage();
      const [fromSymbol, toSymbol] = forexPair(ticker);
      const url = new URL(this.config.ALPHA_VANTAGE_BASE_URL);
      url.searchParams.set("function", "CURRENCY_EXCHANGE_RATE");
      url.searchParams.set("from_currency", fromSymbol);
      url.searchParams.set("to_currency", toSymbol);
      url.searchParams.set("apikey", this.config.ALPHA_VANTAGE_API_KEY);
      const payload = await fetchJson("alpha-vantage", url, exchangeRateSchema);
      const rate = payload["Realtime Currency Exchange Rate"];
      const bid = rate["8. Bid Price"] ? Number(rate["8. Bid Price"]) : undefined;
      const ask = rate["9. Ask Price"] ? Number(rate["9. Ask Price"]) : undefined;

      return {
        ticker: `${fromSymbol}${toSymbol}`,
        market: "FOREX",
        price: Number(rate["5. Exchange Rate"]),
        timestamp: toSeconds(`${rate["6. Last Refreshed"]}Z`),
        ...(bid !== undefined ? { bid } : {}),
        ...(ask !== undefined ? { ask } : {}),
      };
    });
  }

  async searchTickers(query: string): Promise<TickerResult[]> {
    const needle = normalizeTicker(query).replaceAll("/", "");
    return majorPairs
      .filter((pair) => pair.includes(needle))
      .map((pair) => ({
        ticker: pair,
        market: "FOREX",
        name: `${pair.slice(0, 3)}/${pair.slice(3)}`,
        currency: pair.slice(3),
      }));
  }
}

function forexPair(ticker: string): [string, string] {
  const normalized = normalizeTicker(ticker).replaceAll("/", "").replaceAll("-", "");
  if (normalized.length !== 6) {
    throw new MarketDataError("alpha-vantage", "Forex ticker must be a six-letter currency pair.");
  }

  return [normalized.slice(0, 3), normalized.slice(3)];
}

function alphaFunction(timeframe: Timeframe): string {
  if (timeframe === "D1") {
    return "FX_DAILY";
  }
  if (timeframe === "W1") {
    return "FX_WEEKLY";
  }
  return "FX_INTRADAY";
}

function alphaInterval(timeframe: Timeframe): string {
  switch (timeframe) {
    case "M1":
      return "1min";
    case "M5":
      return "5min";
    case "M15":
      return "15min";
    case "M30":
      return "30min";
    case "H1":
    case "H4":
      return "60min";
    case "D1":
    case "W1":
      return "60min";
  }
}

function extractTimeSeries(payload: Record<string, unknown>): Record<string, Record<string, string>> {
  const error = payload["Error Message"] ?? payload.Note ?? payload.Information;
  if (typeof error === "string") {
    throw new MarketDataError("alpha-vantage");
  }

  const key = Object.keys(payload).find((entry) => entry.toLowerCase().includes("time series"));
  const rawSeries = key ? payload[key] : undefined;
  const result = z.record(z.record(z.string())).safeParse(rawSeries);
  if (!result.success) {
    throw new MarketDataError("alpha-vantage", "Market data provider returned an invalid response.");
  }

  return result.data;
}

function toCandle(timestamp: string, values: Record<string, string>): Candle {
  return {
    time: toSeconds(`${timestamp}Z`),
    open: Number(values["1. open"]),
    high: Number(values["2. high"]),
    low: Number(values["3. low"]),
    close: Number(values["4. close"]),
    volume: 0,
  };
}

function aggregateCandles(candles: Candle[], size: number): Candle[] {
  const result: Candle[] = [];
  for (let index = 0; index < candles.length; index += size) {
    const group = candles.slice(index, index + size);
    if (group.length < size) {
      continue;
    }
    result.push({
      time: group[0]!.time,
      open: group[0]!.open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group[group.length - 1]!.close,
      volume: 0,
    });
  }
  return result;
}
