"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Radar, Shield, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { apiRequest } from "@/lib/api-client";
import type { AdminDetection, AdminStats, AdminUser, Paginated } from "@/lib/platform-types";

const roles: AdminUser["role"][] = ["ADMIN", "PROVIDER", "SUBSCRIBER", "FREE_USER"];

export function AdminDashboard() {
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => apiRequest<{ stats: AdminStats }>(token, "/admin/stats"), enabled: Boolean(token) });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => apiRequest<Paginated<AdminUser>>(token, "/admin/users?pageSize=20"), enabled: Boolean(token) });
  const detections = useQuery({ queryKey: ["admin", "detections"], queryFn: () => apiRequest<Paginated<AdminDetection>>(token, "/admin/algo/detections?pageSize=8"), enabled: Boolean(token) });
  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminUser["role"] }) =>
      apiRequest<{ user: AdminUser }>(token, `/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return (
    <div className="p-4 md:p-6">
      <header className="mb-7">
        <p className="text-xs text-text-muted">Platform control</p>
        <h1 className="mt-1 text-2xl font-semibold">Administration</h1>
      </header>
      {stats.isPending ? <Skeleton className="mb-7 h-28" /> : null}
      {stats.data ? (
        <dl className="mb-8 grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Users} label="Users" value={stats.data.stats.users} />
          <Stat icon={Shield} label="Providers" value={stats.data.stats.providers} />
          <Stat icon={Activity} label="Active signals" value={stats.data.stats.activeSignals} />
          <Stat icon={Radar} label="Pending detections" value={stats.data.stats.pendingDetections} />
        </dl>
      ) : null}
      {stats.isError ? <ErrorState message="Platform statistics could not be loaded." retry={() => void stats.refetch()} /> : null}
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section>
          <h2 className="mb-4 text-sm font-medium">User access</h2>
          {users.isPending ? <Skeleton className="h-72" /> : null}
          {users.isError ? <ErrorState message="Users could not be loaded." retry={() => void users.refetch()} /> : null}
          {users.data ? (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-background-elevated text-xs text-text-muted"><tr><th className="p-3 font-medium">User</th><th className="p-3 font-medium">Plan</th><th className="p-3 font-medium">Role</th></tr></thead>
                <tbody>
                  {users.data.data.map((user) => (
                    <tr key={user.id} className="border-t border-border bg-background-surface">
                      <td className="p-3"><p>{user.name}</p><p className="text-xs text-text-muted">{user.email}</p></td>
                      <td className="p-3 font-mono text-xs">{user.plan}</td>
                      <td className="p-3">
                        <select aria-label={`Role for ${user.name}`} value={user.role} disabled={updateRole.isPending} onChange={(event) => updateRole.mutate({ id: user.id, role: event.target.value as AdminUser["role"] })} className="h-9 rounded border border-border bg-background-elevated px-2 text-xs">
                          {roles.map((role) => <option key={role}>{role}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        <section>
          <h2 className="mb-4 text-sm font-medium">Recent detections</h2>
          {detections.isPending ? <Skeleton className="h-72" /> : null}
          {detections.isError ? <ErrorState message="Detection activity could not be loaded." retry={() => void detections.refetch()} /> : null}
          <div className="space-y-2">
            {detections.data?.data.map((detection) => (
              <article key={detection.id} className="rounded border border-border bg-background-surface p-3">
                <div className="flex justify-between text-sm"><span className="font-medium">{detection.ticker} <span className={detection.direction === "LONG" ? "text-long" : "text-short"}>{detection.direction}</span></span><span className="numeric text-accent">{detection.confidence}%</span></div>
                <p className="mt-2 truncate text-xs text-text-muted">{detection.strategy} / {detection.timeframe} / {detection.market}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
      {updateRole.isError ? <div className="mt-5"><ErrorState message={updateRole.error.message} /></div> : null}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <div className="bg-background-surface p-5"><Icon className="h-4 w-4 text-accent" /><dt className="mt-3 text-xs text-text-muted">{label}</dt><dd className="numeric mt-2 text-2xl">{value}</dd></div>;
}
