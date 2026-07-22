import type { FastifyInstance } from "fastify";
import type { AdminController } from "../controllers/admin.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

export async function registerAdminRoutes(
  app: FastifyInstance,
  controller: AdminController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  const adminOnly = [auth.authenticate, auth.requireRoles(["ADMIN"]), limits.byUser(policies.authenticated)];
  app.get("/admin/users", { preHandler: adminOnly, schema: { tags: ["admin"], summary: "List user accounts" } }, controller.users);
  app.patch(
    "/admin/users/:id/role",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["admin"],
        summary: "Change a user role",
        params: idParams,
        body: {
          type: "object",
          required: ["role"],
          additionalProperties: false,
          properties: { role: { type: "string", enum: ["ADMIN", "PROVIDER", "SUBSCRIBER", "FREE_USER"] } },
        },
      },
    },
    controller.updateRole,
  );
  app.get("/admin/stats", { preHandler: adminOnly, schema: { tags: ["admin"], summary: "Read platform metrics" } }, controller.stats);
  app.get("/admin/algo/detections", { preHandler: adminOnly, schema: { tags: ["admin"], summary: "Review algo detection activity" } }, controller.detections);
}

const idParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
} as const;
