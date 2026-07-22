import type Stripe from "stripe";
import type { BillingCheckoutInput, Plan } from "@alphasignal/shared";
import type { AppConfig } from "../config/env.js";
import type { StripeIntegration } from "../integrations/stripe.js";
import type { BillingAccount, BillingRepository } from "../repositories/billing.repository.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { badRequest, notFound } from "../utils/errors.js";

export const subscriptionPlans = [
  {
    id: "FREE",
    name: "Free",
    monthlyPrice: 0,
    features: ["5 signals per day", "Email alerts", "2 provider subscriptions"],
  },
  {
    id: "PRO",
    name: "Pro",
    monthlyPrice: 29,
    features: ["Unlimited signals", "AI analysis: 10/hour", "Live feed and Telegram", "10 provider subscriptions"],
  },
  {
    id: "PROVIDER",
    name: "Provider",
    monthlyPrice: 79,
    features: ["Publishing and algo engine", "AI analysis: 30/hour", "Provider analytics", "Unlimited subscribers"],
  },
] as const;

export class BillingService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: BillingRepository,
    private readonly stripe: StripeIntegration,
  ) {}

  plans() {
    return subscriptionPlans;
  }

  async checkout(user: AuthenticatedUser, input: BillingCheckoutInput): Promise<{ url: string }> {
    let account = await this.requireAccount(user.id);
    if (!account.stripeCustomerId) {
      const customer = await this.stripe.createCustomer(user);
      account = await this.repository.setCustomerId(user.id, customer.id);
    }

    const session = await this.stripe.createCheckoutSession({
      userId: user.id,
      customerId: account.stripeCustomerId!,
      plan: input.plan,
    });
    if (!session.url) {
      throw badRequest("Stripe checkout did not provide a redirect URL.");
    }
    return { url: session.url };
  }

  async portal(user: AuthenticatedUser): Promise<{ url: string }> {
    const account = await this.requireAccount(user.id);
    if (!account.stripeCustomerId) {
      throw badRequest("A billing portal is available after starting a paid subscription.");
    }
    const session = await this.stripe.createPortalSession(account.stripeCustomerId);
    return { url: session.url };
  }

  async processWebhook(payload: Buffer, signature: string | undefined): Promise<void> {
    if (!signature) {
      throw badRequest("Stripe-Signature header is required.");
    }
    const event = this.stripe.constructWebhookEvent(payload, signature);

    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckout(event.data.object);
        return;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await this.handleSubscription(event.data.object);
        return;
      case "customer.subscription.deleted":
        await this.handleCancelledSubscription(event.data.object);
        return;
      default:
        return;
    }
  }

  private async handleCheckout(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId ?? session.client_reference_id;
    const customerId = stringIdentifier(session.customer);
    const subscriptionId = stringIdentifier(session.subscription);
    const plan = parsePaidPlan(session.metadata?.plan);
    if (!userId || !customerId || !plan) {
      return;
    }
    await this.repository.applyPlan({
      userId,
      plan,
      customerId,
      ...(subscriptionId ? { subscriptionId } : {}),
    });
  }

  private async handleSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customerId = stringIdentifier(subscription.customer);
    if (!customerId) {
      return;
    }
    const account = await this.repository.findAccountByCustomerId(customerId);
    if (!account) {
      return;
    }
    const active = ["active", "trialing"].includes(subscription.status);
    const plan = active ? this.planFromSubscription(subscription) : "FREE";
    await this.repository.applyPlan({
      userId: account.id,
      plan,
      customerId,
      subscriptionId: active ? subscription.id : null,
    });
  }

  private async handleCancelledSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customerId = stringIdentifier(subscription.customer);
    if (!customerId) {
      return;
    }
    const account = await this.repository.findAccountByCustomerId(customerId);
    if (account) {
      await this.repository.applyPlan({ userId: account.id, plan: "FREE", customerId, subscriptionId: null });
    }
  }

  private planFromSubscription(subscription: Stripe.Subscription): Plan {
    const metadataPlan = parsePaidPlan(subscription.metadata.plan);
    if (metadataPlan) {
      return metadataPlan;
    }
    const priceIds = subscription.items.data.map((item) => item.price.id);
    if (priceIds.includes(this.config.STRIPE_PROVIDER_PRICE_ID)) {
      return "PROVIDER";
    }
    return priceIds.includes(this.config.STRIPE_PRO_PRICE_ID) ? "PRO" : "FREE";
  }

  private async requireAccount(userId: string): Promise<BillingAccount> {
    const account = await this.repository.findAccount(userId);
    if (!account) {
      throw notFound("Account not found.");
    }
    return account;
  }
}

function parsePaidPlan(value: string | undefined): "PRO" | "PROVIDER" | null {
  return value === "PRO" || value === "PROVIDER" ? value : null;
}

function stringIdentifier(value: string | { id: string } | null): string | undefined {
  return typeof value === "string" ? value : value?.id;
}
