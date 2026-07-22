import type { SignalSource, SignalStrategy } from "@alphasignal/shared";

export function price(value: number): string {
  const decimals = value >= 1_000 ? 2 : value >= 1 ? 4 : 6;
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function timeAgo(value: string): string {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function strategyName(strategy: SignalStrategy): string {
  return strategy
    .replace("ICT_", "ICT ")
    .replace("WYCKOFF_", "Wyckoff ")
    .replace("MOMENTUM_", "Momentum ")
    .replace("PA_", "PA ")
    .replaceAll("_", " ");
}

export function sourceName(source: SignalSource): string {
  return source === "AI_HYBRID" ? "AI" : source;
}

export interface KillZoneState {
  label: string;
  active: boolean;
  marketTime: string;
}

export function currentKillZone(now = new Date()): KillZoneState {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [hours = 0, minutes = 0] = formatted.split(":").map(Number);
  const total = hours * 60 + minutes;

  if (total >= 2 * 60 && total < 5 * 60) return { label: "London", active: true, marketTime: formatted };
  if (total >= 9 * 60 + 30 && total < 11 * 60) return { label: "New York", active: true, marketTime: formatted };
  if (total >= 10 * 60 && total < 12 * 60) return { label: "London Close", active: true, marketTime: formatted };
  return { label: "No kill zone", active: false, marketTime: formatted };
}
