import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import type { AuthenticatedUser } from "../types/auth.js";
import { PlanEnforcementService } from "./plan-enforcement.service.js";

describe("PlanEnforcementService", () => {
  it("blocks free accounts from provider, AI, algo, and paid-alert capabilities", () => {
    const service = new PlanEnforcementService(redis());

    expect(() => service.assertPublisher(freeUser)).toThrow("Provider plan");
    expect(() => service.assertAiAnalysis(freeUser)).toThrow("AI analysis");
    expect(() => service.assertAlgoEngine(freeUser)).toThrow("Provider plan");
    expect(() => service.assertPaidAlerts(freeUser)).toThrow("paid plans");
  });

  it("does not expose algo signals to a free subscriber and records permitted manual views", async () => {
    const client = redis(1);
    const service = new PlanEnforcementService(client);
    const signals = [
      { id: "algo-1", providerId: "provider", source: "ALGO" },
      { id: "manual-1", providerId: "provider", source: "MANUAL" },
    ];

    await expect(service.filterSignals(freeUser, signals)).resolves.toEqual([signals[1]]);
    expect(client.eval).toHaveBeenCalledOnce();
  });

  it("refuses a sixth free signal view when the atomic allowance check rejects it", async () => {
    const service = new PlanEnforcementService(redis(0));

    await expect(
      service.assertSignalReadable(freeUser, { id: "manual-6", providerId: "provider", source: "MANUAL" }),
    ).rejects.toThrow("5 signals per day");
  });

  it("allows Provider accounts to use publishing, AI, algo and alerts", () => {
    const service = new PlanEnforcementService(redis());

    expect(() => service.assertPublisher(providerUser)).not.toThrow();
    expect(() => service.assertAiAnalysis(providerUser)).not.toThrow();
    expect(() => service.assertAlgoEngine(providerUser)).not.toThrow();
    expect(() => service.assertPaidAlerts(providerUser)).not.toThrow();
  });
});

function redis(result = 1): Redis {
  return { eval: vi.fn().mockResolvedValue(result) } as unknown as Redis;
}

const freeUser: AuthenticatedUser = {
  id: "free-1",
  email: "free@example.com",
  name: "Free",
  avatarUrl: null,
  role: "FREE_USER",
  plan: "FREE",
  emailVerified: true,
  emailAlertsEnabled: true,
  telegramChatId: null,
};

const providerUser: AuthenticatedUser = {
  ...freeUser,
  id: "provider-1",
  role: "PROVIDER",
  plan: "PROVIDER",
};
