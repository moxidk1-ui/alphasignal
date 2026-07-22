import type { ProviderRepository } from "../repositories/provider.repository.js";

export class ProviderAnalyticsProcessor {
  constructor(private readonly repository: ProviderRepository) {}

  async process(providerId?: string): Promise<{ refreshed: number }> {
    if (providerId) {
      await this.repository.refreshMetrics(providerId);
      return { refreshed: 1 };
    }

    const providerIds = await this.repository.listProviderIds();
    for (const id of providerIds) {
      await this.repository.refreshMetrics(id);
    }
    return { refreshed: providerIds.length };
  }
}
