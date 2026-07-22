CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROVIDER', 'SUBSCRIBER', 'FREE_USER');
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'PROVIDER');
CREATE TYPE "ProviderAlgoMode" AS ENUM ('AUTO', 'APPROVAL', 'DISABLED');
CREATE TYPE "Market" AS ENUM ('STOCKS', 'FOREX', 'CRYPTO', 'FUTURES');
CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT');
CREATE TYPE "Timeframe" AS ENUM ('M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1');
CREATE TYPE "SignalStrategy" AS ENUM ('ICT_SILVER_BULLET', 'ICT_TURTLE_SOUP', 'ICT_OB_FVG', 'ICT_BOS_CHOCH', 'ICT_LIQUIDITY_SWEEP', 'WYCKOFF_SPRING', 'WYCKOFF_UPTHRUST', 'WYCKOFF_ACCUMULATION', 'WYCKOFF_DISTRIBUTION', 'MOMENTUM_EMA_CROSS', 'MOMENTUM_RSI_DIV', 'MOMENTUM_MACD', 'PA_BREAKER_BLOCK', 'PA_SUPPLY_DEMAND', 'PA_DOUBLE_TOP_BOTTOM', 'AI_HYBRID', 'MANUAL', 'CUSTOM');
CREATE TYPE "SignalSource" AS ENUM ('ALGO', 'AI_HYBRID', 'MANUAL');
CREATE TYPE "SignalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'CLOSED');
CREATE TYPE "SignalResult" AS ENUM ('PENDING', 'WIN', 'LOSS', 'BREAKEVEN');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'TELEGRAM');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'FREE_USER',
  "plan" "Plan" NOT NULL DEFAULT 'FREE',
  "stripeCustomerId" TEXT,
  "stripeSubId" TEXT,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "telegramChatId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bio" TEXT NOT NULL,
  "website" TEXT,
  "twitterHandle" TEXT,
  "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalSignals" INTEGER NOT NULL DEFAULT 0,
  "avgRiskReward" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avgConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "algoMode" "ProviderAlgoMode" NOT NULL DEFAULT 'DISABLED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderAlgoConfig" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "patternTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "markets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "timeframes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "minConfidence" INTEGER NOT NULL DEFAULT 70,
  "autoPublish" BOOLEAN NOT NULL DEFAULT false,
  "riskRewardMin" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderAlgoConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Signal" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "market" "Market" NOT NULL,
  "direction" "Direction" NOT NULL,
  "entryPrice" DOUBLE PRECISION NOT NULL,
  "stopLoss" DOUBLE PRECISION NOT NULL,
  "takeProfit1" DOUBLE PRECISION NOT NULL,
  "takeProfit2" DOUBLE PRECISION NOT NULL,
  "takeProfit3" DOUBLE PRECISION NOT NULL,
  "timeframe" "Timeframe" NOT NULL,
  "strategy" "SignalStrategy" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "rationale" TEXT NOT NULL,
  "keyLevels" JSONB NOT NULL,
  "source" "SignalSource" NOT NULL,
  "status" "SignalStatus" NOT NULL DEFAULT 'DRAFT',
  "result" "SignalResult" NOT NULL DEFAULT 'PENDING',
  "pnlPercent" DOUBLE PRECISION,
  "riskRewardRatio" DOUBLE PRECISION NOT NULL,
  "algoDetectionId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlgoDetection" (
  "id" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "market" "Market" NOT NULL,
  "timeframe" "Timeframe" NOT NULL,
  "strategy" "SignalStrategy" NOT NULL,
  "direction" "Direction" NOT NULL,
  "entry" DOUBLE PRECISION NOT NULL,
  "patternData" JSONB NOT NULL,
  "confidence" INTEGER NOT NULL,
  "candleTimestamp" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signalId" TEXT,
  CONSTRAINT "AlgoDetection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "subscriberId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "stripeSubId" TEXT,
  "plan" "Plan" NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "signalId" TEXT,
  "channel" "NotificationChannel" NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WatchlistItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "market" "Market" NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiRateLimit" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_stripeSubId_key" ON "User"("stripeSubId");
CREATE INDEX "User_role_plan_idx" ON "User"("role", "plan");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

CREATE UNIQUE INDEX "ProviderProfile_userId_key" ON "ProviderProfile"("userId");
CREATE INDEX "ProviderProfile_isVerified_idx" ON "ProviderProfile"("isVerified");
CREATE INDEX "ProviderProfile_algoMode_idx" ON "ProviderProfile"("algoMode");

CREATE UNIQUE INDEX "ProviderAlgoConfig_providerId_key" ON "ProviderAlgoConfig"("providerId");

CREATE UNIQUE INDEX "Signal_algoDetectionId_key" ON "Signal"("algoDetectionId");
CREATE INDEX "Signal_providerId_status_createdAt_idx" ON "Signal"("providerId", "status", "createdAt");
CREATE INDEX "Signal_ticker_market_timeframe_idx" ON "Signal"("ticker", "market", "timeframe");
CREATE INDEX "Signal_strategy_source_idx" ON "Signal"("strategy", "source");
CREATE INDEX "Signal_publishedAt_idx" ON "Signal"("publishedAt");

CREATE UNIQUE INDEX "AlgoDetection_signalId_key" ON "AlgoDetection"("signalId");
CREATE INDEX "AlgoDetection_ticker_market_timeframe_strategy_direction_processedAt_idx" ON "AlgoDetection"("ticker", "market", "timeframe", "strategy", "direction", "processedAt");
CREATE INDEX "AlgoDetection_confidence_idx" ON "AlgoDetection"("confidence");

CREATE UNIQUE INDEX "Subscription_stripeSubId_key" ON "Subscription"("stripeSubId");
CREATE UNIQUE INDEX "Subscription_subscriberId_providerId_key" ON "Subscription"("subscriberId", "providerId");
CREATE INDEX "Subscription_providerId_status_idx" ON "Subscription"("providerId", "status");
CREATE INDEX "Subscription_subscriberId_status_idx" ON "Subscription"("subscriberId", "status");

CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");
CREATE INDEX "Notification_signalId_idx" ON "Notification"("signalId");

CREATE UNIQUE INDEX "WatchlistItem_userId_ticker_market_key" ON "WatchlistItem"("userId", "ticker", "market");
CREATE INDEX "WatchlistItem_ticker_market_idx" ON "WatchlistItem"("ticker", "market");

CREATE UNIQUE INDEX "ApiRateLimit_key_key" ON "ApiRateLimit"("key");
CREATE INDEX "ApiRateLimit_windowStart_idx" ON "ApiRateLimit"("windowStart");

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");
CREATE INDEX "RefreshToken_revokedAt_idx" ON "RefreshToken"("revokedAt");

ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderAlgoConfig" ADD CONSTRAINT "ProviderAlgoConfig_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_algoDetectionId_fkey" FOREIGN KEY ("algoDetectionId") REFERENCES "AlgoDetection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AlgoDetection" ADD CONSTRAINT "AlgoDetection_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
