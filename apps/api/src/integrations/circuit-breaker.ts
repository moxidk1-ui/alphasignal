import CircuitBreaker from "opossum";
import type { FastifyBaseLogger } from "fastify";
import { AppError, MarketDataError } from "../utils/errors.js";

type ExternalAction = () => Promise<unknown>;

export class ProviderCircuit {
  private readonly circuit: CircuitBreaker<[ExternalAction], unknown>;
  private failures: number[] = [];

  constructor(
    private readonly provider: string,
    logger: FastifyBaseLogger,
    private readonly unavailableError: () => AppError = () => new MarketDataError(provider),
  ) {
    this.circuit = new CircuitBreaker(async (action: ExternalAction) => action(), {
      errorThresholdPercentage: 100,
      resetTimeout: 120_000,
      rollingCountTimeout: 60_000,
      timeout: 12_000,
      volumeThreshold: Number.MAX_SAFE_INTEGER,
    });

    this.circuit.on("failure", () => {
      const now = Date.now();
      this.failures = this.failures.filter((timestamp) => now - timestamp < 60_000);
      this.failures.push(now);
      if (this.failures.length >= 3) {
        this.circuit.open();
      }
    });
    this.circuit.on("open", () => logger.warn({ provider }, "Market provider circuit opened"));
    this.circuit.on("halfOpen", () => logger.info({ provider }, "Market provider circuit testing recovery"));
    this.circuit.on("close", () => {
      this.failures = [];
      logger.info({ provider }, "Market provider circuit closed");
    });
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    try {
      return (await this.circuit.fire(action)) as T;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw this.unavailableError();
    }
  }
}
