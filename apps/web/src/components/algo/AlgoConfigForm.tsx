"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";
import {
  algoSignalStrategies,
  markets,
  providerAlgoModes,
  timeframes,
  type AlgoSignalStrategy,
  type Market,
  type ProviderAlgoMode,
  type Timeframe,
} from "@alphasignal/shared";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/classes";
import { strategyName } from "@/lib/format";
import type { AlgoConfig } from "@/lib/platform-types";

interface ConfigState {
  algoMode: ProviderAlgoMode;
  patternTypes: AlgoSignalStrategy[];
  markets: Market[];
  timeframes: Timeframe[];
  minConfidence: number;
  autoPublish: boolean;
  riskRewardMin: number;
}

const defaults: ConfigState = {
  algoMode: "APPROVAL",
  patternTypes: ["ICT_SILVER_BULLET"],
  markets: ["STOCKS"],
  timeframes: ["M15"],
  minConfidence: 70,
  autoPublish: false,
  riskRewardMin: 1.5,
};

export function AlgoConfigForm() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const [form, setForm] = useState<ConfigState>(defaults);
  const config = useQuery({
    queryKey: ["algo-config"],
    queryFn: () => apiRequest<{ config: AlgoConfig }>(token, "/algo/config"),
    enabled: Boolean(token),
  });
  useEffect(() => {
    const value = config.data?.config;
    if (!value) return;
    setForm({
      algoMode: value.provider.algoMode,
      patternTypes: value.patternTypes.length ? value.patternTypes : defaults.patternTypes,
      markets: value.markets.length ? value.markets : defaults.markets,
      timeframes: value.timeframes.length ? value.timeframes : defaults.timeframes,
      minConfidence: value.minConfidence,
      autoPublish: value.provider.algoMode === "AUTO",
      riskRewardMin: value.riskRewardMin,
    });
  }, [config.data]);
  const save = useMutation({
    mutationFn: () =>
      apiRequest<{ config: AlgoConfig }>(token, "/algo/config", {
        method: "PUT",
        body: JSON.stringify(form),
      }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-6">
        <p className="text-xs text-text-muted">Autonomous Engine</p>
        <h1 className="mt-1 text-2xl font-semibold">Scan Configuration</h1>
      </header>
      {config.isPending ? <Skeleton className="h-[680px]" /> : null}
      {config.isError ? <ErrorState message="Scanner configuration could not be loaded." retry={() => void config.refetch()} /> : null}
      {config.data ? (
        <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="space-y-6 rounded border border-border bg-background-surface p-5">
            <Group title="Detection Patterns">
              <div className="grid gap-2 sm:grid-cols-2">
                {algoSignalStrategies.map((pattern) => (
                  <Checkbox
                    key={pattern}
                    checked={form.patternTypes.includes(pattern)}
                    label={strategyName(pattern)}
                    onChange={() => setForm((current) => ({ ...current, patternTypes: toggle(current.patternTypes, pattern) }))}
                  />
                ))}
              </div>
            </Group>
            <Group title="Markets">
              <div className="flex flex-wrap gap-2">
                {markets.map((market) => (
                  <Choice key={market} selected={form.markets.includes(market)} onClick={() => setForm((current) => ({ ...current, markets: toggle(current.markets, market) }))}>
                    {market}
                  </Choice>
                ))}
              </div>
            </Group>
            <Group title="Timeframes">
              <div className="flex flex-wrap gap-2">
                {timeframes.map((timeframe) => (
                  <Choice key={timeframe} selected={form.timeframes.includes(timeframe)} onClick={() => setForm((current) => ({ ...current, timeframes: toggle(current.timeframes, timeframe) }))}>
                    {timeframe}
                  </Choice>
                ))}
              </div>
            </Group>
          </section>
          <section className="space-y-5 rounded border border-border bg-background-surface p-5">
            <label className="block text-sm text-text-muted">
              Engine Mode
              <select
                value={form.algoMode}
                onChange={(event) => {
                  const mode = event.target.value as ProviderAlgoMode;
                  setForm((current) => ({ ...current, algoMode: mode, autoPublish: mode === "AUTO" }));
                }}
                className="mt-2 h-10 w-full rounded border border-border bg-background-base px-3 text-text-primary outline-none focus:border-accent"
              >
                {providerAlgoModes.map((mode) => <option key={mode}>{mode}</option>)}
              </select>
            </label>
            <Slider label="Minimum Confidence" value={form.minConfidence} suffix="%" min={1} max={100} onChange={(value) => setForm((current) => ({ ...current, minConfidence: value }))} />
            <Slider label="Minimum Risk / Reward" value={form.riskRewardMin} suffix="R" min={0.5} max={10} step={0.1} onChange={(value) => setForm((current) => ({ ...current, riskRewardMin: value }))} />
            <div className="rounded border border-border bg-background-base p-3 text-sm">
              <p className="text-text-muted">Publication</p>
              <p className={cn("mt-2 font-medium", form.autoPublish ? "text-long" : "text-warning")}>
                {form.autoPublish ? "Automatic publish" : form.algoMode === "DISABLED" ? "Scanner disabled" : "Approval required"}
              </p>
            </div>
            {save.isSuccess ? <p className="text-sm text-long">Configuration saved.</p> : null}
            {save.isError ? <ErrorState message={save.error.message} /> : null}
            <Button type="submit" variant="primary" className="w-full" disabled={save.isPending || form.patternTypes.length === 0 || form.markets.length === 0 || form.timeframes.length === 0}>
              <Save className="h-4 w-4" /> Save Configuration
            </Button>
          </section>
        </form>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset><legend className="mb-3 text-sm font-medium">{title}</legend>{children}</fieldset>;
}

function Checkbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="flex min-h-10 items-center gap-3 rounded border border-border bg-background-base px-3 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4" />
      {label}
    </label>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("h-9 rounded border px-3 font-mono text-xs", selected ? "border-accent bg-accent/10 text-accent" : "border-border text-text-muted")}>
      {children}
    </button>
  );
}

function Slider({ label, value, suffix, min, max, step = 1, onChange }: { label: string; value: number; suffix: string; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm text-text-muted">
      <span className="flex justify-between"><span>{label}</span><span className="numeric text-text-primary">{value}{suffix}</span></span>
      <input className="mt-3 w-full" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function toggle<Value>(items: Value[], value: Value): Value[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}
