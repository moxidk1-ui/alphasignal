import { BadgeCheck, CircleGauge } from "lucide-react";
import Link from "next/link";
import type { Signal } from "@/lib/platform-types";
import { cn } from "@/lib/classes";
import { percent, price, sourceName, strategyName } from "@/lib/format";
import { SourceBadge, StatusBadge } from "./SignalCard";

export function SignalDetail({ signal, standalone = false }: { signal: Signal; standalone?: boolean }) {
  const long = signal.direction === "LONG";
  const profile = signal.provider.providerProfile;
  const levels = extractLevels(signal.keyLevels);

  return (
    <section className={cn("h-full bg-background-surface", standalone ? "rounded border border-border" : "border-l border-border")}>
      <div className={cn("border-l-4 p-5", long ? "border-long" : "border-short")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-text-muted">
              {signal.market} / {signal.timeframe}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{signal.ticker}</h2>
          </div>
          <SourceBadge source={signal.source} />
        </div>
        <div className="mt-5 flex items-end justify-between gap-2">
          <span className={cn("text-lg font-semibold", long ? "text-long" : "text-short")}>{signal.direction}</span>
          <div className="text-right">
            <p className="text-xs text-text-muted">Entry</p>
            <p className="numeric text-2xl">{price(signal.entryPrice)}</p>
          </div>
        </div>
      </div>

      <div className="border-y border-border p-5">
        <div className="grid grid-cols-2 gap-4">
          <Level label="Stop Loss" value={signal.stopLoss} tone="text-short" />
          <Level label="Risk / Reward" value={signal.riskRewardRatio} suffix="R" tone="text-text-primary" />
          <Level label="Take Profit 1" value={signal.takeProfit1} tone="text-long" />
          <Level label="Take Profit 2" value={signal.takeProfit2} tone="text-long" />
          <Level label="Take Profit 3" value={signal.takeProfit3} tone="text-long" />
          <div>
            <p className="text-xs text-text-muted">Status</p>
            <div className="mt-2"><StatusBadge status={signal.status} /></div>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
            <span>{strategyName(signal.strategy)}</span>
            <span className="numeric">{signal.confidence}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-background-elevated">
            <div className={cn("h-full", signal.confidence >= 80 ? "bg-long" : "bg-warning")} style={{ width: `${signal.confidence}%` }} />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium uppercase text-text-muted">Rationale</h3>
          <p className="mt-2 text-sm leading-6 text-text-primary">{signal.rationale}</p>
        </div>

        {levels.length ? (
          <div>
            <h3 className="text-xs font-medium uppercase text-text-muted">Key Levels</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {levels.map((level) => (
                <span key={level} className="numeric rounded border border-border bg-background-elevated px-2 py-1 text-xs">
                  {price(level)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <Link href={`/providers/${signal.provider.id}`} className="flex items-center justify-between rounded border border-border p-3 transition hover:border-slate-500">
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {signal.provider.name}
              {profile?.isVerified ? <BadgeCheck className="h-4 w-4 text-accent" /> : null}
            </span>
            <span className="mt-1 flex items-center gap-1 text-xs text-text-muted">
              <CircleGauge className="h-3 w-3" />
              {profile ? `${percent(profile.winRate)} win rate` : sourceName(signal.source)}
            </span>
          </span>
        </Link>

        {!standalone ? (
          <Link
            href={`/signals/${signal.id}`}
            className="flex h-10 w-full items-center justify-center rounded border border-border bg-background-elevated text-sm font-medium transition hover:border-slate-500"
          >
            View signal
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Level({ label, value, tone, suffix = "" }: { label: string; value: number; tone: string; suffix?: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={cn("numeric mt-2 text-sm", tone)}>{suffix ? `${value.toFixed(2)}${suffix}` : price(value)}</p>
    </div>
  );
}

function extractLevels(input: Signal["keyLevels"]): number[] {
  if (!input || typeof input !== "object") return [];
  const record = input as { support?: unknown; resistance?: unknown; liquidityLevels?: unknown };
  const values = [record.support, record.resistance, record.liquidityLevels]
    .filter(Array.isArray)
    .flatMap((list) => (list as unknown[]).filter((value): value is number => typeof value === "number"));
  return [...new Set(values)].slice(0, 8);
}
