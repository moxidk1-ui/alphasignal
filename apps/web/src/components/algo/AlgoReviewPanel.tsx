"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { TradingChart } from "@/components/chart/TradingChart";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest, queryString } from "@/lib/api-client";
import { cn } from "@/lib/classes";
import { price, strategyName, timeAgo } from "@/lib/format";
import type { AlgoPendingSignal, Candle } from "@/lib/platform-types";

export function AlgoReviewPanel() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: ["algo-detections"],
    queryFn: () => apiRequest<{ detections: AlgoPendingSignal[] }>(token, "/algo/detections"),
    enabled: Boolean(token),
  });
  const approve = useMutation({
    mutationFn: (detectionId: string) => apiRequest(token, `/algo/detections/${detectionId}/approve`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["algo-detections"] });
      void queryClient.invalidateQueries({ queryKey: ["signals"] });
    },
  });
  const reject = useMutation({
    mutationFn: (detectionId: string) => apiRequest(token, `/algo/detections/${detectionId}/reject`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["algo-detections"] }),
  });

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted">Autonomous Engine</p>
          <h1 className="mt-1 text-2xl font-semibold">Pending Detections</h1>
        </div>
        <Link
          href="/algo/config"
          className="inline-flex h-10 items-center rounded border border-border bg-background-elevated px-4 text-sm font-medium transition hover:border-slate-500"
        >
          Configure Engine
        </Link>
      </header>

      {pending.isPending ? (
        <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-[390px]" /><Skeleton className="h-[390px]" /></div>
      ) : null}
      {pending.isError ? <ErrorState message="Pending detections could not be loaded." retry={() => void pending.refetch()} /> : null}
      {pending.data?.detections.length === 0 ? (
        <EmptyState title="No detections require approval." action={<Link className="text-sm text-accent" href="/algo/config">Review scan settings</Link>} />
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {pending.data?.detections.map((signal) => (
          <DetectionCard
            key={signal.id}
            signal={signal}
            busy={approve.isPending || reject.isPending}
            onApprove={() => signal.algoDetectionId && approve.mutate(signal.algoDetectionId)}
            onReject={() => signal.algoDetectionId && reject.mutate(signal.algoDetectionId)}
          />
        ))}
      </div>
      {approve.isError || reject.isError ? (
        <div className="mt-4">
          <ErrorState message={(approve.error ?? reject.error)?.message ?? "Detection action failed."} />
        </div>
      ) : null}
    </div>
  );
}

function DetectionCard({
  signal,
  onApprove,
  onReject,
  busy,
}: {
  signal: AlgoPendingSignal;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const candles = useQuery({
    queryKey: ["detection-thumbnail", signal.market, signal.ticker, signal.timeframe],
    queryFn: () =>
      apiRequest<{ candles: Candle[] }>(
        token,
        `/market/ohlcv${queryString({ ticker: signal.ticker, market: signal.market, timeframe: signal.timeframe, limit: 70 })}`,
      ),
    enabled: Boolean(token),
  });

  return (
    <article className="rounded border border-border bg-background-surface">
      <header className="flex items-start justify-between px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{signal.ticker}</h2>
            <span className={cn("text-sm font-semibold", signal.direction === "LONG" ? "text-long" : "text-short")}>{signal.direction}</span>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {strategyName(signal.strategy)} / {signal.timeframe} / {timeAgo(signal.createdAt)}
          </p>
        </div>
        <span className="numeric rounded bg-algo/15 px-2 py-1 text-sm text-algo">{signal.confidence}%</span>
      </header>
      <div className="h-36 border-y border-border">
        {candles.isPending ? <Skeleton className="h-full" /> : null}
        {candles.data ? <TradingChart compact candles={candles.data.candles} signal={signal} /> : null}
        {candles.isError ? <p className="p-4 text-xs text-short">Chart unavailable</p> : null}
      </div>
      <div className="grid grid-cols-4 gap-3 px-4 py-4 text-xs">
        <Level label="Entry" value={signal.entryPrice} />
        <Level label="SL" value={signal.stopLoss} tone="text-short" />
        <Level label="TP1" value={signal.takeProfit1} tone="text-long" />
        <Level label="R:R" value={signal.riskRewardRatio} suffix="R" />
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-border p-4">
        <Button variant="primary" size="sm" disabled={busy || !signal.algoDetectionId} onClick={onApprove}>
          <Check className="h-4 w-4" /> Approve & Publish
        </Button>
        <Link
          href={`/signals/create?from=${signal.id}`}
          className="inline-flex h-8 items-center gap-2 rounded border border-border bg-background-elevated px-3 text-sm font-medium transition hover:border-slate-500"
        >
          <Pencil className="h-4 w-4" /> Edit
        </Link>
        <Button variant="danger" size="sm" disabled={busy || !signal.algoDetectionId} onClick={onReject}>
          <X className="h-4 w-4" /> Reject
        </Button>
      </footer>
    </article>
  );
}

function Level({ label, value, tone = "text-text-primary", suffix = "" }: { label: string; value: number; tone?: string; suffix?: string }) {
  return (
    <div>
      <p className="text-text-muted">{label}</p>
      <p className={cn("numeric mt-1", tone)}>{suffix ? `${value.toFixed(2)}${suffix}` : price(value)}</p>
    </div>
  );
}
