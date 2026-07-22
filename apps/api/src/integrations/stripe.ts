import Stripe from "stripe";
import type { FastifyBaseLogger } from "fastify";
import type { Plan } from "@alphasignal/shared";
import type { AppConfig } from "../config/env.js";
import { badRequest, serviceUnavailable } from "../utils/errors.js";
import { ProviderCircuit } from "./circuit-breaker.js";

export class StripeIntegration {
  private readonly stripe: Stripe;
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    logger: FastifyBaseLogger,
  ) {
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      appInfo: { name: "AlphaSignal", version: "0.1.0" },
    });
    this.circuit = new ProviderCircuit(
      "stripe",
      logger,
      () => serviceUnavailable("Billing services are temporarily unavailable."),
    );
  }

  createCustomer(user: { id: string; email: string; name: string }): Promise<Stripe.Customer> {
    return this.circuit.execute(() =>
      this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      }),
    );
  }

  createCheckoutSession(input: {
    userId: string;
    customerId: string;
    plan: Exclude<Plan, "FREE">;
  }): Promise<Stripe.Checkout.Session> {
    const price = input.plan === "PRO" ? this.config.STRIPE_PRO_PRICE_ID : this.config.STRIPE_PROVIDER_PRICE_ID;
    return this.circuit.execute(() =>
      this.stripe.checkout.sessions.create({
        mode: "subscription",
        customer: input.customerId,
        client_reference_id: input.userId,
        line_items: [{ price, quantity: 1 }],
        metadata: { userId: input.userId, plan: input.plan },
        subscription_data: { metadata: { userId: input.userId, plan: input.plan } },
        allow_promotion_codes: true,
        success_url: `${this.config.FRONTEND_URL}/subscriptions?checkout=success`,
        cancel_url: `${this.config.FRONTEND_URL}/subscriptions?checkout=cancelled`,
      }),
    );
  }

  createPortalSession(customerId: string): Promise<Stripe.BillingPortal.Session> {
    return this.circuit.execute(() =>
      this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${this.config.FRONTEND_URL}/subscriptions`,
      }),
    );
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.config.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw badRequest("Invalid Stripe webhook signature.");
    }
  }
}
