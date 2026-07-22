"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Search, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest, queryString } from "@/lib/api-client";
import { percent } from "@/lib/format";
import type { Paginated, ProviderSummary } from "@/lib/platform-types";

export function ProvidersDirectory() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const providers = useQuery({
    queryKey: ["providers", query],
    queryFn: () => apiRequest<Paginated<ProviderSummary>>(token, `/providers${queryString({ pageSize: 30, q: query || undefined })}`),
    enabled: Boolean(token),
  });
  const subscription = useMutation({
    mutationFn: ({ providerId, subscribed }: { providerId: string; subscribed: boolean }) =>
      apiRequest(token, `/providers/${providerId}/subscribe`, { method: subscribed ? "DELETE" : "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(search.trim());
  }

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-text-muted">Signal Marketplace</p>
          <h1 className="mt-1 text-2xl font-semibold">Providers</h1>
        </div>
        <form onSubmit={submit} className="flex h-10 w-full max-w-sm items-center rounded border border-border bg-background-surface px-3 focus-within:border-accent">
          <Search className="h-4 w-4 text-text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search providers" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
        </form>
      </header>
      {providers.isPending ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div> : null}
      {providers.isError ? <ErrorState message="Providers could not be loaded." retry={() => void providers.refetch()} /> : null}
      {providers.data?.data.length === 0 ? <EmptyState title="No providers match this filter." /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.data?.data.map((provider) => {
          const subscribed = provider.subscribers.length > 0;
          return (
            <article key={provider.id} className="rounded border border-border bg-background-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <Link href={`/providers/${provider.id}`} className="min-w-0">
                  <h2 className="flex items-center gap-1.5 truncate font-semibold">
                    {provider.name}
                    {provider.providerProfile.isVerified ? <BadgeCheck className="h-4 w-4 shrink-0 text-accent" /> : null}
                  </h2>
                  <span className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                    <Users className="h-3 w-3" /> {provider._count.subscribers} subscribers
                  </span>
                </Link>
                <span className="numeric rounded bg-background-elevated px-2 py-1 text-xs text-long">
                  {percent(provider.providerProfile.winRate)}
                </span>
              </div>
              <p className="mt-4 line-clamp-3 min-h-[60px] text-sm leading-5 text-text-muted">{provider.providerProfile.bio}</p>
              <dl className="mt-5 grid grid-cols-3 border-y border-border py-3 text-center text-xs">
                <Stat label="Signals" value={String(provider.providerProfile.totalSignals)} />
                <Stat label="Avg R:R" value={`${provider.providerProfile.avgRiskReward.toFixed(2)}R`} />
                <Stat label="Confidence" value={`${provider.providerProfile.avgConfidence.toFixed(0)}%`} />
              </dl>
              <div className="mt-4 flex gap-2">
                <Link href={`/providers/${provider.id}`} className="flex h-9 flex-1 items-center justify-center rounded border border-border bg-background-elevated text-sm font-medium transition hover:border-slate-500">
                  Profile
                </Link>
                {provider.id !== session?.user.id ? (
                  <Button
                    variant={subscribed ? "secondary" : "primary"}
                    size="sm"
                    disabled={subscription.isPending}
                    onClick={() => subscription.mutate({ providerId: provider.id, subscribed })}
                  >
                    {subscribed ? "Unfollow" : "Follow"}
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {subscription.isError ? <div className="mt-4"><ErrorState message={subscription.error.message} /></div> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-text-muted">{label}</dt><dd className="numeric mt-1 text-text-primary">{value}</dd></div>;
}
