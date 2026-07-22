import { describe, expect, it, vi } from "vitest";
import type { ProviderRepository } from "../repositories/provider.repository.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { ProviderService } from "./provider.service.js";

describe("ProviderService", () => {
  it("creates a provider subscription within the subscriber plan limit", async () => {
    const repository = repositoryMock({
      findById: vi.fn().mockResolvedValue({ id: "provider-1" }),
      activeSubscriptionCount: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue({ id: "subscription-1" }),
    });
    const service = new ProviderService(repository);

    await expect(service.subscribe(freeUser, "provider-1")).resolves.toEqual({ id: "subscription-1" });
    expect(repository.subscribe).toHaveBeenCalledWith(freeUser.id, "provider-1", "FREE");
  });

  it("rejects a subscription when the free subscriber already follows two providers", async () => {
    const repository = repositoryMock({
      findById: vi.fn().mockResolvedValue({ id: "provider-3" }),
      activeSubscriptionCount: vi.fn().mockResolvedValue(2),
    });
    const service = new ProviderService(repository);

    await expect(service.subscribe(freeUser, "provider-3")).rejects.toThrow(
      "FREE plan supports up to 2 provider subscriptions",
    );
    expect(repository.subscribe).not.toHaveBeenCalled();
  });

  it("does not permit providers to follow themselves", async () => {
    const service = new ProviderService(repositoryMock());
    await expect(service.subscribe(freeUser, freeUser.id)).rejects.toThrow("subscribe to your own");
  });
});

const freeUser: AuthenticatedUser = {
  id: "subscriber-1",
  email: "retail@example.com",
  name: "Retail",
  avatarUrl: null,
  role: "FREE_USER",
  plan: "FREE",
  emailVerified: true,
  emailAlertsEnabled: true,
  telegramChatId: null,
};

function repositoryMock(overrides: Partial<ProviderRepository> = {}): ProviderRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    listSignals: vi.fn(),
    analytics: vi.fn(),
    activeSubscriptionCount: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    ...overrides,
  } as unknown as ProviderRepository;
}
