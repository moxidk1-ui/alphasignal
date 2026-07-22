"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { markets, timeframes, type Market } from "@alphasignal/shared";
import { TradingChart } from "@/components/chart/TradingChart";
import { SignalCard } from "@/components/signals/SignalCard";
import { SignalDetail } from "@/components/signals/SignalDetail";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest, queryString } from "@/lib/api-client";
import { cn } from "@/lib/classes";
import { price } from "@/lib/format";
import type { Candle, Paginated, Quote, Signal, WatchlistItem } from "@/lib/platform-types";
import { useTradingStore } from "@/stores/trading-store";

export function DashboardView() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const { ticker, market, timeframe, selectedSignalId, setInstrument, setTimeframe, selectSignal, quotes } =
    useTradingStore();
  const [tickerInput, setTickerInput] = useState(ticker);

  const signals = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: () => apiRequest<Paginated<Signal>>(token, "/signals?pageSize=30&status=PUBLISHED"),
    enabled: Boolean(token),
  });
  const candles = useQuery({
    queryKey: ["candles", market, ticker, timeframe],
    queryFn: () =>
      apiRequest<{ candles: Candle[] }>(
        token,
        `/market/ohlcv${queryString({ ticker, market, timeframe, limit: 200 })}`,
      ),
    enabled: Boolean(token),
  });
  const quote = useQuery({
    queryKey: ["quote", market, ticker],
    queryFn: () => apiRequest<{ quote: Quote }>(token, `/market/quote${queryString({ ticker, market })}`),
    enabled: Boolean(token),
    refetchInterval: session?.user.plan === "FREE" ? 15_000 : false,
  });
  const watchlist = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => apiRequest<{ items: WatchlistItem[] }>(token, "/watchlist"),
    enabled: Boolean(token),
  });

  const selected =
    signals.data?.data.find((signal) => signal.id === selectedSignalId) ??
    signals.data?.data.find((signal) => signal.ticker === ticker && signal.market === market) ??
    signals.data?.data[0];
  const latestQuote = quotes[`${market}:${ticker}`] ?? quote.data?.quote;

  function applyTicker(event: FormEvent) {
    event.preventDefault();
    if (tickerInput.trim()) setInstrument(tickerInput.trim().toUpperCase(), market);
  }

  function chooseSignal(signal: Signal) {
    selectSignal(signal.id);
    setTickerInput(signal.ticker);
    setInstrument(signal.ticker, signal.market);
    setTimeframe(signal.timeframe);
  }

  return (
    <div className="flex min-h-[calc(100vh-40px)] flex-col xl:flex-row">
      <section className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background-surface px-4 py-3">
          <form onSubmit={applyTicker} className="flex h-10 items-center rounded border border-border bg-background-base px-3 focus-within:border-accent">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value)}
              aria-label="Ticker"
              className="w-28 bg-transparent px-2 font-mono text-sm uppercase outline-none"
            />
          </form>
          <select
            value={market}
            onChange={(event) => setInstrument(ticker, event.target.value as Market)}
            aria-label="Market"
            className="h-10 rounded border border-border bg-background-elevated px-3 text-sm outline-none focus:border-accent"
          >
            {markets.map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="flex overflow-hidden rounded border border-border">
            {timeframes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTimeframe(item)}
                className={cn("h-10 px-3 font-mono text-xs transition", item === timeframe ? "bg-accent text-white" : "bg-background-elevated text-text-muted hover:text-text-primary")}
              >
                {item}
              </button>
            ))}
          </div>
          {latestQuote ? (
            <div className="ml-auto text-right">
              <p className="numeric text-base">{price(latestQuote.price)}</p>
              {latestQuote.changePercent !== undefined ? (
                <p className={cn("numeric text-xs", latestQuote.changePercent >= 0 ? "text-long" : "text-short")}>
                  {latestQuote.changePercent >= 0 ? "+" : ""}{latestQuote.changePercent.toFixed(2)}%
                </p>
              ) : null}
            </div>
          ) : null}
        </header>

        {watchlist.data?.items.length ? (
          <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2">
            {watchlist.data.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTickerInput(item.ticker);
                  setInstrument(item.ticker, item.market);
                }}
                className={cn(
                  "rounded border px-3 py-1.5 font-mono text-xs transition",
                  ticker === item.ticker && market === item.market
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-text-muted hover:text-text-primary",
                )}
              >
                {item.ticker}
              </button>
            ))}
          </div>
        ) : null}

        <div id="chart" className="h-[min(62vh,640px)] min-h-[440px] border-b border-border">
          {candles.isPending ? <Skeleton className="h-full w-full" /> : null}
          {candles.isError ? (
            <div className="p-4">
              <ErrorState message="Unable to load candle history." retry={() => void candles.refetch()} />
            </div>
          ) : null}
          {candles.data ? <TradingChart candles={candles.data.candles} signal={selected} /> : null}
        </div>

        <div id="feed" className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">Live Signals</h2>
            {session?.user.role === "PROVIDER" || session?.user.role === "ADMIN" ? (
              <Link href="/signals/create" className="inline-flex h-8 items-center rounded border border-accent bg-accent px-3 text-sm font-medium text-white transition hover:bg-blue-500">
                Create Signal
              </Link>
            ) : null}
          </div>
          {signals.isPending ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-52" />
              <Skeleton className="h-52" />
            </div>
          ) : null}
          {signals.isError ? <ErrorState message="Unable to load signals." retry={() => void signals.refetch()} /> : null}
          {signals.data?.data.length === 0 ? <EmptyState title="No live signals are currently published." /> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {signals.data?.data.map((signal) => (
              <SignalCard key={signal.id} signal={signal} selected={selected?.id === signal.id} onSelect={chooseSignal} />
            ))}
          </div>
        </div>
      </section>

      <aside className="w-full shrink-0 xl:w-[320px]">
        {selected ? (
          <SignalDetail signal={selected} />
        ) : (
          <div className="p-4"><EmptyState title="Select a published signal to inspect levels." /></div>
        )}
      </aside>
    </div>
  );
}
