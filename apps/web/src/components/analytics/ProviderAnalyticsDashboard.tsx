"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Target, TrendingUp, Zap } from "lucide-react";
import { useSession } from "next-auth/react";
import { SignalCard } from "@/components/signals/SignalCard";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import type { Paginated, ProviderAnalytics, Signal } from "@/lib/platform-types";

export function ProviderAnalyticsDashboard() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const id = session?.user.id ?? "";
  const analytics = useQuery({
    queryKey: ["provider-analytics", id],
    queryFn: () => apiRequest<{ analytics: ProviderAnalytics }>(token, `/providers/${id}/analytics`),
    enabled: Boolean(token && id),
  });
  const signals = useQuery({
    queryKey: ["provider-analytics-signals", id],
    queryFn: () => apiRequest<Paginated<Signal>>(token, `/providers/${id}/signals?pageSize=6`),
    enabled: Boolean(token && id),
  });
  const values = analytics.data?.analytics;
  const closed = (values?.outcomes.WIN ?? 0) + (values?.outcomes.LOSS ?? 0) + (values?.outcomes.BREAKEVEN ?? 0);
  const winRate = closed ? ((values?.outcomes.WIN ?? 0) / closed) * 100 : 0;

  return (
    <div className="p-4 md:p-6">
      <header className="mb-7">
        <p className="text-xs text-text-muted">Provider operations</p>
        <h1 className="mt-1 text-2xl font-semibold">Analytics</h1>
      </header>
      {analytics.isPending ? <Skeleton className="mb-6 h-32" /> : null}
      {analytics.isError ? <ErrorState message="Provider analytics could not be loaded." retry={() => void analytics.refetch()} /> : null}
      {values ? (
        <>
          <dl className="mb-8 grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Zap} label="Published signals" value={String(values.totalSignals)} />
            <Metric icon={Target} label="Closed win rate" value={`${winRate.toFixed(1)}%`} />
            <Metric icon={TrendingUp} label="Average R:R" value={`${values.avgRiskReward.toFixed(2)}R`} />
            <Metric icon={BarChart3} label="Average PnL" value={`${values.avgPnlPercent.toFixed(2)}%`} />
          </dl>
          <section className="mb-8">
            <h2 className="mb-4 text-sm font-medium">Outcome distribution</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Outcome label="Wins" value={values.outcomes.WIN ?? 0} color="bg-long" />
              <Outcome label="Losses" value={values.outcomes.LOSS ?? 0} color="bg-short" />
              <Outcome label="Breakeven" value={values.outcomes.BREAKEVEN ?? 0} color="bg-warning" />
            </div>
          </section>
        </>
      ) : null}
      <section>
        <h2 className="mb-4 text-sm font-medium">Recent published signals</h2>
        {signals.isPending ? <Skeleton className="h-56" /> : null}
        {signals.isError ? <ErrorState message="Recent signals could not be loaded." retry={() => void signals.refetch()} /> : null}
        {signals.data?.data.length === 0 ? <EmptyState title="Publish a signal to populate provider analytics." /> : null}
        <div className="grid gap-3 lg:grid-cols-3">
          {signals.data?.data.map((signal) => <SignalCard key={signal.id} signal={signal} compact />)}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) {
  return <div className="bg-background-surface p-5"><Icon className="h-4 w-4 text-accent" /><dt className="mt-4 text-xs text-text-muted">{label}</dt><dd className="numeric mt-2 text-2xl">{value}</dd></div>;
}

function Outcome({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="rounded border border-border bg-background-surface p-4"><span className={`mb-3 block h-1 w-10 rounded ${color}`} /><p className="text-xs text-text-muted">{label}</p><p className="numeric mt-2 text-2xl">{value}</p></div>;
}
