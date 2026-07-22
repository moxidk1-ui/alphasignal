import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@alphasignal/db";
import { ProviderRepository } from "./provider.repository.js";

describe("ProviderRepository Phase 6 integrity", () => {
  it("counts active follows without an arbitrary local expiration date", async () => {
    const count = vi.fn().mockResolvedValue(2);
    const repository = new ProviderRepository({
      subscription: { count },
    } as unknown as PrismaClient);

    await expect(repository.activeSubscriptionCount("subscriber-1")).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: { subscriberId: "subscriber-1", status: "ACTIVE" },
    });
  });

  it("builds directory rankings only from market-verified or administrator-corrected outcomes", async () => {
    const aggregate = vi.fn().mockResolvedValue({
      _count: { _all: 4 },
      _avg: { confidence: 80, riskRewardRatio: 2.25 },
    });
    const groupBy = vi.fn().mockResolvedValue([
      { result: "WIN", _count: { result: 2 } },
      { result: "LOSS", _count: { result: 1 } },
    ]);
    const upsert = vi.fn().mockResolvedValue({ userId: "provider-1" });
    const repository = new ProviderRepository({
      signal: { aggregate, groupBy },
      providerProfile: { upsert },
    } as unknown as PrismaClient);

    await repository.refreshMetrics("provider-1");

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          outcomeSource: { in: ["MARKET_DATA", "ADMIN_OVERRIDE"] },
        }),
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ totalSignals: 4 }),
      }),
    );
    expect(upsert.mock.calls[0]?.[0].update.winRate).toBeCloseTo(200 / 3);
  });

  it("excludes provider-reported results from public performance analytics", async () => {
    const aggregate = vi
      .fn()
      .mockResolvedValueOnce({
        _count: { _all: 7 },
        _avg: { confidence: 81, riskRewardRatio: 2.5 },
      })
      .mockResolvedValueOnce({
        _count: { _all: 3 },
        _avg: { pnlPercent: 4.25 },
      });
    const groupBy = vi.fn().mockResolvedValue([
      { result: "WIN", _count: { result: 2 } },
      { result: "LOSS", _count: { result: 1 } },
    ]);
    const repository = new ProviderRepository({
      signal: { aggregate, groupBy },
    } as unknown as PrismaClient);

    await expect(repository.analytics("provider-1")).resolves.toMatchObject({
      totalSignals: 7,
      avgPnlPercent: 4.25,
      verifiedOutcomeCount: 3,
      outcomes: { WIN: 2, LOSS: 1 },
    });
    expect(aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          outcomeSource: { in: ["MARKET_DATA", "ADMIN_OVERRIDE"] },
        }),
      }),
    );
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          outcomeSource: { in: ["MARKET_DATA", "ADMIN_OVERRIDE"] },
        }),
      }),
    );
  });
});
