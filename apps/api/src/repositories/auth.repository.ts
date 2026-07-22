import type { PrismaClient, User } from "@alphasignal/db";
import type { UpdateMeInput } from "@alphasignal/shared";

export type AuthUserRecord = Pick<
  User,
  | "id"
  | "email"
  | "passwordHash"
  | "name"
  | "avatarUrl"
  | "role"
  | "plan"
  | "emailVerified"
  | "emailAlertsEnabled"
  | "telegramChatId"
  | "createdAt"
  | "updatedAt"
>;

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: AuthUserRecord;
}

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: userSelect,
    });
  }

  findUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
  }

  createUser(data: { email: string; passwordHash: string; name: string }): Promise<AuthUserRecord> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: "FREE_USER",
        plan: "FREE",
      },
      select: userSelect,
    });
  }

  upsertOAuthUser(data: {
    email: string;
    passwordHash: string;
    name: string;
    avatarUrl?: string;
    emailVerified: boolean;
  }): Promise<AuthUserRecord> {
    const updateData = {
      emailVerified: data.emailVerified,
      name: data.name,
      ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
    };
    const createData = {
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name,
      ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
      emailVerified: data.emailVerified,
      role: "FREE_USER" as const,
      plan: "FREE" as const,
    };

    return this.prisma.user.upsert({
      where: { email: data.email },
      update: updateData,
      create: createData,
      select: userSelect,
    });
  }

  markEmailVerified(userId: string): Promise<AuthUserRecord> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
      select: userSelect,
    });
  }

  updateMe(userId: string, input: UpdateMeInput): Promise<AuthUserRecord> {
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.emailAlertsEnabled !== undefined ? { emailAlertsEnabled: input.emailAlertsEnabled } : {}),
    };

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: userSelect,
    });
  }

  setTelegramChatId(userId: string, telegramChatId: string | null): Promise<AuthUserRecord> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId },
      select: userSelect,
    });
  }

  createRefreshToken(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    return this.prisma.refreshToken
      .create({
        data,
        select: {
          id: true,
        },
      })
      .then(() => undefined);
  }

  findRefreshTokenById(id: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: userSelect,
        },
      },
    });
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}

const userSelect = {
  id: true,
  email: true,
  passwordHash: true,
  name: true,
  avatarUrl: true,
  role: true,
  plan: true,
  emailVerified: true,
  emailAlertsEnabled: true,
  telegramChatId: true,
  createdAt: true,
  updatedAt: true,
} as const;
