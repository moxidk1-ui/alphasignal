import type {
  AnalyzeSignalInput,
  CloseSignalInput,
  CreateSignalInput,
  SignalQueryInput,
  UpdateSignalInput,
} from "@alphasignal/shared";
import type { AuthenticatedUser } from "../types/auth.js";
import type { SignalRecord, SignalRepository } from "../repositories/signal.repository.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";
import type { JobPublisher, RealtimePublisher } from "./phase5.ports.js";

export class SignalService {
  constructor(
    private readonly repository: SignalRepository,
    private readonly jobs: JobPublisher,
    private readonly realtime: RealtimePublisher,
  ) {}

  list(user: AuthenticatedUser, input: SignalQueryInput) {
    return this.repository.listVisible(user.id, input);
  }

  async get(user: AuthenticatedUser, id: string): Promise<SignalRecord> {
    const signal = await this.repository.findVisible(id, user.id);
    if (!signal) {
      throw notFound("Signal not found.");
    }

    return signal;
  }

  async create(provider: AuthenticatedUser, input: CreateSignalInput): Promise<SignalRecord> {
    if (input.source === "ALGO") {
      throw badRequest("Algorithmic signals can only be created by the scanner.");
    }
    if (input.status !== "DRAFT" && input.status !== "PUBLISHED") {
      throw badRequest("Provider-created signals must be saved as draft or published.");
    }

    validateTradeLevels(input);
    const signal = await this.repository.create(
      provider.id,
      input,
      input.status === "PUBLISHED" ? new Date() : null,
    );

    if (signal.status === "PUBLISHED") {
      await this.announcePublishedSignal(signal);
    }

    return signal;
  }

  async update(provider: AuthenticatedUser, id: string, input: UpdateSignalInput): Promise<SignalRecord> {
    const current = await this.findOwned(provider.id, id);
    if (current.status !== "DRAFT" && current.status !== "PENDING_APPROVAL") {
      throw conflict("Only draft or pending approval signals can be edited.");
    }

    validateTradeLevels({
      direction: input.direction ?? current.direction,
      entryPrice: input.entryPrice ?? current.entryPrice,
      stopLoss: input.stopLoss ?? current.stopLoss,
      takeProfit1: input.takeProfit1 ?? current.takeProfit1,
      takeProfit2: input.takeProfit2 ?? current.takeProfit2,
      takeProfit3: input.takeProfit3 ?? current.takeProfit3,
    });

    if (input.status !== undefined && input.status !== "DRAFT" && input.status !== "PUBLISHED") {
      throw badRequest("A draft can only transition to published status.");
    }
    if (current.status === "PENDING_APPROVAL" && input.status === "DRAFT") {
      throw badRequest("A pending algo detection can be edited or published, but cannot become a draft.");
    }

    const signal = await this.repository.updateEditable(id, input);
    if (signal.status === "PUBLISHED") {
      await this.announcePublishedSignal(signal);
    }

    return signal;
  }

  async close(provider: AuthenticatedUser, id: string, input: CloseSignalInput): Promise<SignalRecord> {
    const current = await this.findOwned(provider.id, id);
    if (current.status !== "PUBLISHED") {
      throw conflict("Only published signals can be closed.");
    }

    const signal = await this.repository.close(id, input);
    const subscriberIds = await this.repository.findActiveSubscriberIds(provider.id);
    await Promise.all([
      this.realtime.publishToUsers(subscriberIds, "signal:closed", signal),
      this.jobs.enqueueNotification({ event: "SIGNAL_CLOSED", signalId: signal.id, recipientIds: subscriberIds }),
    ]);

    return signal;
  }

  async delete(provider: AuthenticatedUser, id: string): Promise<void> {
    const signal = await this.findOwned(provider.id, id);
    if (signal.status !== "DRAFT") {
      throw conflict("Only draft signals can be deleted.");
    }

    await this.repository.deleteDraft(id);
  }

  analyze(provider: AuthenticatedUser, input: AnalyzeSignalInput): Promise<{ id: string }> {
    return this.jobs.enqueueAiAnalysis({
      requesterId: provider.id,
      ticker: input.ticker,
      market: input.market,
      timeframe: input.timeframe,
    });
  }

  getAnalysisStatus(provider: AuthenticatedUser, jobId: string) {
    return this.jobs.getAiAnalysisStatus(jobId, provider.id);
  }

  async announcePublishedSignal<T extends { id: string; providerId: string }>(signal: T): Promise<void> {
    const subscriberIds = await this.repository.findActiveSubscriberIds(signal.providerId);
    await Promise.all([
      this.realtime.publishToUsers(subscriberIds, "signal:new", signal),
      this.jobs.enqueueNotification({ event: "SIGNAL_PUBLISHED", signalId: signal.id, recipientIds: subscriberIds }),
    ]);
  }

  private async findOwned(providerId: string, id: string): Promise<SignalRecord> {
    const signal = await this.repository.findOwned(id, providerId);
    if (!signal) {
      throw notFound("Signal not found.");
    }

    return signal;
  }
}

function validateTradeLevels(input: {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
}): void {
  const validLong =
    input.stopLoss < input.entryPrice &&
    input.takeProfit1 > input.entryPrice &&
    input.takeProfit2 >= input.takeProfit1 &&
    input.takeProfit3 >= input.takeProfit2;
  const validShort =
    input.stopLoss > input.entryPrice &&
    input.takeProfit1 < input.entryPrice &&
    input.takeProfit2 <= input.takeProfit1 &&
    input.takeProfit3 <= input.takeProfit2;

  if ((input.direction === "LONG" && !validLong) || (input.direction === "SHORT" && !validShort)) {
    throw badRequest("Stop loss and profit targets are inconsistent with signal direction.");
  }
}
