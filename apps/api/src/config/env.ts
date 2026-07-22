import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadLocalEnv();

const nonEmptyString = z.string().trim().min(1);

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

const pemSchema = nonEmptyString.transform((value) => value.replace(/\\n/g, "\n"));
const requiredPortSchema = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : Number(value)),
  z.number({ required_error: "Required" }).int().min(1).max(65535),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: requiredPortSchema,
  LOG_LEVEL: z.enum(logLevels),
  FRONTEND_URL: z.string().url(),

  JWT_PRIVATE_KEY: pemSchema.refine((value) => value.includes("BEGIN PRIVATE KEY"), {
    message: "must be a PEM encoded PKCS8 private key",
  }),
  JWT_PUBLIC_KEY: pemSchema.refine((value) => value.includes("BEGIN PUBLIC KEY"), {
    message: "must be a PEM encoded public key",
  }),
  JWT_REFRESH_SECRET: nonEmptyString.min(32),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  ANTHROPIC_API_KEY: nonEmptyString,

  ALPACA_API_KEY: nonEmptyString,
  ALPACA_API_SECRET: nonEmptyString,
  ALPACA_BASE_URL: z.string().url(),
  ALPACA_DATA_URL: z.string().url().default("https://data.alpaca.markets"),
  ALPACA_STREAM_URL: z.string().url().default("wss://stream.data.alpaca.markets/v2/iex"),
  ALPACA_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(200),
  BINANCE_API_KEY: nonEmptyString,
  BINANCE_API_SECRET: nonEmptyString,
  BINANCE_BASE_URL: z.string().url().default("https://api.binance.com"),
  BINANCE_STREAM_URL: z.string().url().default("wss://stream.binance.com:9443/ws"),
  BINANCE_WEIGHT_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(1200),
  ALPHA_VANTAGE_API_KEY: nonEmptyString,
  ALPHA_VANTAGE_BASE_URL: z.string().url().default("https://www.alphavantage.co/query"),
  ALPHA_VANTAGE_CALLS_PER_MINUTE: z.coerce.number().int().positive().default(5),
  POLYGON_API_KEY: nonEmptyString,
  POLYGON_BASE_URL: z.string().url().default("https://api.polygon.io"),
  YAHOO_FINANCE_BASE_URL: z.string().url().default("https://query1.finance.yahoo.com"),

  STRIPE_SECRET_KEY: nonEmptyString,
  STRIPE_WEBHOOK_SECRET: nonEmptyString,
  STRIPE_PRO_PRICE_ID: nonEmptyString,
  STRIPE_PROVIDER_PRICE_ID: nonEmptyString,

  RESEND_API_KEY: nonEmptyString,
  EMAIL_FROM: nonEmptyString,

  TELEGRAM_BOT_TOKEN: nonEmptyString,
  TELEGRAM_WEBHOOK_SECRET: nonEmptyString,

  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_WS_URL: z.string().url(),

  NEXTAUTH_SECRET: nonEmptyString.min(32),
  NEXTAUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: nonEmptyString,
  GOOGLE_CLIENT_SECRET: nonEmptyString,
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issueList = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "environment";
        return `- ${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${issueList}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

function loadLocalEnv(): void {
  const start = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), ".env"),
    join(start, "../../.env"),
    join(start, "../../../.env"),
    join(start, "../../../../.env"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));

  if (path) {
    loadDotenv({ path, override: false });
  }
}
