import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import type { Plan } from "@alphasignal/shared";
import type { TokenService } from "../services/token.service.js";
import { getRefreshTokenFromRequest } from "../utils/http.js";

export interface RateLimitPolicy {
  id: string;
  limit: number;
  windowMs: number;
}

type IdentityResolver = (request: FastifyRequest) => string | Promise<string>;

export const policies = {
  login: { id: "auth:login", limit: 10, windowMs: 15 * 60 * 1000 },
  register: { id: "auth:register", limit: 5, windowMs: 60 * 60 * 1000 },
  refresh: { id: "auth:refresh", limit: 30, windowMs: 15 * 60 * 1000 },
  market: { id: "market:read", limit: 60, windowMs: 60 * 1000 },
  authenticated: { id: "authenticated", limit: 300, windowMs: 15 * 60 * 1000 },
  unauthenticated: { id: "unauthenticated", limit: 60, windowMs: 15 * 60 * 1000 },
  signalsRead: { id: "signals:read", limit: 120, windowMs: 60 * 1000 },
  signalsWrite: { id: "signals:write", limit: 30, windowMs: 60 * 60 * 1000 },
  algoApprove: { id: "algo:approve", limit: 60, windowMs: 60 * 1000 },
} satisfies Record<string, RateLimitPolicy>;

export class RateLimitMiddleware {
  constructor(private readonly redis: Redis) {}

  byIp(policy: RateLimitPolicy): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return rateLimit({ redis: this.redis, policy, resolveIdentity: (request) => `ip:${request.ip}` });
  }

  byUser(policy: RateLimitPolicy): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return rateLimit({
      redis: this.redis,
      policy,
      resolveIdentity: (request) => (request.auth ? `user:${request.auth.user.id}` : `ip:${request.ip}`),
    });
  }

  refreshByUser(
    policy: RateLimitPolicy,
    tokens: TokenService,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return rateLimit({
      redis: this.redis,
      policy,
      resolveIdentity: async (request) => {
        const body = request.body as { refreshToken?: unknown } | undefined;
        const bodyToken = typeof body?.refreshToken === "string" ? body.refreshToken : undefined;
        const token = getRefreshTokenFromRequest(request) ?? bodyToken;
        if (!token) {
          return `ip:${request.ip}`;
        }

        try {
          const claims = await tokens.verifyRefreshToken(token);
          return `user:${claims.userId}`;
        } catch {
          return `ip:${request.ip}`;
        }
      },
    });
  }

  analysisPolicy(plan: Plan): RateLimitPolicy {
    switch (plan) {
      case "FREE":
        return { id: "signals:analyze:free", limit: 2, windowMs: 24 * 60 * 60 * 1000 };
      case "PRO":
        return { id: "signals:analyze:pro", limit: 10, windowMs: 60 * 60 * 1000 };
      case "PROVIDER":
        return { id: "signals:analyze:provider", limit: 30, windowMs: 60 * 60 * 1000 };
    }
  }

  byAnalysisPlan(): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request, reply) => {
      const plan = request.auth?.user.plan;
      const policy = this.analysisPolicy(plan ?? "FREE");
      await this.byUser(policy)(request, reply);
    };
  }
}

export function rateLimit(options: {
  redis: Redis;
  policy: RateLimitPolicy;
  resolveIdentity: IdentityResolver;
}): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const identity = await options.resolveIdentity(request);
    const now = Date.now();
    const member = `${now}:${randomUUID()}`;
    const key = `ratelimit:${options.policy.id}:${identity}`;
    const result = (await options.redis.eval(
      slidingWindowScript,
      1,
      key,
      String(now),
      String(options.policy.windowMs),
      String(options.policy.limit),
      member,
    )) as [number, number, number];
    const [allowed, count, resetAt] = result.map(Number) as [number, number, number];
    const remaining = Math.max(options.policy.limit - count, 0);
    const resetSeconds = Math.ceil(resetAt / 1000);
    const retryAfter = Math.max(Math.ceil((resetAt - now) / 1000), 1);

    reply.header("X-RateLimit-Limit", String(options.policy.limit));
    reply.header("X-RateLimit-Remaining", String(remaining));
    reply.header("X-RateLimit-Reset", String(resetSeconds));

    if (allowed !== 1) {
      reply.header("Retry-After", String(retryAfter));
      await reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Retry after the indicated interval.",
          requestId: request.id,
        },
      });
    }
  };
}

const slidingWindowScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
local allowed = 0
if count < limit then
  redis.call('ZADD', key, now, member)
  count = count + 1
  allowed = 1
end

redis.call('PEXPIRE', key, window)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local reset = now + window
if #oldest > 0 then
  reset = tonumber(oldest[2]) + window
end
return { allowed, count, reset }
`;
