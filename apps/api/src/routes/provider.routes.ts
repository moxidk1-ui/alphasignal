import type { FastifyInstance } from "fastify";
import type { ProviderController } from "../controllers/provider.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

export async function registerProviderRoutes(
  app: FastifyInstance,
  controller: ProviderController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  const read = [auth.authenticate, limits.byUser(policies.authenticated)];
  const write = [auth.authenticate, limits.byUser(policies.authenticated)];

  app.get("/providers", { preHandler: read, schema: { tags: ["providers"], summary: "Browse providers", querystring: listQuery } }, controller.list);
  app.get("/providers/:id", { preHandler: read, schema: { tags: ["providers"], summary: "Get provider profile", params: idParams } }, controller.get);
  app.get("/providers/:id/signals", { preHandler: read, schema: { tags: ["providers"], summary: "List provider published signals", params: idParams } }, controller.signals);
  app.get("/providers/:id/analytics", { preHandler: read, schema: { tags: ["providers"], summary: "Get provider signal analytics", params: idParams } }, controller.analytics);
  app.post("/providers/:id/subscribe", { preHandler: write, schema: { tags: ["providers"], summary: "Subscribe to provider", params: idParams } }, controller.subscribe);
  app.delete("/providers/:id/subscribe", { preHandler: write, schema: { tags: ["providers"], summary: "Cancel provider subscription", params: idParams } }, controller.unsubscribe);
}

const idParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
} as const;

const listQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    q: { type: "string", minLength: 1, maxLength: 120 },
    verified: { type: "boolean" },
  },
} as const;
