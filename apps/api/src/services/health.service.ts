import type { Redis } from "ioredis";
import type { HealthRepository } from "../repositories/health.repository.js";

export interface DependencyStatus {
  database: "up" | "down";
  redis: "up" | "down";
}

export interface HealthStatus {
  ok: boolean;
  service: "alphasignal-api";
  timestamp: string;
  dependencies: DependencyStatus;
}

export class HealthService {
  constructor(
    private readonly repository: HealthRepository,
    private readonly redis: Redis,
  ) {}

  live(): Omit<HealthStatus, "dependencies"> {
    return {
      ok: true,
      service: "alphasignal-api",
      timestamp: new Date().toISOString(),
    };
  }

  async ready(): Promise<HealthStatus> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    return {
      ok: database === "up" && redis === "up",
      service: "alphasignal-api",
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        redis,
      },
    };
  }

  private async checkDatabase(): Promise<"up" | "down"> {
    try {
      await this.repository.databaseIsReachable();
      return "up";
    } catch {
      return "down";
    }
  }

  private async checkRedis(): Promise<"up" | "down"> {
    try {
      const response = await this.redis.ping();
      return response === "PONG" ? "up" : "down";
    } catch {
      return "down";
    }
  }
}
