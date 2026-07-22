import type { Plan, UserRole } from "@alphasignal/shared";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  plan: Plan;
  emailVerified: boolean;
  emailAlertsEnabled: boolean;
  telegramChatId: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  tokenId: string;
}

export interface AuthSession {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}
