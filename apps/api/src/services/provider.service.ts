import type { ProviderQueryInput, SignalQueryInput } from "@alphasignal/shared";
import type { ProviderRepository } from "../repositories/provider.repository.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";

export class ProviderService {
  constructor(private readonly repository: ProviderRepository) {}

  list(viewer: AuthenticatedUser, input: ProviderQueryInput) {
    return this.repository.list(viewer.id, input);
  }

  async get(viewer: AuthenticatedUser, providerId: string) {
    const provider = await this.repository.findById(providerId, viewer.id);
    if (!provider) {
      throw notFound("Provider not found.");
    }

    return provider;
  }

  async listSignals(providerId: string, input: SignalQueryInput) {
    await this.assertProvider(providerId);
    return this.repository.listSignals(providerId, input);
  }

  async analytics(providerId: string) {
    await this.assertProvider(providerId);
    return this.repository.analytics(providerId);
  }

  async subscribe(subscriber: AuthenticatedUser, providerId: string) {
    if (subscriber.id === providerId) {
      throw badRequest("You cannot subscribe to your own provider profile.");
    }
    await this.assertProvider(providerId);

    const maximum = subscriber.plan === "FREE" ? 2 : subscriber.plan === "PRO" ? 10 : Number.POSITIVE_INFINITY;
    if (Number.isFinite(maximum)) {
      const current = await this.repository.activeSubscriptionCount(subscriber.id);
      if (current >= maximum) {
        throw conflict(`Your ${subscriber.plan} plan supports up to ${maximum} provider subscriptions.`);
      }
    }

    return this.repository.subscribe(subscriber.id, providerId, subscriber.plan);
  }

  async unsubscribe(subscriber: AuthenticatedUser, providerId: string): Promise<void> {
    if (!(await this.repository.unsubscribe(subscriber.id, providerId))) {
      throw notFound("Active provider subscription not found.");
    }
  }

  private async assertProvider(providerId: string): Promise<void> {
    const provider = await this.repository.findById(providerId, "");
    if (!provider) {
      throw notFound("Provider not found.");
    }
  }
}
