import type { NotificationJobData } from "@alphasignal/queue";
import type { NotificationChannel, NotificationQueryInput } from "@alphasignal/shared";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { ResendIntegration } from "../integrations/resend.js";
import type { TelegramIntegration } from "../integrations/telegram.js";
import type {
  NotificationRecipient,
  NotificationRepository,
  NotificationSignal,
} from "../repositories/notification.repository.js";
import { notFound } from "../utils/errors.js";
import type { RealtimePublisher } from "./phase5.ports.js";
import { renderNotificationEmail, renderTelegramMessage } from "./notification-template.service.js";

export class NotificationService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: NotificationRepository,
    private readonly resend: ResendIntegration,
    private readonly telegram: TelegramIntegration,
    private readonly realtime: RealtimePublisher,
    private readonly logger: FastifyBaseLogger,
  ) {}

  listInApp(userId: string, input: NotificationQueryInput) {
    return this.repository.listInApp(userId, input);
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.repository.markRead(userId, notificationId);
    if (!notification) {
      throw notFound("Notification not found.");
    }

    return notification;
  }

  markAllRead(userId: string): Promise<number> {
    return this.repository.markAllRead(userId);
  }

  async process(data: NotificationJobData): Promise<{ recipients: number; deliveries: number }> {
    const signal = await this.repository.findSignal(data.signalId);
    if (!signal || !canDeliver(data.event, signal)) {
      return { recipients: 0, deliveries: 0 };
    }

    const recipients = await this.resolveRecipients(data, signal);
    let deliveries = 0;
    for (const recipientBatch of chunks(recipients, 10)) {
      const results = await Promise.all(recipientBatch.map((recipient) => this.deliver(data.event, signal, recipient)));
      deliveries += results.reduce((sum, sent) => sum + sent, 0);
    }

    this.logger.info({ event: data.event, signalId: signal.id, recipients: recipients.length, deliveries }, "Notification job completed");
    return { recipients: recipients.length, deliveries };
  }

  private async resolveRecipients(data: NotificationJobData, signal: NotificationSignal): Promise<NotificationRecipient[]> {
    if (data.event === "ALGO_PENDING_APPROVAL") {
      if (data.recipientId !== signal.providerId) {
        return [];
      }
      const provider = await this.repository.findRecipient(data.recipientId);
      return provider ? [provider] : [];
    }

    return this.repository.findRecipients([...new Set(data.recipientIds)]);
  }

  private async deliver(
    event: NotificationJobData["event"],
    signal: NotificationSignal,
    recipient: NotificationRecipient,
  ): Promise<number> {
    const work: Promise<boolean>[] = [];
    if (recipient.plan !== "FREE") {
      work.push(this.deliverInApp(event, signal, recipient));
    }
    if (recipient.emailAlertsEnabled) {
      work.push(this.deliverEmail(event, signal, recipient));
    }
    if (recipient.plan !== "FREE" && recipient.telegramChatId) {
      work.push(this.deliverTelegram(event, signal, recipient, recipient.telegramChatId));
    }

    const sent = await Promise.all(work);
    return sent.filter(Boolean).length;
  }

  private async deliverInApp(
    event: NotificationJobData["event"],
    signal: NotificationSignal,
    recipient: NotificationRecipient,
  ): Promise<boolean> {
    const delivery = await this.deliveryRecord(event, signal, recipient, "IN_APP");
    if (!delivery.created) {
      return false;
    }

    const notification = await this.repository.markSent(delivery.record.id);
    try {
      await this.realtime.publishToUser(recipient.id, "notification:new", notification);
    } catch (error) {
      this.logger.warn({ err: error, notificationId: notification.id }, "In-app notification broadcast failed");
    }
    return true;
  }

  private async deliverEmail(
    event: NotificationJobData["event"],
    signal: NotificationSignal,
    recipient: NotificationRecipient,
  ): Promise<boolean> {
    const delivery = await this.deliveryRecord(event, signal, recipient, "EMAIL");
    if (delivery.record.sentAt) {
      return false;
    }

    const email = renderNotificationEmail(event, signal, recipient, this.config.FRONTEND_URL);
    await this.resend.sendEmail({
      to: recipient.email,
      ...email,
      idempotencyKey: deliveryKey(event, signal.id, recipient.id, "EMAIL"),
    });
    await this.repository.markSent(delivery.record.id);
    return true;
  }

  private async deliverTelegram(
    event: NotificationJobData["event"],
    signal: NotificationSignal,
    recipient: NotificationRecipient,
    chatId: string,
  ): Promise<boolean> {
    const delivery = await this.deliveryRecord(event, signal, recipient, "TELEGRAM");
    if (delivery.record.sentAt) {
      return false;
    }

    await this.telegram.sendMessage(chatId, renderTelegramMessage(event, signal, this.config.FRONTEND_URL));
    await this.repository.markSent(delivery.record.id);
    return true;
  }

  private deliveryRecord(
    event: NotificationJobData["event"],
    signal: NotificationSignal,
    recipient: NotificationRecipient,
    channel: NotificationChannel,
  ) {
    return this.repository.getOrCreateDelivery({
      dedupeKey: deliveryKey(event, signal.id, recipient.id, channel),
      userId: recipient.id,
      signalId: signal.id,
      channel,
      type: event,
      payload: notificationPayload(event, signal),
    });
  }
}

function deliveryKey(
  event: NotificationJobData["event"],
  signalId: string,
  userId: string,
  channel: NotificationChannel,
): string {
  return `${event}:${signalId}:${userId}:${channel}`;
}

function notificationPayload(event: NotificationJobData["event"], signal: NotificationSignal) {
  return {
    event,
    signalId: signal.id,
    ticker: signal.ticker,
    market: signal.market,
    timeframe: signal.timeframe,
    direction: signal.direction,
    strategy: signal.strategy,
    confidence: signal.confidence,
    status: signal.status,
    result: signal.result,
    pnlPercent: signal.pnlPercent,
    providerName: signal.provider.name,
  };
}

function canDeliver(event: NotificationJobData["event"], signal: NotificationSignal): boolean {
  if (event === "ALGO_PENDING_APPROVAL") {
    return signal.status === "PENDING_APPROVAL";
  }
  if (event === "SIGNAL_CLOSED") {
    return signal.status === "CLOSED";
  }
  return signal.status === "PUBLISHED" || signal.status === "CLOSED";
}

function chunks<T>(values: T[], chunkSize: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    batches.push(values.slice(index, index + chunkSize));
  }
  return batches;
}
