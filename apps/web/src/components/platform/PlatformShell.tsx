"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Binoculars,
  CandlestickChart,
  CreditCard,
  LogOut,
  Radar,
  Settings,
  Shield,
  Sparkles,
  SquarePen,
  Users,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useRealtime } from "@/hooks/use-realtime";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/classes";
import { currentKillZone } from "@/lib/format";
import type { NotificationItem, Paginated, Signal } from "@/lib/platform-types";
import { useTradingStore } from "@/stores/trading-store";
import { Button } from "../ui/Button";

const standardNavigation = [
  { href: "/dashboard", label: "Feed", icon: CandlestickChart },
  { href: "/watchlist", label: "Watchlist", icon: Binoculars },
  { href: "/providers", label: "Providers", icon: Users },
  { href: "/notifications", label: "Alerts", icon: Bell },
  { href: "/subscriptions", label: "Subscription", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function PlatformShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const provider = session?.user.role === "PROVIDER" || session?.user.role === "ADMIN";
  const accessToken = session?.accessToken ?? "";
  const websocketStatus = useTradingStore((state) => state.websocketStatus);
  const [zone, setZone] = useState(() => currentKillZone());
  const [mobileDashboardSection, setMobileDashboardSection] = useState<"feed" | "chart">("feed");
  useRealtime();

  useEffect(() => {
    const interval = setInterval(() => setZone(currentKillZone()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const syncHash = () => setMobileDashboardSection(window.location.hash === "#chart" ? "chart" : "feed");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const activeSignals = useQuery({
    queryKey: ["signals", "active-count"],
    queryFn: () => apiRequest<Paginated<Signal>>(accessToken, "/signals?pageSize=1&status=PUBLISHED"),
    enabled: Boolean(accessToken),
  });
  const alerts = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => apiRequest<Paginated<NotificationItem>>(accessToken, "/notifications?pageSize=1&read=false"),
    enabled: Boolean(accessToken) && session?.user.plan !== "FREE",
  });

  return (
    <div className="min-h-screen bg-background-base text-text-primary">
      <aside className="fixed inset-y-0 left-0 hidden w-[220px] flex-col border-r border-border bg-background-surface lg:flex">
        <Link href="/dashboard" className="flex h-16 items-center gap-3 border-b border-border px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-accent font-mono text-sm font-semibold text-white">
            AS
          </span>
          <span className="text-base font-semibold">AlphaSignal</span>
        </Link>
        <nav className="flex-1 space-y-1 px-3 py-5">
          {standardNavigation.map((item) => (
            <NavigationItem key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
          {session && session.user.plan !== "FREE" ? (
            <NavigationItem item={{ href: "/analysis", label: "AI Analysis", icon: Sparkles }} active={pathname.startsWith("/analysis")} />
          ) : null}
          {provider ? (
            <>
              <NavigationItem
                item={{ href: "/signals/create", label: "Create Signal", icon: SquarePen }}
                active={pathname.startsWith("/signals/create")}
              />
              <NavigationItem
                item={{ href: "/algo/review", label: "Algo Review", icon: Radar }}
                active={pathname.startsWith("/algo/review")}
              />
              <NavigationItem
                item={{ href: "/algo/config", label: "Algo Config", icon: Settings }}
                active={pathname.startsWith("/algo/config")}
              />
              {session?.user.role === "PROVIDER" ? (
                <NavigationItem
                  item={{ href: "/analytics", label: "Analytics", icon: BarChart3 }}
                  active={pathname.startsWith("/analytics")}
                />
              ) : null}
            </>
          ) : null}
          {session?.user.role === "ADMIN" ? (
            <NavigationItem item={{ href: "/admin", label: "Admin", icon: Shield }} active={pathname.startsWith("/admin")} />
          ) : null}
        </nav>
        <div className="border-t border-border px-4 py-4">
          <div className="mb-4 flex items-center justify-between text-xs">
            <span className="text-text-muted">Kill zone</span>
            <span className={cn("font-mono", zone.active ? "text-warning" : "text-text-muted")}>
              {zone.label}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => void signOut({ callbackUrl: "/auth/login" })}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="min-h-screen pb-24 lg:ml-[220px] lg:pb-10">
        <main className="min-h-[calc(100vh-40px)]">{children}</main>
        <footer className="fixed inset-x-0 bottom-0 hidden h-10 items-center justify-between border-t border-border bg-background-surface px-5 text-xs text-text-muted lg:left-[220px] lg:flex">
          <div className="flex items-center gap-5">
            <StatusDot status={websocketStatus} label={websocketStatus === "live" ? "WS live" : websocketStatus === "unavailable" ? "WS Pro only" : "WS offline"} />
            <span>
              Active signals{" "}
              <strong className="numeric font-medium text-text-primary">{activeSignals.data?.pagination.total ?? "--"}</strong>
            </span>
            <span>
              Alerts{" "}
              <strong className="numeric font-medium text-text-primary">
                {session?.user.plan === "FREE" ? "--" : (alerts.data?.pagination.total ?? "--")}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-5">
            <span className="rounded border border-border px-2 py-1 text-text-primary">{session?.user.plan ?? "FREE"}</span>
            <span className={zone.active ? "text-warning" : undefined}>
              {zone.marketTime} ET / {zone.label}
            </span>
          </div>
        </footer>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 border-t border-border bg-background-surface lg:hidden">
        <MobileItem href="/dashboard#feed" label="Feed" icon={Radar} active={pathname.startsWith("/dashboard") && mobileDashboardSection === "feed"} />
        <MobileItem href="/dashboard#chart" label="Chart" icon={CandlestickChart} active={pathname.startsWith("/dashboard") && mobileDashboardSection === "chart"} />
        <MobileItem href="/providers" label="Providers" icon={Users} active={pathname.startsWith("/providers")} />
        <MobileItem href="/notifications" label="Alerts" icon={Bell} active={pathname.startsWith("/notifications")} />
        <MobileItem href="/settings" label="Profile" icon={Settings} active={pathname.startsWith("/settings")} />
      </nav>
    </div>
  );
}

function NavigationItem({
  item,
  active,
}: {
  item: { href: string; label: string; icon: typeof Bell };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex h-10 items-center gap-3 rounded px-3 text-sm transition duration-200",
        active ? "bg-background-elevated text-text-primary" : "text-text-muted hover:bg-background-elevated hover:text-text-primary",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function MobileItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Bell;
  active: boolean;
}) {
  return (
    <Link href={href} className={cn("flex flex-col items-center justify-center gap-1 text-[11px]", active ? "text-accent" : "text-text-muted")}>
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}

function StatusDot({ status, label }: { status: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", status === "live" ? "bg-long" : status === "connecting" ? "bg-warning" : "bg-text-muted")} />
      {label}
    </span>
  );
}
