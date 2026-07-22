import type { FastifyInstance } from "fastify";
import type { HealthController } from "../controllers/health.controller.js";

const liveResponseSchema = {
  type: "object",
  required: ["ok", "service", "timestamp"],
  properties: {
    ok: { type: "boolean" },
    service: { type: "string" },
    timestamp: { type: "string" },
  },
} as const;

const readyResponseSchema = {
  type: "object",
  required: ["ok", "service", "timestamp", "dependencies"],
  properties: {
    ok: { type: "boolean" },
    service: { type: "string" },
    timestamp: { type: "string" },
    dependencies: {
      type: "object",
      required: ["database", "redis"],
      properties: {
        database: { type: "string", enum: ["up", "down"] },
        redis: { type: "string", enum: ["up", "down"] },
      },
    },
  },
} as const;

export async function registerHealthRoutes(
  app: FastifyInstance,
  controller: HealthController,
): Promise<void> {
  app.get(
    "/health/live",
    {
      schema: {
        tags: ["health"],
        summary: "Liveness probe",
        response: {
          200: liveResponseSchema,
        },
      },
    },
    controller.live,
  );

  app.get(
    "/health/ready",
    {
      schema: {
        tags: ["health"],
        summary: "Readiness probe",
        response: {
          200: readyResponseSchema,
          503: readyResponseSchema,
        },
      },
    },
    controller.ready,
  );
}
