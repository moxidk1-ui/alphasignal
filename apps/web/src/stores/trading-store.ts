"use client";

import type { Market, Quote, Timeframe } from "@alphasignal/shared";
import { create } from "zustand";

type WebSocketStatus = "offline" | "connecting" | "live" | "unavailable";

interface TradingState {
  ticker: string;
  market: Market;
  timeframe: Timeframe;
  selectedSignalId: string | null;
  websocketStatus: WebSocketStatus;
  quotes: Record<string, Quote>;
  setInstrument: (ticker: string, market: Market) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  selectSignal: (signalId: string | null) => void;
  setWebsocketStatus: (status: WebSocketStatus) => void;
  receiveQuote: (quote: Quote) => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  ticker: "AAPL",
  market: "STOCKS",
  timeframe: "M15",
  selectedSignalId: null,
  websocketStatus: "offline",
  quotes: {},
  setInstrument: (ticker, market) => set({ ticker, market }),
  setTimeframe: (timeframe) => set({ timeframe }),
  selectSignal: (selectedSignalId) => set({ selectedSignalId }),
  setWebsocketStatus: (websocketStatus) => set({ websocketStatus }),
  receiveQuote: (quote) =>
    set((state) => ({
      quotes: { ...state.quotes, [`${quote.market}:${quote.ticker}`]: quote },
    })),
}));
