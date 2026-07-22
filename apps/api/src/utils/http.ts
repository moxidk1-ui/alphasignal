import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config/env.js";

export const refreshCookieName = "alphasignal_refresh";

export function getRefreshTokenFromRequest(request: FastifyRequest): string | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[refreshCookieName];
}

export function setRefreshCookie(reply: FastifyReply, token: string, config: AppConfig): void {
  reply.setCookie(refreshCookieName, token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60,
    path: "/auth",
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
  });
}

export function clearRefreshCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(refreshCookieName, {
    httpOnly: true,
    path: "/auth",
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
  });
}

export function isInternalWebRequest(request: FastifyRequest, config: AppConfig): boolean {
  return request.headers["x-alphasignal-internal-auth"] === config.NEXTAUTH_SECRET;
}
