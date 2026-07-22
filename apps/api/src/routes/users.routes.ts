import type { FastifyInstance } from "fastify";
import type { UsersController } from "../controllers/users.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";

const userResponseSchema = {
  type: "object",
  required: ["id", "email", "name", "role", "plan", "emailVerified", "emailAlertsEnabled"],
  properties: {
    id: { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
    role: { type: "string" },
    plan: { type: "string" },
    emailVerified: { type: "boolean" },
    emailAlertsEnabled: { type: "boolean" },
    telegramChatId: { type: ["string", "null"] },
  },
} as const;

export async function registerUsersRoutes(
  app: FastifyInstance,
  controller: UsersController,
  authMiddleware: AuthMiddleware,
  limits: RateLimitMiddleware,
): Promise<void> {
  app.get(
    "/users/me",
    {
      preHandler: [authMiddleware.authenticate, limits.byUser(policies.authenticated)],
      schema: {
        tags: ["users"],
        summary: "Current user profile",
        response: {
          200: {
            type: "object",
            required: ["user"],
            properties: { user: userResponseSchema },
          },
        },
      },
    },
    controller.me,
  );

  app.patch(
    "/users/me",
    {
      preHandler: [authMiddleware.authenticate, limits.byUser(policies.authenticated)],
      schema: {
        tags: ["users"],
        summary: "Update current user profile",
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            avatarUrl: { type: ["string", "null"] },
            emailAlertsEnabled: { type: "boolean" },
          },
        },
        response: {
          200: {
            type: "object",
            required: ["user"],
            properties: { user: userResponseSchema },
          },
        },
      },
    },
    controller.updateMe,
  );
}
