import type { Prisma, PrismaClient } from "@alphasignal/db";
import type { Plan, ProviderQueryInput, SignalQueryInput } from "@alphasignal/shared";

export type ProviderSummaryRecord = Prisma.UserGetPayload<{ select: typeof providerSummarySelect }>;
export type ProviderDetailRecord = Prisma.UserGetPayload<{ select: typeof providerDetailSelect }>;

export class ProviderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(viewerId: string, input: ProviderQueryInput): Promise<{ data: ProviderSummaryRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      providerProfile: {
        is: {
          ...(input.verified !== undefined ? { isVerified: input.verified } : {}),
        },
      },
      ...(input.q
        ? {
            OR: [
              { name: { contains: input.q, mode: "insensitive" } },
              { providerProfile: { is: { bio: { contains: input.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const select = providerSummaryForViewer(viewerId);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select,
        orderBy: [
          { providerProfile: { isVerified: "desc" } },
          { providerProfile: { winRate: "desc" } },
          { name: "asc" },
        ],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total };
  }

  findById(providerId: string, viewerId: string): Promise<ProviderDetailRecord | null> {
    return this.prisma.user.findFirst({
      where: { id: providerId, providerProfile: { isNot: null } },
      select: providerDetailForViewer(viewerId),
    });
  }

  async listSignals(providerId: string, input: SignalQueryInput) {
    const where: Prisma.SignalWhereInput = {
      providerId,
      status: { in: ["PUBLISHED", "CLOSED"] },
      ...(input.ticker ? { ticker: input.ticker.toUpperCase() } : {}),
      ...(input.market ? { market: input.market } : {}),
      ...(input.timeframe ? { timeframe: input.timeframe } : {}),
      ...(input.strategy ? { strategy: input.strategy } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.status && ["PUBLISHED", "CLOSED"].includes(input.status) ? { status: input.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.signal.findMany({
        where,
        select: providerSignalSelect,
        orderBy: { publishedAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.signal.count({ where }),
    ]);

    return { data, total };
  }

  async analytics(providerId: string) {
    const [published, outcomes] = await Promise.all([
      this.prisma.signal.aggregate({
        where: { providerId, status: { in: ["PUBLISHED", "CLOSED"] } },
        _count: { _all: true },
        _avg: { confidence: true, riskRewardRatio: true, pnlPercent: true },
      }),
      this.prisma.signal.groupBy({
        by: ["result"],
        where: { providerId, status: "CLOSED" },
        orderBy: { result: "asc" },
        _count: { result: true },
      }),
    ]);

    return {
      totalSignals: published._count._all,
      avgConfidence: published._avg.confidence ?? 0,
      avgRiskReward: published._avg.riskRewardRatio ?? 0,
      avgPnlPercent: published._avg.pnlPercent ?? 0,
      outcomes: Object.fromEntries(outcomes.map((outcome) => [outcome.result, outcome._count.result])),
    };
  }

  activeSubscriptionCount(subscriberId: string): Promise<number> {
    return this.prisma.subscription.count({
      where: { subscriberId, status: "ACTIVE", currentPeriodEnd: { gt: new Date() } },
    });
  }

  async subscribe(subscriberId: string, providerId: string, plan: Plan) {
    return this.prisma.subscription.upsert({
      where: { subscriberId_providerId: { subscriberId, providerId } },
      update: {
        plan,
        status: "ACTIVE",
        currentPeriodEnd: nextAccessPeriod(),
      },
      create: {
        subscriberId,
        providerId,
        plan,
        status: "ACTIVE",
        currentPeriodEnd: nextAccessPeriod(),
      },
      select: subscriptionSelect,
    });
  }

  async unsubscribe(subscriberId: string, providerId: string): Promise<boolean> {
    const result = await this.prisma.subscription.updateMany({
      where: { subscriberId, providerId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });

    return result.count > 0;
  }
}

const providerProfileSummarySelect = {
  bio: true,
  winRate: true,
  totalSignals: true,
  avgRiskReward: true,
  avgConfidence: true,
  isVerified: true,
  algoMode: true,
} as const;

const providerSummarySelect = {
  id: true,
  name: true,
  avatarUrl: true,
  providerProfile: { select: providerProfileSummarySelect },
  _count: {
    select: {
      subscribers: { where: { status: "ACTIVE", currentPeriodEnd: { gt: new Date() } } },
    },
  },
} as const;

const providerDetailSelect = {
  ...providerSummarySelect,
  providerProfile: {
    select: {
      ...providerProfileSummarySelect,
      website: true,
      twitterHandle: true,
      createdAt: true,
    },
  },
} as const;

function providerSummaryForViewer(viewerId: string) {
  return {
    ...providerSummarySelect,
    subscribers: {
      where: { subscriberId: viewerId, status: "ACTIVE", currentPeriodEnd: { gt: new Date() } },
      select: { id: true },
      take: 1,
    },
  } as const;
}

function providerDetailForViewer(viewerId: string) {
  return {
    ...providerDetailSelect,
    subscribers: {
      where: { subscriberId: viewerId, status: "ACTIVE", currentPeriodEnd: { gt: new Date() } },
      select: { id: true },
      take: 1,
    },
  } as const;
}

const providerSignalSelect = {
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

const subscriptionSelect = {
  id: true,
  providerId: true,
  status: true,
  currentPeriodEnd: true,
} as const;

function nextAccessPeriod(): Date {
  return new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
}
