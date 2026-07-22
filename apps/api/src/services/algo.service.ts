import type { UpdateProviderAlgoConfigInput } from "@alphasignal/shared";
import type { AlgoRepository } from "../repositories/algo.repository.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { badRequest, notFound } from "../utils/errors.js";
import type { JobPublisher, RealtimePublisher } from "./phase5.ports.js";
import type { SignalService } from "./signal.service.js";

export class AlgoService {
  constructor(
    private readonly repository: AlgoRepository,
    private readonly signalService: SignalService,
    private readonly jobs: JobPublisher,
    private readonly realtime: RealtimePublisher,
  ) {}

  getConfig(provider: AuthenticatedUser) {
    return this.repository.getOrCreateConfig(provider.id);
  }

  updateConfig(provider: AuthenticatedUser, input: UpdateProviderAlgoConfigInput) {
    const autoMode = input.algoMode === "AUTO";
    if (input.autoPublish !== autoMode) {
      throw badRequest("autoPublish must be enabled only when algoMode is AUTO.");
    }

    return this.repository.updateConfig(provider.id, input);
  }

  listPending(provider: AuthenticatedUser) {
    return this.repository.listPendingSignals(provider.id);
  }

  async approve(provider: AuthenticatedUser, detectionId: string) {
    const pending = await this.repository.findPendingSignal(detectionId, provider.id);
    if (!pending) {
      throw notFound("Pending algo detection not found.");
    }

    const signal = await this.repository.approveSignal(pending.id);
    await this.signalService.announcePublishedSignal(signal);
    return signal;
  }

  async reject(provider: AuthenticatedUser, detectionId: string): Promise<void> {
    const pending = await this.repository.findPendingSignal(detectionId, provider.id);
    if (!pending) {
      throw notFound("Pending algo detection not found.");
    }

    await this.repository.rejectSignal(pending.id);
    await this.realtime.publishToUser(provider.id, "algo:detection:rejected", { detectionId });
  }

  async announcePending(providerId: string, signal: { id: string; algoDetectionId: string | null }): Promise<void> {
    await Promise.all([
      this.realtime.publishToUser(providerId, "algo:detection", signal),
      this.jobs.enqueueNotification({
        event: "ALGO_PENDING_APPROVAL",
        signalId: signal.id,
        recipientId: providerId,
      }),
    ]);
  }
}
