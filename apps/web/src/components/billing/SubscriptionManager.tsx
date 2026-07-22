"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, CreditCard, ExternalLink } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import type { AccountUser, Plan, SubscriptionPlan } from "@/lib/platform-types";

export function SubscriptionManager({ checkoutResult }: { checkoutResult?: string | undefined }) {
  const { data: session, update } = useSession();
  const token = session?.accessToken ?? "";
  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => apiRequest<{ user: AccountUser }>(token, "/users/me"),
    enabled: Boolean(token),
  });
  const plans = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => apiRequest<{ plans: SubscriptionPlan[] }>(token, "/billing/plans"),
    enabled: Boolean(token),
  });
  const checkout = useMutation({
    mutationFn: (plan: Exclude<Plan, "FREE">) =>
      apiRequest<{ url: string }>(token, "/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const portal = useMutation({
    mutationFn: () => apiRequest<{ url: string }>(token, "/billing/portal", { method: "POST" }),
    onSuccess: ({ url }) => window.location.assign(url),
  });

  const current = account.data?.user.plan ?? session?.user.plan ?? "FREE";

  useEffect(() => {
    if (account.data && session && account.data.user.plan !== session.user.plan) {
      void update();
    }
  }, [account.data, session, update]);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-text-muted">Billing</p>
          <h1 className="mt-1 text-2xl font-semibold">Subscription</h1>
          <p className="mt-2 text-sm text-text-muted">Manage access and notification channels through Stripe billing.</p>
        </div>
        {current !== "FREE" ? (
          <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
            <CreditCard className="h-4 w-4" /> Billing portal <ExternalLink className="h-4 w-4" />
          </Button>
        ) : null}
      </header>
      {checkoutResult === "success" ? (
        <div className="mb-5 rounded border border-long/30 bg-long/10 px-4 py-3 text-sm text-long">
          Checkout completed. Your entitlement updates as soon as the Stripe webhook is processed.
        </div>
      ) : null}
      {checkoutResult === "cancelled" ? (
        <div className="mb-5 rounded border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">Checkout was cancelled.</div>
      ) : null}
      {plans.isPending || account.isPending ? (
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      ) : null}
      {plans.isError || account.isError ? (
        <ErrorState message="Subscription data could not be loaded." retry={() => { void plans.refetch(); void account.refetch(); }} />
      ) : null}
      {plans.data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.data.plans.map((plan) => (
            <article key={plan.id} className={`rounded border p-5 ${current === plan.id ? "border-accent bg-accent/5" : "border-border bg-background-surface"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{plan.name}</h2>
                  <p className="numeric mt-3 text-3xl">${plan.monthlyPrice}<span className="ml-1 font-sans text-sm text-text-muted">/mo</span></p>
                </div>
                {current === plan.id ? <span className="rounded border border-accent px-2 py-1 text-xs text-accent">Current</span> : null}
              </div>
              <ul className="my-6 space-y-3 text-sm text-text-muted">
                {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-long" /> {feature}</li>)}
              </ul>
              {plan.id === "FREE" || current === plan.id ? (
                <Button className="w-full" disabled>{current === plan.id ? "Current plan" : "Included"}</Button>
              ) : (
                <Button className="w-full" variant="primary" disabled={checkout.isPending} onClick={() => checkout.mutate(plan.id as Exclude<Plan, "FREE">)}>
                  Select {plan.name}
                </Button>
              )}
            </article>
          ))}
        </div>
      ) : null}
      {checkout.isError || portal.isError ? <div className="mt-5"><ErrorState message={(checkout.error ?? portal.error)?.message ?? "Billing request failed."} /></div> : null}
    </div>
  );
}
