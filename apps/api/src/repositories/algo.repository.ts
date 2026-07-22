import type { Prisma, PrismaClient } from "@alphasignal/db";
import type {
  AlgoSignalStrategy,
  Market,
  PatternDetectionResult,
  Timeframe,
  UpdateProviderAlgoConfigInput,
} from "@alphasignal/shared";

export type ProviderConfigRecord = Prisma.ProviderAlgoConfigGetPayload<{ select: typeof providerConfigSelect }>;

export class AlgoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateConfig(userId: string): Promise<ProviderConfigRecord> {
    const profile = await this.prisma.providerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, bio: "", algoMode: "DISABLED" },
    });

    return this.prisma.providerAlgoConfig.upsert({
      where: { providerId: profile.id },
      update: {},
      create: {
        providerId: profile.id,
        patternTypes: [],
        markets: [],
        timeframes: [],
      },
      select: providerConfigSelect,
    });
  }

  async updateConfig(userId: string, input: UpdateProviderAlgoConfigInput): Promise<ProviderConfigRecord> {
    const profile = await this.prisma.providerProfile.upsert({
      where: { userId },
      update: { algoMode: input.algoMode },
      create: { userId, bio: "", algoMode: input.algoMode },
    });

    return this.prisma.providerAlgoConfig.upsert({
      where: { providerId: profile.id },
      update: {
        patternTypes: input.patternTypes,
        markets: input.markets,
        timeframes: input.timeframes,
        minConfidence: input.minConfidence,
        autoPublish: input.autoPublish,
        riskRewardMin: input.riskRewardMin,
      },
      create: {
        providerId: profile.id,
        patternTypes: input.patternTypes,
        markets: input.markets,
        timeframes: input.timeframes,
        minConfidence: input.minConfidence,
        autoPublish: input.autoPublish,
        riskRewardMin: input.riskRewardMin,
      },
      select: providerConfigSelect,
    });
  }

  findEnabledConfigs(timeframe: Timeframe): Promise<ProviderConfigRecord[]> {
    return this.prisma.providerAlgoConfig.findMany({
      where: {
        timeframes: { has: timeframe },
        provider: { algoMode: { not: "DISABLED" } },
      },
      select: providerConfigSelect,
    });
  }

  async listWatchlistSymbols(markets: Market[]): Promise<{ ticker: string; market: Market }[]> {
    const rows = await this.prisma.watchlistItem.findMany({
      where: { market: { in: markets } },
      distinct: ["ticker", "market"],
      select: { ticker: true, market: true },
    });

    return rows;
  }

  findRecentDetections(input: {
    ticker: string;
    market: Market;
    timeframe: Timeframe;
    pattern: AlgoSignalStrategy;
    direction: "LONG" | "SHORT";
  }): Promise<{ entry: number }[]> {
    return this.prisma.algoDetection.findMany({
      where: {
        ticker: input.ticker,
        market: input.market,
        timeframe: input.timeframe,
        strategy: input.pattern,
        direction: input.direction,
        processedAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) },
      },
      select: { entry: true },
    });
  }

  createDetection(input: {
    ticker: string;
    market: Market;
    timeframe: Timeframe;
    result: PatternDetectionResult;
  }): Promise<{ id: string }> {
    return this.prisma.algoDetection.create({
      data: {
        ticker: input.ticker,
        market: input.market,
        timeframe: input.timeframe,
        strategy: input.result.pattern,
        direction: input.result.direction,
        entry: input.result.entry,
        patternData: input.result as unknown as Prisma.InputJsonValue,
        confidence: input.result.confidence,
        candleTimestamp: new Date(input.result.timestamp * 1000),
      },
      select: { id: true },
    });
  }

  createDetectionSignal(input: {
    providerId: string;
    detectionId: string;
    result: PatternDetectionResult;
    ticker: string;
    market: Market;
    timeframe: Timeframe;
    status: "PUBLISHED" | "PENDING_APPROVAL";
  }) {
    return this.prisma.signal.create({
      data: {
        providerId: input.providerId,
        algoDetectionId: input.detectionId,
        ticker: input.ticker,
        market: input.market,
        timeframe: input.timeframe,
        direction: input.result.direction,
        entryPrice: input.result.entry,
        stopLoss: input.result.stopLoss,
        takeProfit1: input.result.takeProfit1,
        takeProfit2: input.result.takeProfit2,
        takeProfit3: input.result.takeProfit3,
        strategy: input.result.pattern,
        confidence: input.result.confidence,
        rationale: input.result.rationale,
        keyLevels: input.result.keyLevels as unknown as Prisma.InputJsonValue,
        source: "ALGO",
        status: input.status,
        publishedAt: input.status === "PUBLISHED" ? new Date() : null,
        riskRewardRatio: input.result.riskRewardRatio,
      },
      select: {
        id: true,
        providerId: true,
        algoDetectionId: true,
        ticker: true,
        market: true,
        timeframe: true,
        direction: true,
        entryPrice: true,
        stopLoss: true,
        takeProfit1: true,
        takeProfit2: true,
        takeProfit3: true,
        strategy: true,
        confidence: true,
        rationale: true,
        keyLevels: true,
        source: true,
        status: true,
        riskRewardRatio: true,
        publishedAt: true,
        createdAt: true,
      },
    });
  }

  listPendingSignals(providerId: string) {
    return this.prisma.signal.findMany({
      where: {
        providerId,
        status: "PENDING_APPROVAL",
        source: "ALGO",
      },
      include: { algoDetection: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findPendingSignal(detectionId: string, providerId: string) {
    return this.prisma.signal.findFirst({
      where: {
        algoDetectionId: detectionId,
        providerId,
        source: "ALGO",
        status: "PENDING_APPROVAL",
      },
    });
  }

  approveSignal(signalId: string) {
    return this.prisma.signal.update({
      where: { id: signalId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
  }

  async rejectSignal(signalId: string): Promise<void> {
    await this.prisma.signal.delete({ where: { id: signalId } });
  }
}

const providerConfigSelect = {
  id: true,
  providerId: true,
  patternTypes: true,
  markets: true,
  timeframes: true,
  minConfidence: true,
  autoPublish: true,
  riskRewardMin: true,
  createdAt: true,
  updatedAt: true,
  provider: {
    select: {
      userId: true,
      algoMode: true,
    },
  },
} as const;
