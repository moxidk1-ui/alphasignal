import { z } from "zod";
import {
  algoSignalStrategies,
  directions,
  markets,
  notificationChannels,
  plans,
  providerAlgoModes,
  signalResults,
  signalOutcomeSources,
  signalSources,
  signalStatuses,
  signalStrategies,
  subscriptionStatuses,
  timeframes,
  userRoles,
} from "./enums.js";

export const userRoleSchema = z.enum(userRoles);
export const planSchema = z.enum(plans);
export const providerAlgoModeSchema = z.enum(providerAlgoModes);
export const marketSchema = z.enum(markets);
export const directionSchema = z.enum(directions);
export const timeframeSchema = z.enum(timeframes);
export const signalStrategySchema = z.enum(signalStrategies);
export const algoSignalStrategySchema = z.enum(algoSignalStrategies);
export const signalSourceSchema = z.enum(signalSources);
export const signalStatusSchema = z.enum(signalStatuses);
export const signalResultSchema = z.enum(signalResults);
export const signalOutcomeSourceSchema = z.enum(signalOutcomeSources);
export const subscriptionStatusSchema = z.enum(subscriptionStatuses);
export const notificationChannelSchema = z.enum(notificationChannels);

export const candleSchema = z
  .object({
    time: z.number().int().nonnegative(),
    open: z.number().positive(),
    high: z.number().positive(),
    low: z.number().positive(),
    close: z.number().positive(),
    volume: z.number().nonnegative(),
  })
  .strip()
  .refine((candle) => candle.high >= Math.max(candle.open, candle.close, candle.low), {
    message: "high must be greater than or equal to open, close, and low",
  })
  .refine((candle) => candle.low <= Math.min(candle.open, candle.close, candle.high), {
    message: "low must be less than or equal to open, close, and high",
  });

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strip();

export const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(1).max(120),
  })
  .strip();

export const loginSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strip();

export const refreshSessionSchema = z
  .object({
    refreshToken: z.string().min(32).optional(),
  })
  .strip();

export const verifyEmailQuerySchema = z
  .object({
    token: z.string().min(32),
  })
  .strip();

export const oauthLoginSchema = z
  .object({
    provider: z.enum(["google"]),
    providerAccountId: z.string().min(1).max(256),
    email: z.string().email().max(254),
    name: z.string().trim().min(1).max(120),
    avatarUrl: z.string().url().max(2048).optional(),
    emailVerified: z.boolean().default(false),
  })
  .strip();

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
    emailAlertsEnabled: z.boolean().optional(),
  })
  .strip();

const tickerSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((value) => value.toUpperCase());

export const marketQuoteQuerySchema = z
  .object({
    ticker: tickerSchema,
    market: marketSchema,
  })
  .strip();

export const marketOhlcvQuerySchema = marketQuoteQuerySchema
  .extend({
    timeframe: timeframeSchema,
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  })
  .strip();

export const marketSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(64),
    market: marketSchema,
  })
  .strip();

export const createSignalSchema = z
  .object({
    ticker: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .transform((value) => value.toUpperCase()),
    market: marketSchema,
    direction: directionSchema,
    entryPrice: z.number().positive(),
    stopLoss: z.number().positive(),
    takeProfit1: z.number().positive(),
    takeProfit2: z.number().positive(),
    takeProfit3: z.number().positive(),
    timeframe: timeframeSchema,
    strategy: signalStrategySchema,
    confidence: z.number().int().min(1).max(100),
    rationale: z.string().trim().min(10).max(4000),
    keyLevels: z.record(z.unknown()).default({}),
    source: signalSourceSchema,
    status: signalStatusSchema.default("DRAFT"),
    riskRewardRatio: z.number().positive(),
  })
  .strip();

export const updateSignalSchema = createSignalSchema
  .omit({ source: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one signal field is required.",
  });

export const analyzeSignalSchema = z
  .object({
    ticker: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .transform((value) => value.toUpperCase()),
    market: marketSchema,
    timeframe: timeframeSchema,
  })
  .strip();

export const identifierParamsSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
  })
  .strip();

export const analysisJobParamsSchema = z
  .object({
    jobId: z.string().trim().min(1).max(128),
  })
  .strip();

export const signalQuerySchema = paginationQuerySchema
  .extend({
    ticker: z.string().trim().min(1).max(24).optional(),
    market: marketSchema.optional(),
    timeframe: timeframeSchema.optional(),
    strategy: signalStrategySchema.optional(),
    source: signalSourceSchema.optional(),
    status: signalStatusSchema.optional(),
    providerId: z.string().min(1).optional(),
  })
  .strip();

