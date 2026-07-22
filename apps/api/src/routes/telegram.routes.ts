import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { TelegramController } from "../controllers/telegram.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

export async function registerTelegramRoutes(
  app: FastifyInstance,
  controller: TelegramController,
  auth: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  const authenticated: preHandlerHookHandler[] = [
    auth.authenticate,
    limits.byUser(policies.authenticated),
  ];

  app.post(
    "/users/me/telegram-link",
    {
      preHandler: authenticated,
      schema: {
        tags: ["users"],
        summary: "Create a short-lived Telegram linking command",
      },
    },
    controller.createLink,
  );
  app.delete(
    "/users/me/telegram-link",
    {
      preHandler: authenticated,
      schema: {
        tags: ["users"],
        summary: "Disable Telegram alerts for the current account",
      },
    },
    controller.unlink,
  );
  app.post(
    "/webhooks/telegram",
    {
      preHandler: limits.byIp(policies.unauthenticated),
      schema: {
        tags: ["notifications"],
        summary: "Receive Telegram bot updates",
        hide: true,
        body: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
    controller.webhook,
  );
}
