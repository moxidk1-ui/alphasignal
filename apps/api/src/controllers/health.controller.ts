import type { FastifyReply, FastifyRequest } from "fastify";
import type { HealthService } from "../services/health.service.js";

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  live = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await reply.code(200).send(this.healthService.live());
  };

  ready = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const status = await this.healthService.ready();
    await reply.code(status.ok ? 200 : 503).send(status);
  };
}