export const updateProviderAlgoConfigSchema = z
  .object({
    algoMode: providerAlgoModeSchema,
    patternTypes: z.array(algoSignalStrategySchema).min(1),
    markets: z.array(marketSchema).min(1),
    timeframes: z.array(timeframeSchema).min(1),
    minConfidence: z.number().int().min(1).max(100),
    autoPublish: z.boolean(),
    riskRewardMin: z.number().min(0.5).max(10),
  })
  .strip();

const aiKeyLevelsSchema = z
  .object({
    support: z.array(z.number()),
    resistance: z.array(z.number()),
    orderBlocks: z.array(
      z.object({
        price: z.number(),
        type: z.enum(["bullish", "bearish"]),
      }),
    ),
    fvg: z.array(
      z.object({
        low: z.number(),
        high: z.number(),
      }),
    ),
    liquidityLevels: z.array(z.number()),
  })
  .strip();

export const aiSignalRecommendationSchema = z
  .object({
    direction: z.enum(["LONG", "SHORT", "NEUTRAL"]),
    confidence: z.number().int().min(1).max(100),
    entryPrice: z.number().positive(),
    entryZone: z
      .object({
        low: z.number().positive(),
        high: z.number().positive(),
      })
      .strip()
      .refine((zone) => zone.low <= zone.high, "entryZone low must not exceed high"),
    stopLoss: z.number().positive(),
    takeProfit1: z.number().positive(),
    takeProfit2: z.number().positive(),
    takeProfit3: z.number().positive(),
    riskRewardRatio: z.number().positive(),
    strategy: signalStrategySchema,
    keyLevels: aiKeyLevelsSchema,
    marketStructure: z.enum(["BULLISH", "BEARISH", "RANGING"]),
    rationale: z.string().trim().min(20).max(1500),
    invalidationLevel: z.number().positive(),
    timeframeAlignment: z.string().trim().min(1).max(500),
  })
  .strip();

export const closeSignalSchema = z
  .object({
    result: signalResultSchema.exclude(["PENDING"]),
    pnlPercent: z.number().min(-100).max(10000),
  })
  .strip();

export const watchlistItemSchema = z
  .object({
    ticker: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .transform((value) => value.toUpperCase()),
    market: marketSchema,
  })
  .strip();

export const providerQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(1).max(120).optional(),
    verified: z.coerce.boolean().optional(),
  })
  .strip();

export const billingCheckoutSchema = z
  .object({
    plan: planSchema.exclude(["FREE"]),
  })
  .strip();

export const adminUsersQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(1).max(120).optional(),
    role: userRoleSchema.optional(),
    plan: planSchema.optional(),
  })
  .strip();

export const adminUpdateRoleSchema = z
  .object({
    role: userRoleSchema,
  })
  .strip();

export const notificationQuerySchema = paginationQuerySchema
  .extend({
    read: z.coerce.boolean().optional(),
  })
  .strip();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;
export type VerifyEmailQueryInput = z.infer<typeof verifyEmailQuerySchema>;
export type OAuthLoginInput = z.infer<typeof oauthLoginSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;
export type AdminUsersQueryInput = z.infer<typeof adminUsersQuerySchema>;
export type AdminUpdateRoleInput = z.infer<typeof adminUpdateRoleSchema>;
export type MarketQuoteQueryInput = z.infer<typeof marketQuoteQuerySchema>;
export type MarketOhlcvQueryInput = z.infer<typeof marketOhlcvQuerySchema>;
export type MarketSearchQueryInput = z.infer<typeof marketSearchQuerySchema>;
export type CreateSignalInput = z.infer<typeof createSignalSchema>;
export type UpdateSignalInput = z.infer<typeof updateSignalSchema>;
export type AnalyzeSignalInput = z.infer<typeof analyzeSignalSchema>;
export type IdentifierParams = z.infer<typeof identifierParamsSchema>;
export type AnalysisJobParams = z.infer<typeof analysisJobParamsSchema>;
export type AiSignalRecommendation = z.infer<typeof aiSignalRecommendationSchema>;
export type SignalQueryInput = z.infer<typeof signalQuerySchema>;
export type UpdateProviderAlgoConfigInput = z.infer<typeof updateProviderAlgoConfigSchema>;
export type CloseSignalInput = z.infer<typeof closeSignalSchema>;
export type WatchlistItemInput = z.infer<typeof watchlistItemSchema>;
export type ProviderQueryInput = z.infer<typeof providerQuerySchema>;
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;
