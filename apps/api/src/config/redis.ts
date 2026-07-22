import { Redis } from "ioredis";
import type { AppConfig } from "./env.js";

let redisClient: Redis | undefined;

export function getRedisClient(config: Pick<AppConfig, "REDIS_URL">): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.REDIS_URL, {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (attempt: number) => Math.min(attempt * 100, 2000),
    });
  }

  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (!redisClient) {
    return;
  }

  await redisClient.quit();
  redisClient = undefined;
}
