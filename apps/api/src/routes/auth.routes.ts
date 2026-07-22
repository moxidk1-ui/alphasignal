import type { FastifyInstance } from "fastify";
import type { AuthController } from "../controllers/auth.controller.js";
import type { AuthMiddleware } from "../middleware/auth.middleware.js";
import type { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { policies } from "../middleware/rate-limit.middleware.js";
import type { TokenService } from "../services/token.service.js";

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

const sessionResponseSchema = {
  type: "object",
  required: ["user", "accessToken", "accessTokenExpiresAt", "refreshTokenExpiresAt"],
  properties: {
    user: userResponseSchema,
    accessToken: { type: "string" },
    refreshToken: { type: "string" },
    accessTokenExpiresAt: { type: "string" },
    refreshTokenExpiresAt: { type: "string" },
  },
} as const;

export async function registerAuthRoutes(
  app: FastifyInstance,
  controller: AuthController,
  authMiddleware: AuthMiddleware,
  limits: RateLimitMiddleware,
  tokens: TokenService,
): Promise<void> {
  app.post(
    "/auth/register",
    {
      preHandler: limits.byIp(policies.register),
      schema: {
        tags: ["auth"],
        summary: "Register a subscriber account",
        body: {
          type: "object",
          required: ["email", "password", "name"],
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 12, maxLength: 128 },
            name: { type: "string", minLength: 1, maxLength: 120 },
          },
        },
        response: { 201: sessionResponseSchema },
      },
    },
    controller.register,
  );

  app.post(
    "/auth/login",
    {
      preHandler: limits.byIp(policies.login),
      schema: {
        tags: ["auth"],
        summary: "Login with email and password",
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
        response: { 200: sessionResponseSchema },
      },
    },
    controller.login,
  );

  app.post(
    "/auth/oauth/google",
    {
      preHandler: limits.byIp(policies.unauthenticated),
      schema: {
        tags: ["auth"],
        summary: "Internal Google OAuth login bridge for NextAuth",
        hide: true,
        body: {
          type: "object",
          required: ["provider", "providerAccountId", "email", "name"],
          additionalProperties: false,
          properties: {
            provider: { type: "string", enum: ["google"] },
            providerAccountId: { type: "string" },
            email: { type: "string", format: "email" },
            name: { type: "string" },
            avatarUrl: { type: "string" },
            emailVerified: { type: "boolean" },
          },
        },
        response: { 200: sessionResponseSchema },
      },
    },
    controller.oauthLogin,
  );

  app.post(
    "/auth/refresh",
    {
      preHandler: limits.refreshByUser(policies.refresh, tokens),
      schema: {
        tags: ["auth"],
        summary: "Rotate refresh token and issue a new access token",
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            refreshToken: { type: "string" },
          },
        },
        response: { 200: sessionResponseSchema },
      },
    },
    controller.refresh,
  );

  app.post(
    "/auth/logout",
    {
      preHandler: limits.byIp(policies.unauthenticated),
      schema: {
        tags: ["auth"],
        summary: "Logout and revoke current refresh token",
        response: { 204: { type: "null" } },
      },
    },
    controller.logout,
  );

  app.get(
    "/auth/verify-email",
    {
      preHandler: limits.byIp(policies.unauthenticated),
      schema: {
        tags: ["auth"],
        summary: "Verify account email",
        querystring: {
          type: "object",
          required: ["token"],
          additionalProperties: false,
          properties: {
            token: { type: "string" },
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
    controller.verifyEmail,
  );

  app.get(
    "/auth/me",
    {
      preHandler: [authMiddleware.authenticate, limits.byUser(policies.authenticated)],
      schema: {
        tags: ["auth"],
        summary: "Current authenticated user",
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
}
