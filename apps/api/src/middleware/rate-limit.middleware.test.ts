import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { policies, rateLimit } from "./rate-limit.middleware.js";

describe("rateLimit", () => {
  it("allows requests within a sliding window and returns quota headers", async () => {
    const redis = { eval: vi.fn().mockResolvedValue([1, 1, Date.now() + 60_000]) };
    const reply = response();
    const hook = rateLimit({
      redis: redis as unknown as Redis,
      policy: policies.market,
      resolveIdentity: () => "user:user-1",
    });

    await hook(request(), reply.value);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("ZREMRANGEBYSCORE"),
      1,
      "ratelimit:market:read:user:user-1",
      expect.any(String),
      String(policies.market.windowMs),
      String(policies.market.limit),
      expect.any(String),
    );
    expect(reply.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(reply.headers.get("X-RateLimit-Remaining")).toBe("59");
    expect(reply.send).not.toHaveBeenCalled();
  });

  it("rejects requests beyond the limit with retry information", async () => {
    const redis = { eval: vi.fn().mockResolvedValue([0, 60, Date.now() + 30_000]) };
    const reply = response();
    const hook = rateLimit({
      redis: redis as unknown as Redis,
      policy: policies.market,
      resolveIdentity: () => "user:user-1",
    });

    await hook(request(), reply.value);

    expect(reply.statusCode).toBe(429);
    expect(reply.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(Number(reply.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "RATE_LIMITED" }) }),
    );
  });
});

function request(): FastifyRequest {
  return { id: "request-id", ip: "127.0.0.1" } as FastifyRequest;
}

function response(): {
  value: FastifyReply;
  headers: Map<string, string>;
  send: ReturnType<typeof vi.fn>;
  statusCode: number;
} {
  const headers = new Map<string, string>();
  const state = {
    statusCode: 200,
  };
  const send = vi.fn().mockResolvedValue(undefined);
  const value = {
    header(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    code(statusCode: number) {
      state.statusCode = statusCode;
      return this;
    },
    send,
  } as unknown as FastifyReply;

  return {
    value,
    headers,
    send,
    get statusCode() {
      return state.statusCode;
    },
  };
}
