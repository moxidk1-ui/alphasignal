"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Globe, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { SignalCard } from "@/components/signals/SignalCard";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import { percent } from "@/lib/format";
import type { Paginated, ProviderAnalytics, ProviderSummary, Signal } from "@/lib/platform-types";

export function ProviderProfile({ id }: { id: string }) {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const queryClient = useQueryClient();
  const provider = useQuery({
    queryKey: ["providers", id],
    queryFn: () => apiRequest<{ provider: ProviderSummary }>(token, `/providers/${id}`),
    enabled: Boolean(token),
  });
  const signals = useQuery({
    queryKey: ["providers", id, "signals"],
    queryFn: () => apiRequest<Paginated<Signal>>(token, `/providers/${id}/signals?pageSize=20`),
    enabled: Boolean(token),
  });
  const analytics = useQuery({
    queryKey: ["providers", id, "analytics"],
    queryFn: () =>
      apiRequest<{ analytics: ProviderAnalytics }>(token, `/providers/${id}/analytics`),
    enabled: Boolean(token),
  });
  const follow = useMutation({
    mutationFn: (subscribed: boolean) =>
      apiRequest(token, `/providers/${id}/subscribe`, { method: subscribed ? "DELETE" : "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["providers", id] });
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  if (provider.isPending)
    return (
      <div className="p-6">
        <Skeleton className="h-[600px]" />
      </div>
    );
  if (provider.isError)
    return (
      <div className="p-6">
        <ErrorState
          message="Provider profile could not be loaded."
          retry={() => void provider.refetch()}
        />
      </div>
    );
  const item = provider.data.provider;
  const subscribed = item.subscribers.length > 0;
  const metrics = analytics.data?.analytics;

  return (
    <div className="p-4 md:p-6">
      <section className="border-b border-border pb-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              {item.name}
              {item.providerProfile.isVerified ? (
                <BadgeCheck className="h-5 w-5 text-accent" />
              ) : null}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              {item.providerProfile.bio}
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-muted">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" /> {item._count.subscribers} subscribers
              </span>
              {item.providerProfile.website ? (
                <a
                  className="flex items-center gap-1 text-accent"
                  href={item.providerProfile.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Globe className="h-4 w-4" /> Website
                </a>
              ) : null}
            </div>
          </div>
          {item.id !== session?.user.id ? (
            <Button
              variant={subscribed ? "secondary" : "primary"}
              onClick={() => follow.mutate(subscribed)}
              disabled={follow.isPending}
            >
              {subscribed ? "Unfollow Provider" : "Follow Provider"}
            </Button>
          ) : (
            <Link
              className="rounded border border-border bg-background-elevated px-4 py-2 text-sm"
              href="/algo/config"
            >
              Manage Algo
            </Link>
          )}
        </div>
        <dl className="mt-7 grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-4">
          <Metric label="Win Rate" value={percent(item.providerProfile.winRate)} />
          <Metric
            label="Published Signals"
            value={String(metrics?.totalSignals ?? item.providerProfile.totalSignals)}
          />
          <Metric
            label="Average R:R"
            value={`${(metrics?.avgRiskReward ?? item.providerProfile.avgRiskReward).toFixed(2)}R`}
          />
          <Metric label="Average PnL" value={`${(metrics?.avgPnlPercent ?? 0).toFixed(2)}%`} />
        </dl>
      </section>
      {follow.isError ? (
        <div className="mt-5">
          <ErrorState message={follow.error.message} />
        </div>
      ) : null}
      <section className="mt-6">
        <h2 className="mb-4 text-base font-medium">Signal Track Record</h2>
        {metrics ? (
          <p className="mb-4 text-xs text-text-muted">
            Performance metrics use {metrics.verifiedOutcomeCount} market-verified or
            administrator-corrected outcomes.
          </p>
        ) : null}
        {signals.isPending ? <Skeleton className="h-52" /> : null}
        {signals.isError ? (
          <ErrorState
            message="Track record could not be loaded."
            retry={() => void signals.refetch()}
          />
        ) : null}
        {signals.data?.data.length === 0 ? (
          <EmptyState title="No published signals available." />
        ) : null}
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {signals.data?.data.map((signal) => (
            <SignalCard key={signal.id} signal={signal} compact />
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background-surface p-4">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="numeric mt-2 text-xl">{value}</dd>
    </div>
  );
}
