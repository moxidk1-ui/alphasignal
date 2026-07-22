import type { Redis } from "ioredis";
import type { AuthenticatedUser } from "../types/auth.js";
import { forbidden } from "../utils/errors.js";

interface ViewableSignal {
  id: string;
  providerId: string;
  source: string;
}

export class PlanEnforcementService {
  constructor(private readonly redis: Redis) {}

  assertPublisher(user: AuthenticatedUser): void {
    if (user.role !== "ADMIN" && user.plan !== "PROVIDER") {
      throw forbidden("The Provider plan is required to publish signals.");
    }
  }

  assertAiAnalysis(user: AuthenticatedUser): void {
    if (user.role !== "ADMIN" && user.plan === "FREE") {
      throw forbidden("AI analysis is available on Pro and Provider plans.");
    }
  }

  assertAlgoEngine(user: AuthenticatedUser): void {
    if (user.role !== "ADMIN" && user.plan !== "PROVIDER") {
      throw forbidden("Algorithmic scanning configuration is available on the Provider plan.");
    }
  }

  assertPaidAlerts(user: AuthenticatedUser): void {
    if (user.role !== "ADMIN" && user.plan === "FREE") {
      throw forbidden("In-app and Telegram alerts are available on paid plans.");
    }
  }

  async filterSignals<T extends ViewableSignal>(user: AuthenticatedUser, signals: T[]): Promise<T[]> {
    if (user.plan !== "FREE" || user.role === "ADMIN") {
      return signals;
    }
    const visible: T[] = [];
    for (const signal of signals) {
      if (signal.providerId === user.id || (signal.source !== "ALGO" && (await this.consumeFreeSignal(user.id, signal.id)))) {
        visible.push(signal);
      }
    }
    return visible;
  }

  async assertSignalReadable(user: AuthenticatedUser, signal: ViewableSignal): Promise<void> {
    if (user.plan !== "FREE" || user.role === "ADMIN" || signal.providerId === user.id) {
      return;
    }
    if (signal.source === "ALGO") {
      throw forbidden("Algorithmic signals are available on paid plans.");
    }
    if (!(await this.consumeFreeSignal(user.id, signal.id))) {
      throw forbidden("The Free plan permits viewing 5 signals per day.");
    }
  }

  private async consumeFreeSignal(userId: string, signalId: string): Promise<boolean> {
    const date = new Date().toISOString().slice(0, 10);
    const result = await this.redis.eval(freeViewScript, 1, `entitlement:signals:${date}:${userId}`, signalId, "5");
    return Number(result) === 1;
  }
}

const freeViewScript = `
local key = KEYS[1]
local signal = ARGV[1]
local limit = tonumber(ARGV[2])
if redis.call('SISMEMBER', key, signal) == 1 then
  return 1
end
if redis.call('SCARD', key) >= limit then
  return 0
end
redis.call('SADD', key, signal)
redis.call('EXPIRE', key, 172800)
return 1
`;
