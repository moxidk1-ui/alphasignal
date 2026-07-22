import type { Prisma, PrismaClient } from "@alphasignal/db";
import type { NotificationChannel, Plan } from "@alphasignal/shared";

export type NotificationSignal = Prisma.SignalGetPayload<{ select: typeof deliverySignalSelect }>;
export type NotificationRecord = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

export interface NotificationRecipient {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  emailAlertsEnabled: boolean;
  telegramChatId: string | null;
}

export class NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findSignal(signalId: string): Promise<NotificationSignal | null> {
    return this.prisma.signal.findUnique({
      where: { id: signalId },
      select: deliverySignalSelect,
    });
  }

  findRecipient(userId: string): Promise<NotificationRecipient | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: recipientSelect,
    });
  }

  findRecipients(userIds: string[]): Promise<NotificationRecipient[]> {
    return this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: recipientSelect,
    });
  }

  async getOrCreateDelivery(input: {
    dedupeKey: string;
    userId: string;
    signalId: string;
    channel: NotificationChannel;
    type: string;
    payload: Prisma.InputJsonValue;
  }): Promise<{ record: NotificationRecord; created: boolean }> {
    try {
      const record = await this.prisma.notification.create({
        data: input,
        select: notificationSelect,
      });
      return { record, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const record = await this.prisma.notification.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: notificationSelect,
      });
      if (!record) {
        throw error;
      }

      return { record, created: false };
    }
  }

  markSent(notificationId: string): Promise<NotificationRecord> {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { sentAt: new Date() },
      select: notificationSelect,
    });
  }

  async listInApp(userId: string, input: { page: number; pageSize: number; read?: boolean | undefined }) {
    const where = {
      userId,
      channel: "IN_APP" as const,
      ...(input.read !== undefined ? { read: input.read } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, total };
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationRecord | null> {
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, channel: "IN_APP" },
      data: { read: true },
    });
    if (updated.count === 0) {
      return null;
    }

    return this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: notificationSelect,
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, channel: "IN_APP", read: false },
      data: { read: true },
    });

    return result.count;
  }
}

const recipientSelect = {
  id: true,
  name: true,
  email: true,
  plan: true,
  emailAlertsEnabled: true,
  telegramChatId: true,
} as const;

const deliverySignalSelect = {
  id: true,
  providerId: true,
  ticker: true,
  market: true,
  direction: true,
  entryPrice: true,
  stopLoss: true,
  takeProfit1: true,
  takeProfit2: true,
  takeProfit3: true,
  timeframe: true,
  strategy: true,
  confidence: true,
  source: true,
  status: true,
  result: true,
  pnlPercent: true,
  riskRewardRatio: true,
  algoDetectionId: true,
  provider: {
    select: {
      name: true,
    },
  },
} as const;

const notificationSelect = {
  id: true,
  userId: true,
  signalId: true,
  channel: true,
  type: true,
  payload: true,
  read: true,
  sentAt: true,
  createdAt: true,
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
