import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { AppConfig } from "../config/env.js";
import { MarketDataError } from "../utils/errors.js";

export class ExternalQuotaTracker {
  constructor(
    private readonly redis: Redis,
    private readonly config: AppConfig,
    private readonly logger: FastifyBaseLogger,
  ) {}

  trackAlpaca(weight = 1): Promise<void> {
    return this.consume("alpaca", weight, Math.floor(this.config.ALPACA_RATE_LIMIT_PER_MINUTE * 0.8), 60);
  }

  trackBinance(weight: number): Promise<void> {
    return this.consume("binance", weight, Math.floor(this.config.BINANCE_WEIGHT_LIMIT_PER_MINUTE * 0.8), 60);
  }

  trackAlphaVantage(): Promise<void> {
    return this.consume("alpha-vantage", 1, this.config.ALPHA_VANTAGE_CALLS_PER_MINUTE, 60);
  }

  trackAnthropic(): Promise<void> {
    return this.consume("anthropic", 1, 50, 3600);
  }

  private async consume(provider: string, amount: number, limit: number, windowSeconds: number): Promise<void> {
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `quota:${provider}:${bucket}`;

    try {
      const results = await this.redis
        .multi()
        .incrby(key, amount)
        .expire(key, windowSeconds + 5)
        .exec();
      const count = Number(results?.[0]?.[1] ?? limit + 1);

      if (count > limit) {
        this.logger.warn({ provider, count, limit }, "External API quota backoff active");
        throw new MarketDataError(provider, "Market data provider quota is temporarily exhausted.");
      }
    } catch (error) {
      if (error instanceof MarketDataError) {
        throw error;
      }

      throw new MarketDataError(provider, "Market data quota tracking is unavailable.");
    }
  }
}
