"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { TradingChart } from "@/components/chart/TradingChart";
import { SignalDetail } from "@/components/signals/SignalDetail";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest, queryString } from "@/lib/api-client";
import type { Candle, Signal } from "@/lib/platform-types";

export function SignalPageView({ id }: { id: string }) {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const signal = useQuery({
    queryKey: ["signals", id],
    queryFn: () => apiRequest<{ signal: Signal }>(token, `/signals/${id}`),
    enabled: Boolean(token),
  });
  const candles = useQuery({
    queryKey: ["signal-candles", signal.data?.signal.market, signal.data?.signal.ticker, signal.data?.signal.timeframe],
    queryFn: () => {
      const selected = signal.data!.signal;
      return apiRequest<{ candles: Candle[] }>(
        token,
        `/market/ohlcv${queryString({
          ticker: selected.ticker,
          market: selected.market,
          timeframe: selected.timeframe,
          limit: 200,
        })}`,
      );
    },
    enabled: Boolean(token && signal.data?.signal),
  });

  return (
    <div className="p-4 md:p-6">
      <Link href="/dashboard" className="mb-5 inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
        <ArrowLeft className="h-4 w-4" />
        Signal feed
      </Link>
      {signal.isPending ? <Skeleton className="h-[680px] w-full" /> : null}
      {signal.isError ? <ErrorState message="Signal could not be loaded." retry={() => void signal.refetch()} /> : null}
      {signal.data ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded border border-border">
            {candles.isPending ? <Skeleton className="h-[640px]" /> : null}
            {candles.isError ? (
              <div className="p-4">
                <ErrorState message="Chart history is unavailable." retry={() => void candles.refetch()} />
              </div>
            ) : null}
            {candles.data ? <TradingChart candles={candles.data.candles} signal={signal.data.signal} /> : null}
          </div>
          <SignalDetail signal={signal.data.signal} standalone />
        </div>
      ) : null}
    </div>
  );
}
