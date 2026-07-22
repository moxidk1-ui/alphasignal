"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { markets, timeframes, type Market, type Timeframe } from "@alphasignal/shared";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/classes";
import { price, strategyName } from "@/lib/format";
import type { AiSignalRecommendation } from "@/lib/platform-types";

export function AnalysisWorkbench() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const [ticker, setTicker] = useState("AAPL");
  const [market, setMarket] = useState<Market>("STOCKS");
  const [timeframe, setTimeframe] = useState<Timeframe>("M15");
  const [jobId, setJobId] = useState<string | null>(null);
  const request = useMutation({
    mutationFn: () => apiRequest<{ jobId: string }>(token, "/signals/analyze", {
      method: "POST",
      body: JSON.stringify({ ticker, market, timeframe }),
    }),
    onSuccess: ({ jobId: id }) => setJobId(id),
  });
  const analysis = useQuery({
    queryKey: ["ai-analysis", jobId],
    queryFn: () => apiRequest<{ status: "WAITING" | "ACTIVE" | "COMPLETED" | "FAILED"; result?: AiSignalRecommendation; error?: string }>(token, `/signals/analyze/${jobId}`),
    enabled: Boolean(token && jobId),
    refetchInterval: (query) => ["COMPLETED", "FAILED"].includes(query.state.data?.status ?? "") ? false : 2_000,
  });
  const result = analysis.data?.result;

  function submit(event: FormEvent) {
    event.preventDefault();
    request.mutate();
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-7">
        <p className="text-xs text-text-muted">Research workspace</p>
        <h1 className="mt-1 text-2xl font-semibold">AI Analysis</h1>
      </header>
      <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-3 border-b border-border pb-6">
        <Control label="Ticker"><input aria-label="Ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} /></Control>
        <Control label="Market"><select aria-label="Market" value={market} onChange={(event) => setMarket(event.target.value as Market)}>{markets.map((value) => <option key={value}>{value}</option>)}</select></Control>
        <Control label="Timeframe"><select aria-label="Timeframe" value={timeframe} onChange={(event) => setTimeframe(event.target.value as Timeframe)}>{timeframes.map((value) => <option key={value}>{value}</option>)}</select></Control>
        <Button type="submit" variant="primary" disabled={request.isPending || analysis.data?.status === "ACTIVE" || analysis.data?.status === "WAITING"}>
          <Sparkles className="h-4 w-4" /> Analyze
        </Button>
      </form>
      {request.isError ? <ErrorState message={request.error.message} /> : null}
      {analysis.data?.status === "WAITING" || analysis.data?.status === "ACTIVE" ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
      ) : null}
      {analysis.data?.status === "FAILED" ? <ErrorState message={analysis.data.error ?? "AI analysis failed."} /> : null}
      {result ? <Recommendation result={result} ticker={ticker} timeframe={timeframe} /> : (
        !jobId ? <div className="border border-dashed border-border px-6 py-14 text-center text-sm text-text-muted">Select an instrument and request structured market analysis.</div> : null
      )}
    </div>
  );
}

function Recommendation({ result, ticker, timeframe }: { result: AiSignalRecommendation; ticker: string; timeframe: Timeframe }) {
  const neutral = result.direction === "NEUTRAL";
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="rounded border border-border bg-background-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="font-medium">{ticker} / {timeframe}</h2><p className="mt-2 text-sm text-text-muted">{strategyName(result.strategy)}</p></div>
          <div className="text-right"><p className={cn("font-semibold", neutral ? "text-warning" : result.direction === "LONG" ? "text-long" : "text-short")}>{result.direction}</p><p className="numeric mt-1 text-sm text-text-muted">{result.confidence}% confidence</p></div>
        </div>
        <p className="mt-6 text-sm leading-7 text-text-muted">{result.rationale}</p>
        <p className="mt-5 border-t border-border pt-4 text-sm text-text-muted">{result.timeframeAlignment}</p>
      </div>
      <dl className="rounded border border-border bg-background-surface p-5 text-sm">
        <Level label="Entry" value={result.entryPrice} />
        <Level label="Stop Loss" value={result.stopLoss} tone="text-short" />
        <Level label="Take Profit 1" value={result.takeProfit1} tone="text-long" />
        <Level label="Take Profit 2" value={result.takeProfit2} tone="text-long" />
        <Level label="Take Profit 3" value={result.takeProfit3} tone="text-long" />
        <Level label="Risk / Reward" value={result.riskRewardRatio} suffix="R" />
      </dl>
    </section>
  );
}

function Level({ label, value, tone = "text-text-primary", suffix }: { label: string; value: number; tone?: string; suffix?: string }) {
  return <div className="flex items-center justify-between border-b border-border py-3 last:border-0"><dt className="text-text-muted">{label}</dt><dd className={cn("numeric", tone)}>{suffix ? `${value.toFixed(2)}${suffix}` : price(value)}</dd></div>;
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs text-text-muted">{label}<span className="mt-2 block [&_input]:h-10 [&_input]:w-32 [&_input]:rounded [&_input]:border [&_input]:border-border [&_input]:bg-background-surface [&_input]:px-3 [&_input]:font-mono [&_input]:text-sm [&_input]:text-text-primary [&_select]:h-10 [&_select]:rounded [&_select]:border [&_select]:border-border [&_select]:bg-background-surface [&_select]:px-3 [&_select]:text-sm [&_select]:text-text-primary">{children}</span></label>;
}
