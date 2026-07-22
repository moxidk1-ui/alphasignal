export const userRoles = ["ADMIN", "PROVIDER", "SUBSCRIBER", "FREE_USER"] as const;
export const plans = ["FREE", "PRO", "PROVIDER"] as const;
export const providerAlgoModes = ["AUTO", "APPROVAL", "DISABLED"] as const;
export const markets = ["STOCKS", "FOREX", "CRYPTO", "FUTURES"] as const;
export const directions = ["LONG", "SHORT"] as const;
export const timeframes = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as const;
export const signalStrategies = [
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
  "AI_HYBRID",
  "MANUAL",
  "CUSTOM",
] as const;
export const algoSignalStrategies = [
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
] as const;
export const signalSources = ["ALGO", "AI_HYBRID", "MANUAL"] as const;
export const signalStatuses = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "CLOSED"] as const;
export const signalResults = ["PENDING", "WIN", "LOSS", "BREAKEVEN"] as const;
export const subscriptionStatuses = ["ACTIVE", "CANCELLED", "PAST_DUE"] as const;
export const notificationChannels = ["IN_APP", "EMAIL", "TELEGRAM"] as const;

export type UserRole = (typeof userRoles)[number];
export type Plan = (typeof plans)[number];
export type ProviderAlgoMode = (typeof providerAlgoModes)[number];
export type Market = (typeof markets)[number];
export type Direction = (typeof directions)[number];
export type Timeframe = (typeof timeframes)[number];
export type SignalStrategy = (typeof signalStrategies)[number];
export type AlgoSignalStrategy = (typeof algoSignalStrategies)[number];
export type SignalSource = (typeof signalSources)[number];
export type SignalStatus = (typeof signalStatuses)[number];
export type SignalResult = (typeof signalResults)[number];
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type NotificationChannel = (typeof notificationChannels)[number];
