import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@alphasignal/shared";
import type { AuthService } from "../services/auth.service.js";
import type { TokenService } from "../services/token.service.js";
import { forbidden, unauthorized } from "../utils/errors.js";

export class AuthMiddleware {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
  ) {}

  authenticate = async (request: FastifyRequest): Promise<void> => {
    const token = extractBearerToken(request);
    const claims = await this.tokenService.verifyAccessToken(token);
    const user = await this.authService.getUser(claims.userId);

    request.auth = {
      user,
      tokenId: claims.tokenId,
    };
  };

  requireRoles(roles: UserRole[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request) => {
      if (!request.auth) {
        await this.authenticate(request);
      }

      const user = request.auth?.user;
      if (!user || !roles.includes(user.role)) {
        throw forbidden();
      }
    };
  }
}

function extractBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header) {
    throw unauthorized();
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw unauthorized("Authorization header must use the Bearer scheme.");
  }

  return token;
}
