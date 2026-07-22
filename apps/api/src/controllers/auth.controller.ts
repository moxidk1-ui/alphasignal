import {
  loginSchema,
  oauthLoginSchema,
  refreshSessionSchema,
  registerSchema,
  verifyEmailQuerySchema,
} from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { AuthService } from "../services/auth.service.js";
import type { AuthSession } from "../types/auth.js";
import {
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  isInternalWebRequest,
  setRefreshCookie,
} from "../utils/http.js";

export class AuthController {
  constructor(
    private readonly config: AppConfig,
    private readonly authService: AuthService,
  ) {}

  register = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = registerSchema.parse(request.body);
    const session = await this.authService.register(input);
    await this.sendSession(request, reply, session, 201);
  };

  login = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = loginSchema.parse(request.body);
    const session = await this.authService.login(input);
    await this.sendSession(request, reply, session, 200);
  };

  oauthLogin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!isInternalWebRequest(request, this.config)) {
      await reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Route POST /auth/oauth/google was not found.",
          requestId: request.id,
        },
      });
      return;
    }

    const input = oauthLoginSchema.parse(request.body);
    const session = await this.authService.oauthLogin(input);
    await this.sendSession(request, reply, session, 200);
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const body = refreshSessionSchema.parse(request.body ?? {});
    const session = await this.authService.refresh(body.refreshToken ?? getRefreshTokenFromRequest(request));
    await this.sendSession(request, reply, session, 200);
  };

  logout = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await this.authService.logout(getRefreshTokenFromRequest(request));
    clearRefreshCookie(reply, this.config);
    await reply.code(204).send();
  };

  verifyEmail = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = verifyEmailQuerySchema.parse(request.query);
    const user = await this.authService.verifyEmail(query.token);
    await reply.code(200).send({ user });
  };

  me = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await reply.code(200).send({
      user: request.auth?.user,
    });
  };

  private async sendSession(
    request: FastifyRequest,
    reply: FastifyReply,
    session: AuthSession,
    statusCode: number,
  ): Promise<void> {
    setRefreshCookie(reply, session.refreshToken, this.config);

    const body: Record<string, unknown> = {
      user: session.user,
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    };

    if (isInternalWebRequest(request, this.config)) {
      body.refreshToken = session.refreshToken;
    }

    await reply.code(statusCode).send(body);
  }
}
