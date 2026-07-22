import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    accessTokenExpiresAt: string;
    error?: string;
    user: DefaultSession["user"] & {
      id: string;
      role: string;
      plan: string;
      emailVerified: boolean;
      emailAlertsEnabled: boolean;
      telegramChatId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    plan?: string;
    emailVerified?: boolean;
    emailAlertsEnabled?: boolean;
    telegramChatId?: string | null;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: string;
    refreshTokenExpiresAt?: string;
    error?: string;
  }
}
