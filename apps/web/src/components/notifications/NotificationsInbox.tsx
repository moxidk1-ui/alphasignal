"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/classes";
import { timeAgo } from "@/lib/format";
import type { NotificationItem, Paginated } from "@/lib/platform-types";

export function NotificationsInbox() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiRequest<Paginated<NotificationItem>>(token, "/notifications?pageSize=50"),
    enabled: Boolean(token) && session?.user.plan !== "FREE",
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest(token, `/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAll = useMutation({
    mutationFn: () => apiRequest(token, "/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (session?.user.plan === "FREE") {
    return (
      <div className="p-4 md:p-6">
        <header className="mb-6"><h1 className="text-2xl font-semibold">Alerts</h1></header>
        <EmptyState
          title="In-app alerts are available on Pro and Provider plans."
          action={<Link href="/settings" className="text-sm text-accent">Email alert settings</Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted">Activity</p>
          <h1 className="mt-1 text-2xl font-semibold">Alerts</h1>
        </div>
        <Button size="sm" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </header>
      {notifications.isPending ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : null}
      {notifications.isError ? <ErrorState message="Alerts could not be loaded." retry={() => void notifications.refetch()} /> : null}
      {notifications.data?.data.length === 0 ? <EmptyState title="No in-app alerts received." /> : null}
      <section className="overflow-hidden rounded border border-border">
        {notifications.data?.data.map((notification) => (
          <article
            key={notification.id}
            className={cn(
              "flex gap-4 border-b border-border p-4 last:border-b-0",
              notification.read ? "bg-background-surface" : "bg-accent/5",
            )}
          >
            <Bell className={cn("mt-1 h-4 w-4 shrink-0", notification.read ? "text-text-muted" : "text-accent")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{notification.payload.ticker ?? "Signal"}</span>
                {" "}
                {notification.type === "SIGNAL_CLOSED" ? "position closed" : notification.type === "ALGO_PENDING_APPROVAL" ? "requires approval" : "new signal published"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {notification.payload.providerName ?? "AlphaSignal"} / {notification.payload.market ?? ""} / {timeAgo(notification.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {notification.signalId ? (
                <Link href={`/signals/${notification.signalId}`} className="text-xs text-accent">View</Link>
              ) : null}
              {!notification.read ? (
                <Button variant="ghost" size="sm" onClick={() => markRead.mutate(notification.id)}>Read</Button>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
