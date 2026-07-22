import type { Candle, Market, Quote, TickerResult, Timeframe } from "@alphasignal/shared";

export type QuoteCallback = (quote: Quote) => void;
export type UnsubscribeFn = () => void;

export interface MarketProvider {
  readonly market: Market;
  getOHLCV(ticker: string, timeframe: Timeframe, limit: number): Promise<Candle[]>;
  getQuote(ticker: string): Promise<Quote>;
  searchTickers(query: string): Promise<TickerResult[]>;
  subscribeQuote?(ticker: string, callback: QuoteCallback): UnsubscribeFn;
}
