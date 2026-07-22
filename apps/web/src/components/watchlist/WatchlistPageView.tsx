"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { markets, type Market, type TickerResult } from "@alphasignal/shared";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest, queryString } from "@/lib/api-client";
import { cn } from "@/lib/classes";
import { price } from "@/lib/format";
import type { Quote, WatchlistItem } from "@/lib/platform-types";
import { useTradingStore } from "@/stores/trading-store";

export function WatchlistPageView() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const queryClient = useQueryClient();
  const router = useRouter();
  const setInstrument = useTradingStore((state) => state.setInstrument);
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<Market>("STOCKS");
  const items = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => apiRequest<{ items: WatchlistItem[] }>(token, "/watchlist"),
    enabled: Boolean(token),
  });
  const results = useQuery({
    queryKey: ["market-search", market, query],
    queryFn: () => apiRequest<{ tickers: TickerResult[] }>(token, `/market/search${queryString({ q: query, market })}`),
    enabled: Boolean(token && query.length > 0),
  });
  const add = useMutation({
    mutationFn: (instrument: { ticker: string; market: Market }) =>
      apiRequest(token, "/watchlist", { method: "POST", body: JSON.stringify(instrument) }),
    onSuccess: () => {
      setQuery("");
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(token, `/watchlist/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) setQuery(query.trim().toUpperCase());
  }

  function openChart(item: WatchlistItem) {
    setInstrument(item.ticker, item.market);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-6">
        <p className="text-xs text-text-muted">Markets</p>
        <h1 className="mt-1 text-2xl font-semibold">Watchlist</h1>
      </header>
      <section className="mb-6 rounded border border-border bg-background-surface p-4">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <select value={market} onChange={(event) => setMarket(event.target.value as Market)} className="h-10 rounded border border-border bg-background-base px-3 text-sm outline-none focus:border-accent">
            {markets.map((item) => <option key={item}>{item}</option>)}
          </select>
          <label className="flex h-10 min-w-0 flex-1 items-center rounded border border-border bg-background-base px-3 focus-within:border-accent">
            <Search className="h-4 w-4 text-text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
          </label>
          <Button type="submit">Search</Button>
        </form>
        {results.isFetching ? <Skeleton className="mt-3 h-12" /> : null}
        {results.data?.tickers.length ? (
          <div className="mt-3 divide-y divide-border rounded border border-border">
            {results.data.tickers.slice(0, 5).map((result) => (
              <div key={`${result.market}:${result.ticker}`} className="flex items-center justify-between gap-3 p-3">
                <span><strong className="font-mono text-sm">{result.ticker}</strong><span className="ml-3 text-sm text-text-muted">{result.name}</span></span>
                <Button size="sm" variant="primary" onClick={() => add.mutate({ ticker: result.ticker, market: result.market })} disabled={add.isPending}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        {add.isError ? <div className="mt-3"><ErrorState message={add.error.message} /></div> : null}
      </section>

      {items.isPending ? <Skeleton className="h-56" /> : null}
      {items.isError ? <ErrorState message="Watchlist could not be loaded." retry={() => void items.refetch()} /> : null}
      {items.data?.items.length === 0 ? <EmptyState title="Your watchlist is empty." /> : null}
      <div className="overflow-hidden rounded border border-border">
        {items.data?.items.map((item) => (
          <WatchlistRow key={item.id} item={item} token={token} onOpen={() => openChart(item)} onDelete={() => remove.mutate(item.id)} />
        ))}
      </div>
    </div>
  );
}

function WatchlistRow({ item, token, onOpen, onDelete }: { item: WatchlistItem; token: string; onOpen: () => void; onDelete: () => void }) {
  const quote = useQuery({
    queryKey: ["quote", item.market, item.ticker],
    queryFn: () => apiRequest<{ quote: Quote }>(token, `/market/quote${queryString({ ticker: item.ticker, market: item.market })}`),
    enabled: Boolean(token),
    refetchInterval: 20_000,
  });
  const change = quote.data?.quote.changePercent;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border bg-background-surface px-4 py-4 last:border-b-0">
      <button type="button" onClick={onOpen} className="min-w-0 text-left">
        <p className="font-mono text-sm font-medium">{item.ticker}</p>
        <p className="mt-1 text-xs text-text-muted">{item.market}</p>
      </button>
      <div className="ml-auto text-right">
        {quote.isPending ? <Skeleton className="h-8 w-24" /> : null}
        {quote.data ? <p className="numeric text-sm">{price(quote.data.quote.price)}</p> : null}
        {change !== undefined ? <p className={cn("numeric text-xs", change >= 0 ? "text-long" : "text-short")}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</p> : null}
      </div>
      <Button variant="ghost" size="icon" aria-label={`Remove ${item.ticker}`} onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
