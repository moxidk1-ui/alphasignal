import bcrypt from "bcryptjs";
import type {
  LoginInput,
  OAuthLoginInput,
  RegisterInput,
  UpdateMeInput,
} from "@alphasignal/shared";
import type { AuthRepository, AuthUserRecord } from "../repositories/auth.repository.js";
import type { EmailService } from "./email.service.js";
import type { TokenService } from "./token.service.js";
import type { AuthenticatedUser, AuthSession } from "../types/auth.js";
import { randomSecret, randomTokenId, sha256 } from "../utils/crypto.js";
import { badRequest, conflict, unauthorized } from "../utils/errors.js";

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
  ) {}

  async register(input: RegisterInput): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      throw conflict("An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = toAuthenticatedUser(
      await this.repository.createUser({
        email,
        passwordHash,
        name: input.name.trim(),
      }),
    );
    const verificationToken = await this.tokenService.createEmailVerificationToken(user);
    await this.emailService.sendVerificationEmail(user, verificationToken);

    return this.issueSession(user);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);
    if (!user) {
      throw unauthorized("Invalid email or password.");
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw unauthorized("Invalid email or password.");
    }

    return this.issueSession(toAuthenticatedUser(user));
  }

  async oauthLogin(input: OAuthLoginInput): Promise<AuthSession> {
    if (!input.emailVerified) {
      throw badRequest("OAuth email must be verified by the provider.");
    }

    const email = normalizeEmail(input.email);
    const lockedPassword = sha256(`${input.provider}:${input.providerAccountId}:${randomSecret(16)}`);
    const oauthUserInput = {
      email,
      passwordHash: await bcrypt.hash(lockedPassword, 12),
      name: input.name.trim(),
      emailVerified: true,
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    };
    const user = await this.repository.upsertOAuthUser(oauthUserInput);

    return this.issueSession(toAuthenticatedUser(user));
  }

  async refresh(refreshToken: string | undefined): Promise<AuthSession> {
    if (!refreshToken) {
      throw unauthorized("Refresh token cookie is missing.");
    }

    const claims = await this.tokenService.verifyRefreshToken(refreshToken);
    const record = await this.repository.findRefreshTokenById(claims.tokenId);
    if (!record || record.userId !== claims.userId || record.revokedAt || record.expiresAt <= new Date()) {
      throw unauthorized("Invalid or expired refresh token.");
    }

    const matches = await bcrypt.compare(refreshToken, record.tokenHash);
    if (!matches) {
      throw unauthorized("Invalid or expired refresh token.");
    }

    await this.repository.revokeRefreshToken(record.id);
    return this.issueSession(toAuthenticatedUser(record.user));
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const claims = await this.tokenService.verifyRefreshToken(refreshToken);
      await this.repository.revokeRefreshToken(claims.tokenId);
    } catch {
      return;
    }
  }

  async verifyEmail(token: string): Promise<AuthenticatedUser> {
    const claims = await this.tokenService.verifyEmailVerificationToken(token);
    const user = await this.repository.findUserById(claims.userId);
    if (!user || normalizeEmail(user.email) !== normalizeEmail(claims.email)) {
      throw unauthorized("Invalid email verification token.");
    }

    if (user.emailVerified) {
      return toAuthenticatedUser(user);
    }

    return toAuthenticatedUser(await this.repository.markEmailVerified(user.id));
  }

  async getUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw unauthorized("User no longer exists.");
    }

    return toAuthenticatedUser(user);
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<AuthenticatedUser> {
    return toAuthenticatedUser(await this.repository.updateMe(userId, input));
  }

  private async issueSession(user: AuthenticatedUser): Promise<AuthSession> {
    const refreshTokenId = randomTokenId();
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.createAccessToken(user),
      this.tokenService.createRefreshToken(user.id, refreshTokenId),
    ]);

    await this.repository.createRefreshToken({
      id: refreshTokenId,
      userId: user.id,
      tokenHash: await bcrypt.hash(refreshToken.token, 12),
      expiresAt: refreshToken.expiresAt,
    });

    return {
      user,
      accessToken: accessToken.token,
      refreshToken: refreshToken.token,
      accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      refreshTokenExpiresAt: refreshToken.expiresAt.toISOString(),
    };
  }
}

export function toAuthenticatedUser(user: AuthUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    plan: user.plan,
    emailVerified: user.emailVerified,
    emailAlertsEnabled: user.emailAlertsEnabled,
    telegramChatId: user.telegramChatId,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
