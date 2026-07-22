import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { NotificationController } from "../controllers/notification.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

export async function registerNotificationRoutes(
  app: FastifyInstance,
  controller: NotificationController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  const authenticated: preHandlerHookHandler[] = [
    auth.authenticate,
    limits.byUser(policies.authenticated),
  ];

  app.get(
    "/notifications",
    {
      preHandler: authenticated,
      schema: {
        tags: ["notifications"],
        summary: "List in-app notifications",
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            read: { type: "boolean" },
          },
        },
      },
    },
    controller.list,
  );
  app.patch(
    "/notifications/:id/read",
    {
      preHandler: authenticated,
      schema: {
        tags: ["notifications"],
        summary: "Mark an in-app notification as read",
        params: idParams,
      },
    },
    controller.read,
  );
  app.patch(
    "/notifications/read-all",
    {
      preHandler: authenticated,
      schema: {
        tags: ["notifications"],
        summary: "Mark all in-app notifications as read",
      },
    },
    controller.readAll,
  );
}

const idParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1, maxLength: 128 },
  },
} as const;
