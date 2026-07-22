import { identifierParamsSchema, providerQuerySchema, signalQuerySchema } from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PlanEnforcementService } from "../services/plan-enforcement.service.js";
import type { ProviderService } from "../services/provider.service.js";

export class ProviderController {
  constructor(
    private readonly providers: ProviderService,
    private readonly plans: PlanEnforcementService,
  ) {}

  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = providerQuerySchema.parse(request.query);
    const result = await this.providers.list(request.auth!.user, input);
    await reply.code(200).send({
      data: result.data,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / input.pageSize),
      },
    });
  };

  get = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { id } = identifierParamsSchema.parse(request.params);
    const provider = await this.providers.get(request.auth!.user, id);
    await reply.code(200).send({ provider });
  };

  signals = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { id } = identifierParamsSchema.parse(request.params);
    const input = signalQuerySchema.parse(request.query);
    const result = await this.providers.listSignals(id, input);
    const data = await this.plans.filterSignals(request.auth!.user, result.data);
    const total = request.auth!.user.plan === "FREE" ? data.length : result.total;
    await reply.code(200).send({
      data,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    });
  };

  analytics = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { id } = identifierParamsSchema.parse(request.params);
    await reply.code(200).send({ analytics: await this.providers.analytics(id) });
  };

  subscribe = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { id } = identifierParamsSchema.parse(request.params);
    const subscription = await this.providers.subscribe(request.auth!.user, id);
    await reply.code(201).send({ subscription });
  };

  unsubscribe = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { id } = identifierParamsSchema.parse(request.params);
    await this.providers.unsubscribe(request.auth!.user, id);
    await reply.code(204).send();
  };
}
