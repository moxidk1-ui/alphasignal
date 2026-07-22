import type {
  Direction,
  Market,
  SignalSource,
  SignalStatus,
  SignalStrategy,
  Timeframe,
} from "./enums.js";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  ticker: string;
  market: Market;
  bid?: number;
  ask?: number;
  price: number;
  changePercent?: number;
  timestamp: number;
}

export interface TickerResult {
  ticker: string;
  market: Market;
  name: string;
  exchange?: string;
  currency?: string;
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  strength: number;
}

export interface OrderBlock {
  type: "bullish" | "bearish";
  startIndex: number;
  endIndex: number;
  low: number;
  high: number;
  mitigationCount: number;
}

export interface FairValueGap {
  type: "bullish" | "bearish";
  index: number;
  low: number;
  high: number;
  midpoint: number;
  filled: boolean;
}

export interface LiquidityLevel {
  type: "equal_highs" | "equal_lows" | "swing_high" | "swing_low" | "session_high" | "session_low";
  price: number;
  touches: number;
  indices: number[];
}

export interface StructureEvent {
  direction: Direction;
  index: number;
  level: number;
}

export interface MarketStructure {
  trend: "BULLISH" | "BEARISH" | "RANGING";
  bos: StructureEvent[];
  choch: StructureEvent[];
}

export interface ComputedIndicators {
  ema9: number[];
  ema21: number[];
  ema50: number[];
  ema200: number[];
  rsi14: number[];
  macd: { macd: number; signal: number; histogram: number }[];
  atr14: number[];
  volumeSma20: number[];
  bollingerBands: { upper: number; mid: number; lower: number }[];
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  marketStructure: MarketStructure;
  liquidityLevels: LiquidityLevel[];
}

export interface KeyLevels {
  support: number[];
  resistance: number[];
  orderBlocks: { price: number; type: "bullish" | "bearish"; low?: number; high?: number }[];
  fvg: { low: number; high: number; type?: "bullish" | "bearish" }[];
  liquidityLevels: number[];
}

export interface PatternDetectionResult {
  pattern: SignalStrategy;
  confidence: number;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskRewardRatio: number;
  keyLevels: KeyLevels;
  rationale: string;
  timestamp: number;
}

export interface DetectionInput {
  candles: Candle[];
  indicators: ComputedIndicators;
  timeframe: Timeframe;
  market: Market;
  ticker: string;
  enabledPatterns: SignalStrategy[];
}

export interface SignalSummary {
  id: string;
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
  source: SignalSource;
  status: SignalStatus;
  riskRewardRatio: number;
  provider: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
    winRate?: number;
  };
  publishedAt?: string | null;
  createdAt: string;
}
