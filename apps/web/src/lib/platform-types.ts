import type {
  AiSignalRecommendation,
  AlgoSignalStrategy,
  Candle,
  Direction,
  KeyLevels,
  Market,
  Plan,
  ProviderAlgoMode,
  Quote,
  SignalResult,
  SignalSource,
  SignalStatus,
  SignalStrategy,
  Timeframe,
} from "@alphasignal/shared";

export type { AiSignalRecommendation, Candle, Market, Plan, Quote, Timeframe };

export interface Signal {
  id: string;
  providerId: string;
  ticker: string;
  market: Market;
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  timeframe: Timeframe;
  strategy: SignalStrategy;
  confidence: number;
  rationale: string;
  keyLevels: KeyLevels | Record<string, unknown>;
  source: SignalSource;
  status: SignalStatus;
  result: SignalResult;
  pnlPercent: number | null;
  riskRewardRatio: number;
  algoDetectionId: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  provider: {
    id: string;
    name: string;
    avatarUrl: string | null;
    providerProfile: {
      isVerified: boolean;
      winRate: number;
    } | null;
  };
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface WatchlistItem {
  id: string;
  ticker: string;
  market: Market;
  addedAt: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  providerProfile: {
    bio: string;
    winRate: number;
    totalSignals: number;
    avgRiskReward: number;
    avgConfidence: number;
    isVerified: boolean;
    algoMode: ProviderAlgoMode;
    website?: string | null;
    twitterHandle?: string | null;
    createdAt?: string;
  };
  subscribers: { id: string }[];
  _count: { subscribers: number };
}

export interface ProviderAnalytics {
  totalSignals: number;
  avgConfidence: number;
  avgRiskReward: number;
  avgPnlPercent: number;
  outcomes: Partial<Record<SignalResult, number>>;
}

export interface AlgoConfig {
  id: string;
  patternTypes: AlgoSignalStrategy[];
  markets: Market[];
  timeframes: Timeframe[];
  minConfidence: number;
  autoPublish: boolean;
  riskRewardMin: number;
  provider: { userId: string; algoMode: ProviderAlgoMode };
}

export interface AlgoPendingSignal extends Omit<Signal, "provider"> {
  algoDetection: { id: string; patternData: unknown; processedAt: string } | null;
}

export interface NotificationItem {
  id: string;
  signalId: string | null;
  channel: "IN_APP";
  type: string;
  payload: {
    ticker?: string;
    market?: Market;
    direction?: Direction;
    providerName?: string;
  };
  read: boolean;
  createdAt: string;
}

export interface SubscriptionPlan {
  id: Plan;
  name: string;
  monthlyPrice: number;
  features: readonly string[];
}

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: Plan;
  emailAlertsEnabled: boolean;
  telegramChatId: string | null;
}

export interface AdminStats {
  users: number;
  providers: number;
  activeSignals: number;
  pendingDetections: number;
  plans: Partial<Record<Plan, number>>;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "PROVIDER" | "SUBSCRIBER" | "FREE_USER";
  plan: Plan;
  emailVerified: boolean;
  createdAt: string;
}

export interface AdminDetection {
  id: string;
  ticker: string;
  market: Market;
  timeframe: Timeframe;
  strategy: SignalStrategy;
  direction: Direction;
  entry: number;
  confidence: number;
  processedAt: string;
  signalId: string | null;
}
