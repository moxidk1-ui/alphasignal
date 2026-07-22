import type { FastifyInstance } from "fastify";
import type { BillingController } from "../controllers/billing.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

export async function registerBillingRoutes(
  app: FastifyInstance,
  controller: BillingController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  app.get(
    "/billing/plans",
    { preHandler: limits.byIp(policies.unauthenticated), schema: { tags: ["billing"], summary: "List subscription plans" } },
    controller.plans,
  );
  app.post(
    "/billing/checkout",
    {
      preHandler: [auth.authenticate, limits.byUser(policies.authenticated)],
      schema: {
        tags: ["billing"],
        summary: "Create a Stripe Checkout subscription session",
        body: {
          type: "object",
          required: ["plan"],
          additionalProperties: false,
          properties: { plan: { type: "string", enum: ["PRO", "PROVIDER"] } },
        },
      },
    },
    controller.checkout,
  );
  app.post(
    "/billing/portal",
    {
      preHandler: [auth.authenticate, limits.byUser(policies.authenticated)],
      schema: { tags: ["billing"], summary: "Create a Stripe customer portal session" },
    },
    controller.portal,
  );

  await app.register(async (webhook) => {
    webhook.removeContentTypeParser("application/json");
    webhook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
    webhook.post(
      "/webhooks/stripe",
      {
        preHandler: limits.byIp(policies.unauthenticated),
        schema: { tags: ["billing"], summary: "Receive signed Stripe events", hide: true },
      },
      controller.webhook,
    );
  });
}
