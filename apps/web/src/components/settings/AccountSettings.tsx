"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, CreditCard, Link2, Save, Unlink } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import type { AccountUser } from "@/lib/platform-types";

interface TelegramLink {
  command: string;
  expiresAt: string;
}

export function AccountSettings() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const queryClient = useQueryClient();
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [name, setName] = useState("");
  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => apiRequest<{ user: AccountUser }>(token, "/users/me"),
    enabled: Boolean(token),
  });
  const emailAlerts = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest<{ user: AccountUser }>(token, "/users/me", {
        method: "PATCH",
        body: JSON.stringify({ emailAlertsEnabled: enabled }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["account"] }),
  });
  const profile = useMutation({
    mutationFn: () =>
      apiRequest<{ user: AccountUser }>(token, "/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["account"] }),
  });
  const telegramLink = useMutation({
    mutationFn: () => apiRequest<TelegramLink>(token, "/users/me/telegram-link", { method: "POST" }),
    onSuccess: (value) => setLink(value),
  });
  const telegramUnlink = useMutation({
    mutationFn: () => apiRequest(token, "/users/me/telegram-link", { method: "DELETE" }),
    onSuccess: () => {
      setLink(null);
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  useEffect(() => {
    if (account.data?.user.name) {
      setName(account.data.user.name);
    }
  }, [account.data?.user.name]);

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) profile.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <header className="mb-6">
        <p className="text-xs text-text-muted">Account</p>
        <h1 className="mt-1 text-2xl font-semibold">Settings</h1>
      </header>
      {account.isPending ? <Skeleton className="h-80" /> : null}
      {account.isError ? <ErrorState message="Account settings could not be loaded." retry={() => void account.refetch()} /> : null}
      {account.data ? (
        <div className="space-y-4">
          <section className="rounded border border-border bg-background-surface p-5">
            <form onSubmit={saveProfile} className="flex flex-wrap items-end gap-4">
              <label className="min-w-[220px] flex-1 text-sm">
                <span className="mb-2 block text-text-muted">Display name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="h-10 w-full rounded border border-border bg-background-base px-3 outline-none focus:border-accent" />
              </label>
              <Button type="submit" disabled={profile.isPending || !name.trim()}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </form>
          </section>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded border border-border bg-background-surface p-5">
            <div>
              <h2 className="text-sm font-medium">Plan and billing</h2>
              <p className="mt-1 text-sm text-text-muted">Current plan: <span className="font-mono text-text-primary">{account.data.user.plan}</span></p>
            </div>
            <Link href="/subscriptions" className="inline-flex h-10 items-center gap-2 rounded border border-border bg-background-elevated px-4 text-sm font-medium">
              <CreditCard className="h-4 w-4" /> Manage plan
            </Link>
          </section>
          <section className="rounded border border-border bg-background-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">Email alerts</h2>
                <p className="mt-1 text-sm text-text-muted">Signal activity delivered to {account.data.user.email}</p>
              </div>
              <label className="relative inline-flex h-6 w-11 shrink-0 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={account.data.user.emailAlertsEnabled}
                  onChange={(event) => emailAlerts.mutate(event.target.checked)}
                />
                <span className="absolute inset-0 rounded-full bg-background-elevated transition peer-checked:bg-accent" />
                <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
              </label>
            </div>
          </section>
          <section className="rounded border border-border bg-background-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">Telegram alerts</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {account.data.user.telegramChatId ? "Private chat connected." : "No Telegram chat connected."}
                </p>
              </div>
              {account.data.user.plan === "FREE" ? (
                <span className="rounded border border-border px-3 py-2 text-xs text-text-muted">Pro required</span>
              ) : account.data.user.telegramChatId ? (
                <Button variant="danger" size="sm" onClick={() => telegramUnlink.mutate()} disabled={telegramUnlink.isPending}>
                  <Unlink className="h-4 w-4" /> Disconnect
                </Button>
              ) : (
                <Button size="sm" onClick={() => telegramLink.mutate()} disabled={telegramLink.isPending}>
                  <Link2 className="h-4 w-4" /> Generate Link
                </Button>
              )}
            </div>
            {link && account.data.user.plan !== "FREE" ? (
              <div className="mt-4 rounded border border-accent/30 bg-accent/10 p-3">
                <p className="text-xs text-text-muted">Send this command to the AlphaSignal Telegram bot before it expires:</p>
                <div className="mt-3 flex items-center justify-between gap-3 rounded bg-background-base px-3 py-2">
                  <code className="numeric min-w-0 truncate text-sm text-accent">{link.command}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Copy Telegram command"
                    onClick={() => void navigator.clipboard.writeText(link.command)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
          {profile.isError || emailAlerts.isError || telegramLink.isError || telegramUnlink.isError ? (
            <ErrorState message={(profile.error ?? emailAlerts.error ?? telegramLink.error ?? telegramUnlink.error)?.message ?? "Settings update failed."} />
          ) : null}
          <p className="text-xs text-text-muted">Plan: {account.data.user.plan} / Role: {account.data.user.role}</p>
        </div>
      ) : null}
    </div>
  );
}
