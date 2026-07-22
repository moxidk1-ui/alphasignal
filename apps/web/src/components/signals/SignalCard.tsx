"use client";

import { motion } from "framer-motion";
import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import type { Signal } from "@/lib/platform-types";
import { cn } from "@/lib/classes";
import { percent, price, sourceName, strategyName, timeAgo } from "@/lib/format";

export function SignalCard({
  signal,
  selected = false,
  onSelect,
  compact = false,
}: {
  signal: Signal;
  selected?: boolean;
  onSelect?: (signal: Signal) => void;
  compact?: boolean;
}) {
  const long = signal.direction === "LONG";
  const profile = signal.provider.providerProfile;
  const content = (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <strong className="font-semibold text-text-primary">{signal.ticker}</strong>
          <span className="text-text-muted">{signal.market}</span>
          <span className="text-text-muted">{signal.timeframe}</span>
        </div>
        <SourceBadge source={signal.source} />
      </header>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className={cn("text-sm font-semibold", long ? "text-long" : "text-short")}>{signal.direction}</span>
        <span className="numeric text-lg font-medium text-text-primary">{price(signal.entryPrice)}</span>
      </div>

      {!compact ? (
        <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
          <Level label="SL" value={signal.stopLoss} tone="text-short" />
          <Level label="TP1" value={signal.takeProfit1} tone="text-long" />
          <Level label="TP2" value={signal.takeProfit2} tone="text-long" />
          <Level label="TP3" value={signal.takeProfit3} tone="text-long" />
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <span className="max-w-[58%] truncate rounded bg-background-elevated px-2 py-1 text-[11px] text-text-muted">
          {strategyName(signal.strategy)}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-background-elevated">
          <div
            className={cn("h-full", signal.confidence >= 80 ? "bg-long" : signal.confidence >= 50 ? "bg-warning" : "bg-short")}
            style={{ width: `${signal.confidence}%` }}
          />
        </div>
        <span className="numeric text-[11px] text-text-muted">{signal.confidence}%</span>
      </div>
    </>
  );

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "relative overflow-hidden rounded border bg-background-surface transition duration-200",
        selected ? "border-accent" : "border-border hover:border-slate-500",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", long ? "bg-long" : "bg-short")} />
      {onSelect ? (
        <button type="button" onClick={() => onSelect(signal)} className="block w-full p-4 pl-5 text-left">
          {content}
        </button>
      ) : (
        <div className="p-4 pl-5">{content}</div>
      )}

      {!compact ? (
        <footer className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5 truncate">
            {signal.provider.name}
            {profile?.isVerified ? <BadgeCheck className="h-3.5 w-3.5 text-accent" /> : null}
            {profile ? <span className="numeric">{percent(profile.winRate)}</span> : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span>{timeAgo(signal.publishedAt ?? signal.createdAt)}</span>
            <StatusBadge status={signal.status} />
          </span>
        </footer>
      ) : (
        <footer className="border-t border-border px-5 py-3 text-right">
          <Link href={`/signals/${signal.id}`} className="text-xs text-accent">View Signal</Link>
        </footer>
      )}
    </motion.article>
  );
}

export function SourceBadge({ source }: { source: Signal["source"] }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-1 text-[10px] font-semibold",
        source === "ALGO" && "bg-algo/15 text-algo",
        source === "AI_HYBRID" && "bg-accent/15 text-accent",
        source === "MANUAL" && "bg-background-elevated text-text-muted",
      )}
    >
      {sourceName(source)}
    </span>
  );
}

function Level({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className="text-text-muted">{label}</p>
      <p className={cn("numeric mt-1 truncate", tone)}>{price(value)}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: Signal["status"] }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        status === "PUBLISHED" && "bg-long/10 text-long",
        status === "CLOSED" && "bg-background-elevated text-text-muted",
        status === "PENDING_APPROVAL" && "bg-warning/10 text-warning",
        status === "DRAFT" && "bg-accent/10 text-accent",
      )}
    >
      {status === "PUBLISHED" ? "LIVE" : status.replace("_", " ")}
    </span>
  );
}
