import type { FastifyInstance } from "fastify";
import type { WatchlistController } from "../controllers/watchlist.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

export async function registerWatchlistRoutes(
  app: FastifyInstance,
  controller: WatchlistController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  const secured = [auth.authenticate, limits.byUser(policies.authenticated)];

  app.get("/watchlist", { preHandler: secured, schema: { tags: ["watchlist"], summary: "List watchlist instruments" } }, controller.list);
  app.post("/watchlist", { preHandler: secured, schema: { tags: ["watchlist"], summary: "Add watchlist instrument", body: itemBody } }, controller.add);
  app.delete("/watchlist/:id", { preHandler: secured, schema: { tags: ["watchlist"], summary: "Delete watchlist instrument", params: idParams } }, controller.remove);
}

const itemBody = {
  type: "object",
  required: ["ticker", "market"],
  additionalProperties: false,
  properties: {
    ticker: { type: "string", minLength: 1, maxLength: 24 },
    market: { type: "string", enum: ["STOCKS", "FOREX", "CRYPTO", "FUTURES"] },
  },
} as const;

const idParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
} as const;
