import { describe, expect, it, vi } from "vitest";
import type { CreateSignalInput } from "@alphasignal/shared";
import type { SignalRepository, SignalRecord } from "../repositories/signal.repository.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { SignalService } from "./signal.service.js";

describe("SignalService", () => {
  it("publishes a newly created provider signal to active subscribers and the notification queue", async () => {
    const signal = record({ status: "PUBLISHED" });
    const repository = repositoryMock({
      create: vi.fn().mockResolvedValue(signal),
      findActiveSubscriberIds: vi.fn().mockResolvedValue(["subscriber-1"]),
    });
    const jobs = {
      enqueueNotification: vi.fn().mockResolvedValue(undefined),
      enqueueAnalyticsRefresh: vi.fn().mockResolvedValue(undefined),
      enqueueAiAnalysis: vi.fn(),
      getAiAnalysisStatus: vi.fn(),
    };
    const realtime = {
      publishToUser: vi.fn(),
      publishToUsers: vi.fn().mockResolvedValue(undefined),
    };
    const service = new SignalService(repository, jobs, realtime);

    await expect(service.create(provider, createInput("PUBLISHED"))).resolves.toEqual(signal);
    expect(realtime.publishToUsers).toHaveBeenCalledWith(["subscriber-1"], "signal:new", signal);
    expect(jobs.enqueueNotification).toHaveBeenCalledWith({
      event: "SIGNAL_PUBLISHED",
      signalId: signal.id,
      recipientIds: ["subscriber-1"],
    });
  });

  it("publishes a saved draft when its provider transitions it to published", async () => {
    const draft = record({ status: "DRAFT" });
    const published = record({ status: "PUBLISHED" });
    const repository = repositoryMock({
      findOwned: vi.fn().mockResolvedValue(draft),
      updateEditable: vi.fn().mockResolvedValue(published),
      findActiveSubscriberIds: vi.fn().mockResolvedValue([]),
    });
    const jobs = {
      enqueueNotification: vi.fn().mockResolvedValue(undefined),
      enqueueAnalyticsRefresh: vi.fn().mockResolvedValue(undefined),
      enqueueAiAnalysis: vi.fn(),
      getAiAnalysisStatus: vi.fn(),
    };
    const realtime = {
      publishToUser: vi.fn(),
      publishToUsers: vi.fn().mockResolvedValue(undefined),
    };
    const service = new SignalService(repository, jobs, realtime);

    await service.update(provider, draft.id, { status: "PUBLISHED" });
    expect(repository.updateEditable).toHaveBeenCalledWith(draft.id, { status: "PUBLISHED" });
    expect(jobs.enqueueNotification).toHaveBeenCalledWith({
      event: "SIGNAL_PUBLISHED",
      signalId: published.id,
      recipientIds: [],
    });
  });

  it("rejects trade levels that conflict with the stated direction", async () => {
    const service = new SignalService(
      repositoryMock(),
      {
        enqueueNotification: vi.fn(),
        enqueueAnalyticsRefresh: vi.fn(),
        enqueueAiAnalysis: vi.fn(),
        getAiAnalysisStatus: vi.fn(),
      },
      { publishToUser: vi.fn(), publishToUsers: vi.fn() },
    );

    await expect(
      service.create(provider, { ...createInput("DRAFT"), direction: "LONG", stopLoss: 105 }),
    ).rejects.toThrow("Stop loss and profit targets are inconsistent");
  });

  it("allows a pending algo detection to be edited and published without duplicating its signal", async () => {
    const pending = record({
      status: "PENDING_APPROVAL",
      source: "ALGO",
      algoDetectionId: "detection-1",
    });
    const published = record({
      status: "PUBLISHED",
      source: "ALGO",
      algoDetectionId: "detection-1",
    });
    const repository = repositoryMock({
      findOwned: vi.fn().mockResolvedValue(pending),
      updateEditable: vi.fn().mockResolvedValue(published),
      findActiveSubscriberIds: vi.fn().mockResolvedValue(["subscriber-1"]),
    });
    const jobs = {
      enqueueNotification: vi.fn(),
      enqueueAnalyticsRefresh: vi.fn(),
      enqueueAiAnalysis: vi.fn(),
      getAiAnalysisStatus: vi.fn(),
    };
    const realtime = { publishToUser: vi.fn(), publishToUsers: vi.fn() };
    const service = new SignalService(repository, jobs, realtime);

    await service.update(provider, pending.id, { entryPrice: 100.5, status: "PUBLISHED" });

    expect(repository.updateEditable).toHaveBeenCalledWith(pending.id, {
      entryPrice: 100.5,
      status: "PUBLISHED",
    });
    expect(jobs.enqueueNotification).toHaveBeenCalledWith({
      event: "SIGNAL_PUBLISHED",
      signalId: published.id,
      recipientIds: ["subscriber-1"],
    });
  });
});

const provider: AuthenticatedUser = {
  id: "provider-1",
  email: "provider@example.com",
  name: "Provider",
  avatarUrl: null,
  role: "PROVIDER",
  plan: "PROVIDER",
  emailVerified: true,
  emailAlertsEnabled: true,
  telegramChatId: null,
};

function createInput(status: "DRAFT" | "PUBLISHED"): CreateSignalInput {
  return {
    ticker: "AAPL",
    market: "STOCKS",
    direction: "LONG",
    entryPrice: 100,
    stopLoss: 98,
    takeProfit1: 102,
    takeProfit2: 104,
    takeProfit3: 106,
    timeframe: "M15",
    strategy: "MANUAL",
    confidence: 70,
    rationale: "The setup has a confirmed break and defined invalidation.",
    keyLevels: {},
    source: "MANUAL",
    status,
    riskRewardRatio: 2,
  };
}

function record(overrides: Partial<SignalRecord>): SignalRecord {
  return {
    id: "signal-1",
    providerId: provider.id,
    ticker: "AAPL",
    market: "STOCKS",
    direction: "LONG",
    entryPrice: 100,
    stopLoss: 98,
    takeProfit1: 102,
    takeProfit2: 104,
    takeProfit3: 106,
    timeframe: "M15",
    strategy: "MANUAL",
    confidence: 70,
    rationale: "The setup has a confirmed break and defined invalidation.",
    keyLevels: {},
    source: "MANUAL",
    status: "DRAFT",
    result: "PENDING",
    pnlPercent: null,
    outcomeSource: null,
    outcomePrice: null,
    outcomeObservedAt: null,
    riskRewardRatio: 2,
    algoDetectionId: null,
    publishedAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    provider: {
      id: provider.id,
      name: provider.name,
      avatarUrl: null,
      providerProfile: null,
    },
    ...overrides,
  };
}

function repositoryMock(overrides: Partial<SignalRepository> = {}): SignalRepository {
  return {
    listVisible: vi.fn(),
    findVisible: vi.fn(),
    findOwned: vi.fn(),
    create: vi.fn(),
    updateEditable: vi.fn(),
    close: vi.fn(),
    closeFromMarket: vi.fn(),
    listPublishedForLifecycle: vi.fn(),
    deleteDraft: vi.fn(),
    findActiveSubscriberIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as SignalRepository;
}
