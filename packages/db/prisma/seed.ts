import { PrismaClient, SignalSource, SignalStatus, SignalStrategy } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const seedPassword = process.env.SEED_USER_PASSWORD ?? "AlphaSignalSeed!2026";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error("Refusing to seed production without ALLOW_PRODUCTION_SEED=true.");
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@alphasignal.local" },
    update: {
      name: "AlphaSignal Admin",
      role: "ADMIN",
      plan: "PROVIDER",
      emailVerified: true,
    },
    create: {
      email: "admin@alphasignal.local",
      passwordHash,
      name: "AlphaSignal Admin",
      role: "ADMIN",
      plan: "PROVIDER",
      emailVerified: true,
    },
  });

  const provider = await prisma.user.upsert({
    where: { email: "provider@alphasignal.local" },
    update: {
      name: "Northstar Signals",
      role: "PROVIDER",
      plan: "PROVIDER",
      emailVerified: true,
    },
    create: {
      email: "provider@alphasignal.local",
      passwordHash,
      name: "Northstar Signals",
      role: "PROVIDER",
      plan: "PROVIDER",
      emailVerified: true,
    },
  });

  const subscriber = await prisma.user.upsert({
    where: { email: "subscriber@alphasignal.local" },
    update: {
      name: "Retail Subscriber",
      role: "SUBSCRIBER",
      plan: "PRO",
      emailVerified: true,
    },
    create: {
      email: "subscriber@alphasignal.local",
      passwordHash,
      name: "Retail Subscriber",
      role: "SUBSCRIBER",
      plan: "PRO",
      emailVerified: true,
    },
  });

  const profile = await prisma.providerProfile.upsert({
    where: { userId: provider.id },
    update: {
      bio: "Systematic ICT, Wyckoff, and momentum research across liquid markets.",
      website: "https://alphasignal.app",
      twitterHandle: "alphasignal",
      winRate: 62.4,
      totalSignals: 118,
      avgRiskReward: 2.15,
      avgConfidence: 78.6,
      isVerified: true,
      algoMode: "APPROVAL",
    },
    create: {
      userId: provider.id,
      bio: "Systematic ICT, Wyckoff, and momentum research across liquid markets.",
      website: "https://alphasignal.app",
      twitterHandle: "alphasignal",
      winRate: 62.4,
      totalSignals: 118,
      avgRiskReward: 2.15,
      avgConfidence: 78.6,
      isVerified: true,
      algoMode: "APPROVAL",
    },
  });

  await prisma.providerAlgoConfig.upsert({
    where: { providerId: profile.id },
    update: {
      patternTypes: ["ICT_SILVER_BULLET", "ICT_TURTLE_SOUP", "WYCKOFF_SPRING"],
      markets: ["STOCKS", "CRYPTO", "FOREX"],
      timeframes: ["M5", "M15", "H1"],
      minConfidence: 75,
      autoPublish: false,
      riskRewardMin: 1.8,
    },
    create: {
      providerId: profile.id,
      patternTypes: ["ICT_SILVER_BULLET", "ICT_TURTLE_SOUP", "WYCKOFF_SPRING"],
      markets: ["STOCKS", "CRYPTO", "FOREX"],
      timeframes: ["M5", "M15", "H1"],
      minConfidence: 75,
      autoPublish: false,
      riskRewardMin: 1.8,
    },
  });

  await prisma.subscription.upsert({
    where: {
      subscriberId_providerId: {
        subscriberId: subscriber.id,
        providerId: provider.id,
      },
    },
    update: {
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    create: {
      subscriberId: subscriber.id,
      providerId: provider.id,
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.signal.create({
    data: {
      providerId: provider.id,
      ticker: "AAPL",
      market: "STOCKS",
      direction: "LONG",
      entryPrice: 190.25,
      stopLoss: 187.4,
      takeProfit1: 193.1,
      takeProfit2: 195.95,
      takeProfit3: 198.8,
      timeframe: "M15",
      strategy: SignalStrategy.ICT_LIQUIDITY_SWEEP,
      confidence: 82,
      rationale:
        "AAPL swept the prior session low and reclaimed the range with a bullish displacement candle. The setup offers defined invalidation below the sweep wick and targets the nearest opposing liquidity cluster.",
      keyLevels: {
        support: [187.4, 188.2],
        resistance: [193.1, 195.95, 198.8],
        liquidityLevels: [187.8, 198.8],
      },
      source: SignalSource.MANUAL,
      status: SignalStatus.PUBLISHED,
      publishedAt: new Date(),
      riskRewardRatio: 2,
    },
  });

  await prisma.watchlistItem.upsert({
    where: {
      userId_ticker_market: {
        userId: subscriber.id,
        ticker: "AAPL",
        market: "STOCKS",
      },
    },
    update: {},
    create: {
      userId: subscriber.id,
      ticker: "AAPL",
      market: "STOCKS",
    },
  });

  await prisma.watchlistItem.upsert({
    where: {
      userId_ticker_market: {
        userId: subscriber.id,
        ticker: "BTCUSDT",
        market: "CRYPTO",
      },
    },
    update: {},
    create: {
      userId: subscriber.id,
      ticker: "BTCUSDT",
      market: "CRYPTO",
    },
  });

  console.info(
    JSON.stringify({
      message: "Seed complete",
      users: [admin.email, provider.email, subscriber.email],
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
