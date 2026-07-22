"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, CircleCheck, PenLine, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { markets, signalStrategies, timeframes, type Direction, type Market, type SignalStrategy, type Timeframe } from "@alphasignal/shared";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/classes";
import type { AiSignalRecommendation, Signal } from "@/lib/platform-types";

type Mode = "MANUAL" | "AI_HYBRID";

interface FormState {
  ticker: string;
  market: Market;
  timeframe: Timeframe;
  direction: Direction;
  entryPrice: string;
  stopLoss: string;
  takeProfit1: string;
  takeProfit2: string;
  takeProfit3: string;
  riskRewardRatio: string;
  strategy: SignalStrategy;
  confidence: string;
  rationale: string;
  keyLevels: Record<string, unknown>;
}

const initialForm: FormState = {
  ticker: "AAPL",
  market: "STOCKS",
  timeframe: "M15",
  direction: "LONG",
  entryPrice: "",
  stopLoss: "",
  takeProfit1: "",
  takeProfit2: "",
  takeProfit3: "",
  riskRewardRatio: "2",
  strategy: "MANUAL",
  confidence: "70",
  rationale: "",
  keyLevels: {},
};

export function SignalCreateForm({ fromSignalId }: { fromSignalId?: string | undefined }) {
  const { data: session } = useSession();
  const router = useRouter();
  const token = session?.accessToken ?? "";
  const [mode, setMode] = useState<Mode>("MANUAL");
  const [form, setForm] = useState<FormState>(initialForm);
  const [jobId, setJobId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const sourceSignal = useQuery({
    queryKey: ["signals", "prefill", fromSignalId],
    queryFn: () => apiRequest<{ signal: Signal }>(token, `/signals/${fromSignalId}`),
    enabled: Boolean(token && fromSignalId),
  });
  const editingDetection = sourceSignal.data?.signal.status === "PENDING_APPROVAL" && sourceSignal.data.signal.source === "ALGO";

  useEffect(() => {
    if (!sourceSignal.data) return;
    setForm(fromSignal(sourceSignal.data.signal));
  }, [sourceSignal.data]);

  const analysis = useQuery({
    queryKey: ["ai-analysis", jobId],
    queryFn: () =>
      apiRequest<{ status: "WAITING" | "ACTIVE" | "COMPLETED" | "FAILED"; result?: AiSignalRecommendation; error?: string }>(
        token,
        `/signals/analyze/${jobId}`,
      ),
    enabled: Boolean(token && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "COMPLETED" || status === "FAILED" ? false : 2_000;
    },
  });
  const aiReady = analysis.data?.status === "COMPLETED" && analysis.data.result?.direction !== "NEUTRAL";

  useEffect(() => {
    const recommendation = analysis.data?.result;
    if (!recommendation || recommendation.direction === "NEUTRAL") return;
    const direction: Direction = recommendation.direction;
    setForm((current) => ({
      ticker: current.ticker,
      market: current.market,
      timeframe: current.timeframe,
      direction,
      entryPrice: String(recommendation.entryPrice),
      stopLoss: String(recommendation.stopLoss),
      takeProfit1: String(recommendation.takeProfit1),
      takeProfit2: String(recommendation.takeProfit2),
      takeProfit3: String(recommendation.takeProfit3),
      riskRewardRatio: String(recommendation.riskRewardRatio),
      strategy: recommendation.strategy,
      confidence: String(recommendation.confidence),
      rationale: recommendation.rationale,
      keyLevels: recommendation.keyLevels as unknown as Record<string, unknown>,
    }));
  }, [analysis.data?.result]);

  const requestAnalysis = useMutation({
    mutationFn: () =>
      apiRequest<{ jobId: string }>(token, "/signals/analyze", {
        method: "POST",
        body: JSON.stringify({ ticker: form.ticker, market: form.market, timeframe: form.timeframe }),
      }),
    onSuccess: (response) => setJobId(response.jobId),
  });
  const save = useMutation({
    mutationFn: (status: "DRAFT" | "PUBLISHED") => {
      const fields = {
        ticker: form.ticker,
        market: form.market,
        timeframe: form.timeframe,
        direction: form.direction,
        entryPrice: Number(form.entryPrice),
        stopLoss: Number(form.stopLoss),
        takeProfit1: Number(form.takeProfit1),
        takeProfit2: Number(form.takeProfit2),
        takeProfit3: Number(form.takeProfit3),
        riskRewardRatio: Number(form.riskRewardRatio),
        strategy: form.strategy,
        confidence: Number(form.confidence),
        rationale: form.rationale,
        keyLevels: form.keyLevels,
      };
      if (editingDetection && fromSignalId) {
        return apiRequest<{ signal: Signal }>(token, `/signals/${fromSignalId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...fields, ...(status === "PUBLISHED" ? { status } : {}) }),
        });
      }
      return apiRequest<{ signal: Signal }>(token, "/signals", {
        method: "POST",
        body: JSON.stringify({ ...fields, source: mode, status }),
      });
    },
    onSuccess: ({ signal }) => {
      setPublished(signal.status === "PUBLISHED");
      router.push(`/signals/${signal.id}`);
    },
  });

  function submit(event: FormEvent, status: "DRAFT" | "PUBLISHED") {
    event.preventDefault();
    save.mutate(status);
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-text-muted">Provider Workspace</p>
          <h1 className="mt-1 text-2xl font-semibold">Create Signal</h1>
        </div>
        {!editingDetection ? (
          <div className="flex overflow-hidden rounded border border-border">
            <ModeButton selected={mode === "MANUAL"} onClick={() => setMode("MANUAL")} icon={PenLine}>Manual</ModeButton>
            <ModeButton selected={mode === "AI_HYBRID"} onClick={() => setMode("AI_HYBRID")} icon={Sparkles}>AI Hybrid</ModeButton>
          </div>
        ) : null}
      </header>

      {sourceSignal.isPending && fromSignalId ? <Skeleton className="mb-4 h-12" /> : null}
      {sourceSignal.isError ? <ErrorState message="The detection could not be loaded for editing." /> : null}
      {editingDetection ? (
        <div className="mb-4 rounded border border-algo/30 bg-algo/10 p-3 text-sm text-algo">
          Editing an algo detection. Publishing retains its algorithmic source and closes the approval request.
        </div>
      ) : null}
      {published ? (
        <div className="mb-4 flex items-center gap-2 rounded border border-long/30 bg-long/10 p-3 text-sm text-long">
          <CircleCheck className="h-4 w-4" /> Signal published.
        </div>
      ) : null}

      {mode === "AI_HYBRID" ? (
        <section className="mb-5 rounded border border-border bg-background-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <Bot className="h-5 w-5 text-accent" />
              <span>Claude analysis for {form.ticker} / {form.timeframe}</span>
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={() => requestAnalysis.mutate()}
              disabled={requestAnalysis.isPending || analysis.data?.status === "ACTIVE" || analysis.data?.status === "WAITING"}
            >
              <Sparkles className="h-4 w-4" />
              Analyze
            </Button>
          </div>
          {requestAnalysis.isError ? <div className="mt-4"><ErrorState message={requestAnalysis.error.message} /></div> : null}
          {analysis.data?.status === "WAITING" || analysis.data?.status === "ACTIVE" ? (
            <div className="mt-4 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
          ) : null}
          {analysis.data?.status === "FAILED" ? <div className="mt-4"><ErrorState message={analysis.data.error ?? "AI analysis failed."} /></div> : null}
          {analysis.data?.result?.direction === "NEUTRAL" ? (
            <div className="mt-4 rounded border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              The analysis returned a neutral bias; no publishable trade levels were applied.
            </div>
          ) : null}
          {analysis.data?.status === "COMPLETED" && analysis.data.result?.direction !== "NEUTRAL" ? (
            <p className="mt-4 text-sm text-long">Analysis is ready. Review the populated levels before publishing.</p>
          ) : null}
        </section>
      ) : null}

      <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5 rounded border border-border bg-background-surface p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Ticker">
              <input value={form.ticker} onChange={(event) => update("ticker", event.target.value.toUpperCase())} required />
            </Field>
            <Field label="Market">
              <select value={form.market} onChange={(event) => update("market", event.target.value as Market)}>
                {markets.map((market) => <option key={market}>{market}</option>)}
              </select>
            </Field>
            <Field label="Timeframe">
              <select value={form.timeframe} onChange={(event) => update("timeframe", event.target.value as Timeframe)}>
                {timeframes.map((timeframe) => <option key={timeframe}>{timeframe}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Direction">
              <select value={form.direction} onChange={(event) => update("direction", event.target.value as Direction)}>
                <option>LONG</option><option>SHORT</option>
              </select>
            </Field>
            <Field label="Strategy">
              <select value={form.strategy} onChange={(event) => update("strategy", event.target.value as SignalStrategy)}>
                {signalStrategies.map((strategy) => <option key={strategy}>{strategy}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <PriceField label="Entry Price" field="entryPrice" />
            <PriceField label="Stop Loss" field="stopLoss" />
            <PriceField label="Take Profit 1" field="takeProfit1" />
            <PriceField label="Take Profit 2" field="takeProfit2" />
            <PriceField label="Take Profit 3" field="takeProfit3" />
            <PriceField label="Risk / Reward" field="riskRewardRatio" />
          </div>
        </section>

        <section className="space-y-5 rounded border border-border bg-background-surface p-5">
          <Field label={`Confidence ${form.confidence}%`}>
            <input type="range" min="1" max="100" value={form.confidence} onChange={(event) => update("confidence", event.target.value)} />
          </Field>
          <Field label="Rationale">
            <textarea
              rows={9}
              value={form.rationale}
              onChange={(event) => update("rationale", event.target.value)}
              minLength={10}
              maxLength={4000}
              required
            />
          </Field>
          {save.isError ? <ErrorState message={save.error.message} /> : null}
          <div className="grid gap-2">
            <Button type="button" variant="primary" onClick={(event) => submit(event, "PUBLISHED")} disabled={save.isPending || (mode === "AI_HYBRID" && !aiReady)}>
              Publish Signal
            </Button>
            <Button type="button" onClick={(event) => submit(event, "DRAFT")} disabled={save.isPending || (mode === "AI_HYBRID" && !aiReady)}>
              {editingDetection ? "Save Changes" : "Save Draft"}
            </Button>
          </div>
        </section>
      </form>
    </div>
  );

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function PriceField({ label, field }: { label: string; field: keyof Pick<FormState, "entryPrice" | "stopLoss" | "takeProfit1" | "takeProfit2" | "takeProfit3" | "riskRewardRatio"> }) {
    return (
      <Field label={label}>
        <input
          className="numeric"
          type="number"
          min="0"
          step="any"
          value={form[field]}
          onChange={(event) => update(field, event.target.value)}
          required
        />
      </Field>
    );
  }
}

function ModeButton({ selected, onClick, icon: Icon, children }: { selected: boolean; onClick: () => void; icon: typeof PenLine; children: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-10 items-center gap-2 px-4 text-sm", selected ? "bg-accent text-white" : "bg-background-elevated text-text-muted")}>
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm text-text-muted [&_input]:mt-2 [&_input]:h-10 [&_input]:w-full [&_input]:rounded [&_input]:border [&_input]:border-border [&_input]:bg-background-base [&_input]:px-3 [&_input]:text-text-primary [&_input]:outline-none [&_input]:focus:border-accent [&_select]:mt-2 [&_select]:h-10 [&_select]:w-full [&_select]:rounded [&_select]:border [&_select]:border-border [&_select]:bg-background-base [&_select]:px-3 [&_select]:text-text-primary [&_select]:outline-none [&_select]:focus:border-accent [&_textarea]:mt-2 [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:rounded [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-background-base [&_textarea]:p-3 [&_textarea]:text-text-primary [&_textarea]:outline-none [&_textarea]:focus:border-accent">
      {label}
      {children}
    </label>
  );
}

function fromSignal(signal: Signal): FormState {
  return {
    ticker: signal.ticker,
    market: signal.market,
    timeframe: signal.timeframe,
    direction: signal.direction,
    entryPrice: String(signal.entryPrice),
    stopLoss: String(signal.stopLoss),
    takeProfit1: String(signal.takeProfit1),
    takeProfit2: String(signal.takeProfit2),
    takeProfit3: String(signal.takeProfit3),
    riskRewardRatio: String(signal.riskRewardRatio),
    strategy: signal.strategy,
    confidence: String(signal.confidence),
    rationale: signal.rationale,
    keyLevels: signal.keyLevels as Record<string, unknown>,
  };
}
