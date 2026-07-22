import { updateMeSchema } from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { unauthorized } from "../utils/errors.js";

export class UsersController {
  constructor(private readonly authService: AuthService) {}

  me = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.auth?.user) {
      throw unauthorized();
    }

    await reply.code(200).send({ user: request.auth.user });
  };

  updateMe = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.auth?.user) {
      throw unauthorized();
    }

    const input = updateMeSchema.parse(request.body);
    const user = await this.authService.updateMe(request.auth.user.id, input);
    request.auth.user = user;
    await reply.code(200).send({ user });
  };
}
