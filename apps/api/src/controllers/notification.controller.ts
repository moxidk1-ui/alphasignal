import {
  identifierParamsSchema,
  notificationQuerySchema,
} from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { NotificationService } from "../services/notification.service.js";
import type { PlanEnforcementService } from "../services/plan-enforcement.service.js";

export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly plans: PlanEnforcementService,
  ) {}

  list = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertPaidAlerts(request.auth!.user);
    const input = notificationQuerySchema.parse(request.query);
    const result = await this.notifications.listInApp(request.auth!.user.id, input);
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

  read = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertPaidAlerts(request.auth!.user);
    const { id } = identifierParamsSchema.parse(request.params);
    const notification = await this.notifications.markRead(request.auth!.user.id, id);
    await reply.code(200).send({ notification });
  };

  readAll = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    this.plans.assertPaidAlerts(request.auth!.user);
    const updated = await this.notifications.markAllRead(request.auth!.user.id);
    await reply.code(200).send({ updated });
  };
}
