import {
  identifierParamsSchema,
  updateProviderAlgoConfigSchema,
} from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AlgoService } from "../services/algo.service.js";
import type { PlanEnforcementService } from "../services/plan-enforcement.service.js";

export class AlgoController {
  constructor(
    private readonly algo: AlgoService,
    private readonly plans: PlanEnforcementService,
  ) {}

  pending = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertAlgoEngine(request.auth!.user);
    const detections = await this.algo.listPending(request.auth!.user);
    await reply.code(200).send({ detections });
  };

  approve = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertAlgoEngine(request.auth!.user);
    const { id } = identifierParamsSchema.parse(request.params);
    const signal = await this.algo.approve(request.auth!.user, id);
    await reply.code(200).send({ signal });
  };

  reject = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertAlgoEngine(request.auth!.user);
    const { id } = identifierParamsSchema.parse(request.params);
    await this.algo.reject(request.auth!.user, id);
    await reply.code(204).send();
  };

  config = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertAlgoEngine(request.auth!.user);
    const config = await this.algo.getConfig(request.auth!.user);
    await reply.code(200).send({ config });
  };

  updateConfig = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertAlgoEngine(request.auth!.user);
    const input = updateProviderAlgoConfigSchema.parse(request.body);
    const config = await this.algo.updateConfig(request.auth!.user, input);
    await reply.code(200).send({ config });
  };
}
