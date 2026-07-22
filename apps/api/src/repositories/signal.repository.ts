import type { Prisma, PrismaClient } from "@alphasignal/db";
import type {
  CloseSignalInput,
  CreateSignalInput,
  SignalQueryInput,
  UpdateSignalInput,
} from "@alphasignal/shared";

export type SignalRecord = Prisma.SignalGetPayload<{ select: typeof signalSelect }>;

export class SignalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listVisible(viewerId: string, input: SignalQueryInput): Promise<{ data: SignalRecord[]; total: number }> {
    const filter: Prisma.SignalWhereInput = {
      OR: [{ status: "PUBLISHED" }, { status: "CLOSED" }, { providerId: viewerId }],
      ...(input.ticker ? { ticker: input.ticker.toUpperCase() } : {}),
      ...(input.market ? { market: input.market } : {}),
      ...(input.timeframe ? { timeframe: input.timeframe } : {}),
      ...(input.strategy ? { strategy: input.strategy } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
    };
    const skip = (input.page - 1) * input.pageSize;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.signal.findMany({
        where: filter,
        select: signalSelect,
        orderBy: { createdAt: "desc" },
        skip,
        take: input.pageSize,
      }),
      this.prisma.signal.count({ where: filter }),
    ]);

    return { data, total };
  }

  findVisible(id: string, viewerId: string): Promise<SignalRecord | null> {
    return this.prisma.signal.findFirst({
      where: {
        id,
        OR: [{ status: "PUBLISHED" }, { status: "CLOSED" }, { providerId: viewerId }],
      },
      select: signalSelect,
    });
  }

  findOwned(id: string, providerId: string): Promise<SignalRecord | null> {
    return this.prisma.signal.findFirst({
      where: { id, providerId },
      select: signalSelect,
    });
  }

  create(providerId: string, input: CreateSignalInput, publishedAt: Date | null): Promise<SignalRecord> {
    return this.prisma.signal.create({
      data: {
        providerId,
        ticker: input.ticker,
        market: input.market,
        direction: input.direction,
        entryPrice: input.entryPrice,
        stopLoss: input.stopLoss,
        takeProfit1: input.takeProfit1,
        takeProfit2: input.takeProfit2,
        takeProfit3: input.takeProfit3,
        timeframe: input.timeframe,
        strategy: input.strategy,
        confidence: input.confidence,
        rationale: input.rationale,
        keyLevels: input.keyLevels as Prisma.InputJsonValue,
        source: input.source,
        status: input.status,
        riskRewardRatio: input.riskRewardRatio,
        publishedAt,
      },
      select: signalSelect,
    });
  }

  updateEditable(id: string, input: UpdateSignalInput): Promise<SignalRecord> {
    return this.prisma.signal.update({
      where: { id },
      data: {
        ...(input.ticker !== undefined ? { ticker: input.ticker } : {}),
        ...(input.market !== undefined ? { market: input.market } : {}),
        ...(input.direction !== undefined ? { direction: input.direction } : {}),
        ...(input.entryPrice !== undefined ? { entryPrice: input.entryPrice } : {}),
        ...(input.stopLoss !== undefined ? { stopLoss: input.stopLoss } : {}),
        ...(input.takeProfit1 !== undefined ? { takeProfit1: input.takeProfit1 } : {}),
        ...(input.takeProfit2 !== undefined ? { takeProfit2: input.takeProfit2 } : {}),
        ...(input.takeProfit3 !== undefined ? { takeProfit3: input.takeProfit3 } : {}),
        ...(input.timeframe !== undefined ? { timeframe: input.timeframe } : {}),
        ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
        ...(input.keyLevels !== undefined ? { keyLevels: input.keyLevels as Prisma.InputJsonValue } : {}),
        ...(input.riskRewardRatio !== undefined ? { riskRewardRatio: input.riskRewardRatio } : {}),
        ...(input.status !== undefined
          ? { status: input.status, publishedAt: input.status === "PUBLISHED" ? new Date() : null }
          : {}),
      },
      select: signalSelect,
    });
  }

  close(id: string, input: CloseSignalInput): Promise<SignalRecord> {
    return this.prisma.signal.update({
      where: { id },
      data: {
        status: "CLOSED",
        result: input.result,
        pnlPercent: input.pnlPercent,
        closedAt: new Date(),
      },
      select: signalSelect,
    });
  }

  async deleteDraft(id: string): Promise<void> {
    await this.prisma.signal.delete({ where: { id } });
  }

  async findActiveSubscriberIds(providerId: string): Promise<string[]> {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        providerId,
        status: "ACTIVE",
        currentPeriodEnd: { gt: new Date() },
      },
      select: { subscriberId: true },
    });

    return subscriptions.map((subscription) => subscription.subscriberId);
  }
}

const signalSelect = {
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
  rationale: true,
  keyLevels: true,
  source: true,
  status: true,
  result: true,
  pnlPercent: true,
  riskRewardRatio: true,
  algoDetectionId: true,
  publishedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  provider: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      providerProfile: {
        select: {
          isVerified: true,
          winRate: true,
        },
      },
    },
  },
} as const;
