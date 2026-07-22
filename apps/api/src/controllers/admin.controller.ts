import {
  adminUpdateRoleSchema,
  adminUsersQuerySchema,
  identifierParamsSchema,
  paginationQuerySchema,
} from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminService } from "../services/admin.service.js";

export class AdminController {
  constructor(private readonly admin: AdminService) {}

  users = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = adminUsersQuerySchema.parse(request.query);
    const result = await this.admin.users(input);
    await reply.code(200).send({
      data: result.data,
      pagination: pagination(input.page, input.pageSize, result.total),
    });
  };

  updateRole = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { id } = identifierParamsSchema.parse(request.params);
    await reply.code(200).send({ user: await this.admin.updateRole(id, adminUpdateRoleSchema.parse(request.body)) });
  };

  stats = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await reply.code(200).send({ stats: await this.admin.stats() });
  };

  detections = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = paginationQuerySchema.parse(request.query);
    const result = await this.admin.detections(input.page, input.pageSize);
    await reply.code(200).send({
      data: result.data,
      pagination: pagination(input.page, input.pageSize, result.total),
    });
  };
}

function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
