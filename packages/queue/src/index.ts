import { Queue } from "bullmq";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import type { Market, SignalStrategy, Timeframe } from "@alphasignal/shared";

export const queueNames = {
  algoScan: "algo-scan",
  aiAnalysis: "ai-analysis",
  notifySubscribers: "notify-subs",
  analyticsRefresh: "analytics-refresh",
  marketWarmup: "market-warmup",
} as const;

export interface AlgoScanJobData {
  timeframe: Timeframe;
}

export interface AiAnalysisJobData {
  requesterId: string;
  ticker: string;
  market: Market;
  timeframe: Timeframe;
}

export type NotificationJobData =
  | {
      event: "SIGNAL_PUBLISHED" | "SIGNAL_CLOSED";
      signalId: string;
      recipientIds: string[];
    }
  | {
      event: "ALGO_PENDING_APPROVAL";
      signalId: string;
      recipientId: string;
    };

export interface AnalyticsRefreshJobData {
  providerId?: string;
}

export interface MarketWarmupJobData {
  markets?: Market[];
}

export interface AlphaSignalQueues {
  algoScan: Queue<AlgoScanJobData>;
  aiAnalysis: Queue<AiAnalysisJobData>;
  notifySubscribers: Queue<NotificationJobData>;
  analyticsRefresh: Queue<AnalyticsRefreshJobData>;
  marketWarmup: Queue<MarketWarmupJobData>;
}

export const queueJobOptions = {
  algoScan: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 500,
    removeOnFail: 1_000,
  },
  aiAnalysis: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 500,
    removeOnFail: 1_000,
  },
  notifySubscribers: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1_000,
    removeOnFail: 1_000,
  },
} satisfies Record<"algoScan" | "aiAnalysis" | "notifySubscribers", JobsOptions>;

export const scanSchedule: readonly { id: string; every: number; timeframes: Timeframe[] }[] = [
  { id: "m1-m5", every: 60_000, timeframes: ["M1", "M5"] },
  { id: "m15-m30", every: 5 * 60_000, timeframes: ["M15", "M30"] },
  { id: "h1", every: 15 * 60_000, timeframes: ["H1"] },
  { id: "h4", every: 30 * 60_000, timeframes: ["H4"] },
  { id: "d1-w1", every: 4 * 60 * 60_000, timeframes: ["D1", "W1"] },
];

export const supportedAlgoPatterns: SignalStrategy[] = [
  "ICT_SILVER_BULLET",
  "ICT_TURTLE_SOUP",
  "ICT_OB_FVG",
  "ICT_BOS_CHOCH",
  "ICT_LIQUIDITY_SWEEP",
  "WYCKOFF_SPRING",
  "WYCKOFF_UPTHRUST",
  "WYCKOFF_ACCUMULATION",
  "WYCKOFF_DISTRIBUTION",
  "MOMENTUM_EMA_CROSS",
  "MOMENTUM_RSI_DIV",
  "MOMENTUM_MACD",
  "PA_BREAKER_BLOCK",
  "PA_SUPPLY_DEMAND",
  "PA_DOUBLE_TOP_BOTTOM",
];

export function createQueues(connection: ConnectionOptions): AlphaSignalQueues {
  return {
    algoScan: new Queue<AlgoScanJobData>(queueNames.algoScan, { connection }),
    aiAnalysis: new Queue<AiAnalysisJobData>(queueNames.aiAnalysis, { connection }),
    notifySubscribers: new Queue<NotificationJobData>(queueNames.notifySubscribers, { connection }),
    analyticsRefresh: new Queue<AnalyticsRefreshJobData>(queueNames.analyticsRefresh, { connection }),
    marketWarmup: new Queue<MarketWarmupJobData>(queueNames.marketWarmup, { connection }),
  };
}
