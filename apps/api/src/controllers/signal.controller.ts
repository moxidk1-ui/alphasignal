import {
  analysisJobParamsSchema,
  analyzeSignalSchema,
  closeSignalSchema,
  createSignalSchema,
  identifierParamsSchema,
  signalQuerySchema,
  updateSignalSchema,
} from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PlanEnforcementService } from "../services/plan-enforcement.service.js";
import type { SignalService } from "../services/signal.service.js";

export class SignalController {
  constructor(
    private readonly signals: SignalService,
    private readonly plans: PlanEnforcementService,
  ) {}

  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = signalQuerySchema.parse(request.query);
    const result = await this.signals.list(request.auth!.user, input);
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

  create = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertPublisher(request.auth!.user);
    const signal = await this.signals.create(request.auth!.user, createSignalSchema.parse(request.body));
    await reply.code(201).send({ signal });
  };

  analyze = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertAiAnalysis(request.auth!.user);
    const job = await this.signals.analyze(request.auth!.user, analyzeSignalSchema.parse(request.body));
    await reply.code(202).send({ jobId: job.id, status: "WAITING" });
  };

  analysisStatus = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertAiAnalysis(request.auth!.user);
    const { jobId } = analysisJobParamsSchema.parse(request.params);
    const analysis = await this.signals.getAnalysisStatus(request.auth!.user, jobId);
    await reply.code(200).send(analysis);
  };

  get = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { id } = identifierParamsSchema.parse(request.params);
    const signal = await this.signals.get(request.auth!.user, id);
    await this.plans.assertSignalReadable(request.auth!.user, signal);
    await reply.code(200).send({ signal });
  };

  update = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertPublisher(request.auth!.user);
    const { id } = identifierParamsSchema.parse(request.params);
    const signal = await this.signals.update(request.auth!.user, id, updateSignalSchema.parse(request.body));
    await reply.code(200).send({ signal });
  };

  close = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertPublisher(request.auth!.user);
    const { id } = identifierParamsSchema.parse(request.params);
    const signal = await this.signals.close(request.auth!.user, id, closeSignalSchema.parse(request.body));
    await reply.code(200).send({ signal });
  };

  delete = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertPublisher(request.auth!.user);
    const { id } = identifierParamsSchema.parse(request.params);
    await this.signals.delete(request.auth!.user, id);
    await reply.code(204).send();
  };
}
