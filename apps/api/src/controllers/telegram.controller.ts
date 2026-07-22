import type { FastifyReply, FastifyRequest } from "fastify";
import type { PlanEnforcementService } from "../services/plan-enforcement.service.js";
import type { TelegramLinkService } from "../services/telegram-link.service.js";

export class TelegramController {
  constructor(
    private readonly telegramLink: TelegramLinkService,
    private readonly plans: PlanEnforcementService,
  ) {}

  createLink = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertPaidAlerts(request.auth!.user);
    const link = await this.telegramLink.createLink(request.auth!.user.id);
    await reply.code(201).send(link);
  };

  unlink = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = await this.telegramLink.unlink(request.auth!.user.id);
    request.auth!.user = user;
    await reply.code(204).send();
  };

  webhook = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers["x-telegram-bot-api-secret-token"];
    const secret = typeof header === "string" ? header : undefined;
    await this.telegramLink.handleWebhook(secret, request.body);
    await reply.code(204).send();
  };
}
