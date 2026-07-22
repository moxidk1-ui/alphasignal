import { describe, expect, it, vi } from "vitest";
import type { ProviderRepository } from "../repositories/provider.repository.js";
import { ProviderAnalyticsProcessor } from "./provider-analytics.processor.js";

describe("ProviderAnalyticsProcessor", () => {
  it("refreshes one requested provider", async () => {
    const repository = {
      refreshMetrics: vi.fn().mockResolvedValue(undefined),
      listProviderIds: vi.fn(),
    } as unknown as ProviderRepository;
    const processor = new ProviderAnalyticsProcessor(repository);

    await expect(processor.process("provider-1")).resolves.toEqual({ refreshed: 1 });
    expect(repository.refreshMetrics).toHaveBeenCalledWith("provider-1");
    expect(repository.listProviderIds).not.toHaveBeenCalled();
  });

  it("can reconcile every provider", async () => {
    const repository = {
      refreshMetrics: vi.fn().mockResolvedValue(undefined),
      listProviderIds: vi.fn().mockResolvedValue(["provider-1", "provider-2"]),
    } as unknown as ProviderRepository;
    const processor = new ProviderAnalyticsProcessor(repository);

    await expect(processor.process()).resolves.toEqual({ refreshed: 2 });
    expect(repository.refreshMetrics).toHaveBeenCalledTimes(2);
  });
});
