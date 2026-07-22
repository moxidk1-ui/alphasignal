import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config/env.js";
import type { StripeIntegration } from "../integrations/stripe.js";
import type { BillingRepository } from "../repositories/billing.repository.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { BillingService } from "./billing.service.js";

describe("BillingService", () => {
  it("creates a Stripe customer before initiating checkout for a new paid subscriber", async () => {
    const repository = repositoryMock({
      findAccount: vi.fn().mockResolvedValue(account({ stripeCustomerId: null })),
      setCustomerId: vi.fn().mockResolvedValue(account({ stripeCustomerId: "cus_new" })),
    });
    const stripe = stripeMock({
      createCustomer: vi.fn().mockResolvedValue({ id: "cus_new" }),
      createCheckoutSession: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/session" }),
    });

    await expect(new BillingService(config, repository, stripe).checkout(user, { plan: "PRO" })).resolves.toEqual({
      url: "https://checkout.stripe.test/session",
    });
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith({
      userId: user.id,
      customerId: "cus_new",
      plan: "PRO",
    });
  });

  it("applies the paid plan from a verified completed checkout event", async () => {
    const repository = repositoryMock();
    const stripe = stripeMock({
      constructWebhookEvent: vi.fn().mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            client_reference_id: user.id,
            customer: "cus_123",
            subscription: "sub_123",
            metadata: { plan: "PROVIDER" },
          },
        },
      }),
    });

    await new BillingService(config, repository, stripe).processWebhook(Buffer.from("{}"), "signature");

    expect(repository.applyPlan).toHaveBeenCalledWith({
      userId: user.id,
      customerId: "cus_123",
      subscriptionId: "sub_123",
      plan: "PROVIDER",
    });
  });

  it("removes paid entitlement when Stripe reports a deleted subscription", async () => {
    const repository = repositoryMock({
      findAccountByCustomerId: vi.fn().mockResolvedValue(account({ stripeCustomerId: "cus_123" })),
    });
    const stripe = stripeMock({
      constructWebhookEvent: vi.fn().mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { customer: "cus_123" } },
      }),
    });

    await new BillingService(config, repository, stripe).processWebhook(Buffer.from("{}"), "signature");

    expect(repository.applyPlan).toHaveBeenCalledWith({
      userId: user.id,
      customerId: "cus_123",
      subscriptionId: null,
      plan: "FREE",
    });
  });
});

function repositoryMock(overrides: Partial<BillingRepository> = {}): BillingRepository {
  return {
    findAccount: vi.fn(),
    findAccountByCustomerId: vi.fn(),
    setCustomerId: vi.fn(),
    applyPlan: vi.fn(),
    ...overrides,
  } as unknown as BillingRepository;
}

function stripeMock(overrides: Partial<StripeIntegration> = {}): StripeIntegration {
  return {
    createCustomer: vi.fn(),
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    constructWebhookEvent: vi.fn(),
    ...overrides,
  } as unknown as StripeIntegration;
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    stripeCustomerId: "cus_123",
    stripeSubId: null,
    ...overrides,
  };
}

const config = {
  STRIPE_PRO_PRICE_ID: "price_pro",
  STRIPE_PROVIDER_PRICE_ID: "price_provider",
} as AppConfig;

const user: AuthenticatedUser = {
  id: "user-1",
  email: "subscriber@example.com",
  name: "Subscriber",
  avatarUrl: null,
  role: "FREE_USER",
  plan: "FREE",
  emailVerified: true,
  emailAlertsEnabled: true,
  telegramChatId: null,
};
