import { Worker } from "bullmq";
import type { ConnectionOptions, Job } from "bullmq";
import {
  createQueues,
  queueJobOptions,
  queueNames,
  scanSchedule,
} from "@alphasignal/queue";
import type {
  AiAnalysisJobData,
  AlphaSignalQueues,
  NotificationJobData,
} from "@alphasignal/queue";
import { aiSignalRecommendationSchema } from "@alphasignal/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Redis as RedisClient } from "ioredis";
import type { AppConfig } from "../config/env.js";
import type { JobPublisher } from "../services/phase5.ports.js";
import { notFound } from "../utils/errors.js";
import type { AiAnalysisProcessor } from "./ai-analysis.processor.js";
import type { AlgoScanProcessor } from "./algo-scan.processor.js";
import type { NotificationProcessor } from "./notification.processor.js";

interface ProcessorDependencies {
  scanner: AlgoScanProcessor;
  aiAnalysis: AiAnalysisProcessor;
  notifications: NotificationProcessor;
}

export class JobManager implements JobPublisher {
  private readonly connection: ConnectionOptions;
  private readonly queues: AlphaSignalQueues;
  private readonly workers: Worker<unknown, unknown, string>[] = [];
  private started = false;

  constructor(
    config: AppConfig,
    private readonly redis: RedisClient,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.connection = bullConnectionOptions(config.REDIS_URL);
    this.queues = createQueues(this.connection);
  }

  async start(dependencies: ProcessorDependencies): Promise<void> {
    if (this.started) {
      return;
    }

    for (const schedule of scanSchedule) {
      for (const timeframe of schedule.timeframes) {
        await this.queues.algoScan.upsertJobScheduler(
          `algo-scan:${timeframe}`,
          { every: schedule.every },
          {
            name: "scan-timeframe",
            data: { timeframe },
            opts: queueJobOptions.algoScan,
          },
        );
      }
    }

    const scanWorker = new Worker(
      queueNames.algoScan,
      async (job: Job<{ timeframe: Parameters<AlgoScanProcessor["process"]>[0] }>) =>
        dependencies.scanner.process(job.data.timeframe),
      { connection: this.connection, concurrency: 5 },
    );
    const aiWorker = new Worker(
      queueNames.aiAnalysis,
      async (job: Job<AiAnalysisJobData>) => dependencies.aiAnalysis.process(job.id!, job.data),
      { connection: this.connection, concurrency: 3 },
    );
    const notificationWorker = new Worker(
      queueNames.notifySubscribers,
      async (job: Job<NotificationJobData>) => dependencies.notifications.process(job.data),
      { connection: this.connection, concurrency: 10 },
    );
    this.monitorWorker(scanWorker);
    this.monitorWorker(aiWorker);
    this.monitorWorker(notificationWorker);
    this.workers.push(
      scanWorker as unknown as Worker<unknown, unknown, string>,
      aiWorker as unknown as Worker<unknown, unknown, string>,
      notificationWorker as unknown as Worker<unknown, unknown, string>,
    );
    this.started = true;
    this.logger.info("Background job processors started");
  }

  async enqueueAiAnalysis(data: AiAnalysisJobData): Promise<{ id: string }> {
    const job = await this.queues.aiAnalysis.add("analyze-signal", data, queueJobOptions.aiAnalysis);
    if (!job.id) {
      throw new Error("AI analysis queue did not assign a job identifier.");
    }

    return { id: job.id };
  }

  async getAiAnalysisStatus(jobId: string, requesterId: string) {
    const job = await this.queues.aiAnalysis.getJob(jobId);
    if (!job || job.data.requesterId !== requesterId) {
      throw notFound("AI analysis job not found.");
    }

    const state = await job.getState();
    if (state === "completed") {
      const cached = await this.redis.get(`signal:ai:${jobId}`);
      const result = cached ? parseCachedRecommendation(cached) : undefined;
      return result?.success
        ? { status: "COMPLETED" as const, result: result.data }
        : { status: "FAILED" as const, error: "Analysis result has expired." };
    }
    if (state === "failed") {
      return { status: "FAILED" as const, error: job.failedReason || "Analysis failed." };
    }
    if (state === "active") {
      return { status: "ACTIVE" as const };
    }

    return { status: "WAITING" as const };
  }

  async enqueueNotification(data: NotificationJobData): Promise<void> {
    await this.queues.notifySubscribers.add("deliver-notification", data, queueJobOptions.notifySubscribers);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all(Object.values(this.queues).map((queue) => queue.close()));
  }

  private monitorWorker(worker: Worker): void {
    worker.on("failed", (job, error) => {
      this.logger.error({ err: error, jobId: job?.id, queue: worker.name }, "Background job failed");
    });
    worker.on("error", (error) => {
      this.logger.error({ err: error, queue: worker.name }, "Background worker error");
    });
  }
}

function parseCachedRecommendation(cached: string) {
  try {
    return aiSignalRecommendationSchema.safeParse(JSON.parse(cached) as unknown);
  } catch {
    return undefined;
  }
}

function bullConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const databasePath = url.pathname.replace("/", "");
  const options = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    maxRetriesPerRequest: null,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(databasePath ? { db: Number(databasePath) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };

  return options;
}
