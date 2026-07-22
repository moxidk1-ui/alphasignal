import { describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { ResendIntegration } from "../integrations/resend.js";
import type { TelegramIntegration } from "../integrations/telegram.js";
import type {
  NotificationRecipient,
  NotificationRecord,
  NotificationRepository,
  NotificationSignal,
} from "../repositories/notification.repository.js";
import { NotificationService } from "./notification.service.js";

describe("NotificationService", () => {
  it("delivers in-app, idempotent email, and Telegram alerts for a Pro subscriber", async () => {
    const repository = repositoryMock([proRecipient]);
    const resend = { sendEmail: vi.fn().mockResolvedValue({ id: "email-1", skipped: false }) };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ skipped: false }) };
    const realtime = { publishToUser: vi.fn().mockResolvedValue(undefined), publishToUsers: vi.fn() };
    const service = serviceWith(repository, resend, telegram, realtime);

    await expect(
      service.process({ event: "SIGNAL_PUBLISHED", signalId: signal.id, recipientIds: [proRecipient.id] }),
    ).resolves.toEqual({ recipients: 1, deliveries: 3 });
    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: proRecipient.email,
        idempotencyKey: `SIGNAL_PUBLISHED:${signal.id}:${proRecipient.id}:EMAIL`,
      }),
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      proRecipient.telegramChatId,
      expect.stringContaining("New Signal - AAPL"),
    );
    expect(realtime.publishToUser).toHaveBeenCalledWith(
      proRecipient.id,
      "notification:new",
      expect.objectContaining({ channel: "IN_APP" }),
    );
  });

  it("delivers only enabled email to a free subscriber", async () => {
    const freeRecipient: NotificationRecipient = {
      ...proRecipient,
      id: "free-1",
      email: "free@example.com",
      plan: "FREE",
      telegramChatId: "chat-free",
    };
    const repository = repositoryMock([freeRecipient]);
    const resend = { sendEmail: vi.fn().mockResolvedValue({ id: "email-1", skipped: false }) };
    const telegram = { sendMessage: vi.fn() };
    const realtime = { publishToUser: vi.fn(), publishToUsers: vi.fn() };
    const service = serviceWith(repository, resend, telegram, realtime);

    await expect(
      service.process({ event: "SIGNAL_PUBLISHED", signalId: signal.id, recipientIds: [freeRecipient.id] }),
    ).resolves.toEqual({ recipients: 1, deliveries: 1 });
    expect(resend.sendEmail).toHaveBeenCalledOnce();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(realtime.publishToUser).not.toHaveBeenCalled();
  });

  it("does not deliver email when the recipient disabled email alerts", async () => {
    const optedOut = { ...proRecipient, emailAlertsEnabled: false, telegramChatId: null };
    const repository = repositoryMock([optedOut]);
    const resend = { sendEmail: vi.fn() };
    const realtime = { publishToUser: vi.fn().mockResolvedValue(undefined), publishToUsers: vi.fn() };
    const service = serviceWith(repository, resend, { sendMessage: vi.fn() }, realtime);

    await expect(
      service.process({ event: "SIGNAL_PUBLISHED", signalId: signal.id, recipientIds: [optedOut.id] }),
    ).resolves.toEqual({ recipients: 1, deliveries: 1 });
    expect(resend.sendEmail).not.toHaveBeenCalled();
    expect(realtime.publishToUser).toHaveBeenCalledOnce();
  });

  it("formats an approval alert only for the pending signal provider", async () => {
    const pending = { ...signal, status: "PENDING_APPROVAL" as const, algoDetectionId: "detect-1" };
    const repository = repositoryMock([], pending);
    vi.mocked(repository.findRecipient).mockResolvedValue(proRecipient);
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ skipped: false }) };
    const service = serviceWith(
      repository,
      { sendEmail: vi.fn().mockResolvedValue({ id: "email-1", skipped: false }) },
      telegram,
      { publishToUser: vi.fn().mockResolvedValue(undefined), publishToUsers: vi.fn() },
    );

    await service.process({ event: "ALGO_PENDING_APPROVAL", signalId: pending.id, recipientId: pending.providerId });
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      proRecipient.telegramChatId,
      expect.stringContaining("/algo/review/detect-1"),
    );
  });
});

const proRecipient: NotificationRecipient = {
  id: "subscriber-1",
  name: "Subscriber",
  email: "subscriber@example.com",
  plan: "PRO",
  emailAlertsEnabled: true,
  telegramChatId: "chat-1",
};

const signal: NotificationSignal = {
  id: "signal-1",
  providerId: "provider-1",
  ticker: "AAPL",
  market: "STOCKS",
  direction: "LONG",
  entryPrice: 100,
  stopLoss: 98,
  takeProfit1: 102,
  takeProfit2: 104,
  takeProfit3: 106,
  timeframe: "M15",
  strategy: "ICT_LIQUIDITY_SWEEP",
  confidence: 86,
  source: "ALGO",
  status: "PUBLISHED",
  result: "PENDING",
  pnlPercent: null,
  riskRewardRatio: 2,
  algoDetectionId: null,
  provider: { name: "Northstar Signals" },
};

function repositoryMock(recipients: NotificationRecipient[], selectedSignal: NotificationSignal = signal) {
  return {
    findSignal: vi.fn().mockResolvedValue(selectedSignal),
    findRecipients: vi.fn().mockResolvedValue(recipients),
    findRecipient: vi.fn(),
    getOrCreateDelivery: vi.fn().mockImplementation((input: { channel: NotificationRecord["channel"] }) =>
      Promise.resolve({
        created: true,
        record: notification(input.channel),
      }),
    ),
    markSent: vi.fn().mockImplementation((id: string) => {
      const channel = id.replace("notification-", "") as NotificationRecord["channel"];
      return Promise.resolve({ ...notification(channel), sentAt: new Date() });
    }),
  } as unknown as NotificationRepository;
}

function notification(channel: NotificationRecord["channel"]): NotificationRecord {
  return {
    id: `notification-${channel}`,
    userId: proRecipient.id,
    signalId: signal.id,
    channel,
    type: "SIGNAL_PUBLISHED",
    payload: {},
    read: false,
    sentAt: null,
    createdAt: new Date(),
  };
}

function serviceWith(
  repository: NotificationRepository,
  resend: { sendEmail: ReturnType<typeof vi.fn> },
  telegram: { sendMessage: ReturnType<typeof vi.fn> },
  realtime: { publishToUser: ReturnType<typeof vi.fn>; publishToUsers: ReturnType<typeof vi.fn> },
) {
  return new NotificationService(
    { FRONTEND_URL: "https://alphasignal.app" } as AppConfig,
    repository,
    resend as unknown as ResendIntegration,
    telegram as unknown as TelegramIntegration,
    realtime,
    { info: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger,
  );
}
