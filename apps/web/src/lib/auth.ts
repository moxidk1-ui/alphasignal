import type { Account, AuthOptions, Profile, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

interface AlphaSignalUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  plan: string;
  emailVerified: boolean;
  emailAlertsEnabled: boolean;
  telegramChatId: string | null;
}

interface ApiSessionResponse {
  user: AlphaSignalUser;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

interface GoogleProfile extends Profile {
  email_verified?: boolean;
  picture?: string;
  sub?: string;
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const internalApiUrl = process.env.API_INTERNAL_URL ?? apiUrl;

export const authOptions: AuthOptions = {
  pages: {
    signIn: "/auth/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const session = await apiRequest<ApiSessionResponse>("/auth/login", {
          body: {
            email: credentials.email,
            password: credentials.password,
          },
          internal: true,
        });

        return toNextAuthUser(session);
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      if (account?.provider === "credentials" && user) {
        return mergeTokenWithSession(token, user as UserWithApiSession);
      }

      if (account?.provider === "google" && profile) {
        const session = await loginWithGoogle(account, profile as GoogleProfile);
        return mergeTokenWithSession(token, toNextAuthUser(session));
      }

      if (trigger === "update") {
        return refreshAccessToken({ ...token, accessTokenExpiresAt: "" });
      }

      if (hasValidAccessToken(token)) {
        return token;
      }

      return refreshAccessToken(token);
    },
    session({ session, token }) {
      return mergeSessionWithToken(session, token);
    },
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET ?? "local-nextauth-secret-change-before-production-64-characters",
};

interface UserWithApiSession extends User {
  role: string;
  plan: string;
  emailVerified: boolean;
  emailAlertsEnabled: boolean;
  telegramChatId: string | null;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

function toNextAuthUser(session: ApiSessionResponse): UserWithApiSession {
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.avatarUrl,
    role: session.user.role,
    plan: session.user.plan,
    emailVerified: session.user.emailVerified,
    emailAlertsEnabled: session.user.emailAlertsEnabled,
    telegramChatId: session.user.telegramChatId,
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
  };
}

function mergeTokenWithSession(token: JWT, user: UserWithApiSession): JWT {
  return {
    ...token,
    sub: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    picture: user.image ?? null,
    role: user.role,
    plan: user.plan,
    emailVerified: user.emailVerified,
    emailAlertsEnabled: user.emailAlertsEnabled,
    telegramChatId: user.telegramChatId,
    accessToken: user.accessToken,
    accessTokenExpiresAt: user.accessTokenExpiresAt,
    refreshTokenExpiresAt: user.refreshTokenExpiresAt,
    ...(user.refreshToken ? { refreshToken: user.refreshToken } : {}),
  };
}

function mergeSessionWithToken(session: Session, token: JWT): Session {
  const merged: Session = {
    ...session,
    user: {
      ...session.user,
      id: token.sub ?? "",
      email: token.email ?? "",
      name: token.name ?? "",
      image: typeof token.picture === "string" ? token.picture : null,
      role: String(token.role ?? "FREE_USER"),
      plan: String(token.plan ?? "FREE"),
      emailVerified: Boolean(token.emailVerified),
      emailAlertsEnabled: token.emailAlertsEnabled !== false,
      telegramChatId:
        typeof token.telegramChatId === "string" ? token.telegramChatId : null,
    },
    accessToken: typeof token.accessToken === "string" ? token.accessToken : "",
    accessTokenExpiresAt:
      typeof token.accessTokenExpiresAt === "string" ? token.accessTokenExpiresAt : "",
  };

  if (typeof token.error === "string") {
    merged.error = token.error;
  }

  return merged;
}

function hasValidAccessToken(token: JWT): boolean {
  if (typeof token.accessTokenExpiresAt !== "string") {
    return false;
  }

  return new Date(token.accessTokenExpiresAt).getTime() - 60_000 > Date.now();
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (typeof token.refreshToken !== "string") {
    return { ...token, error: "RefreshTokenMissing" };
  }

  try {
    const session = await apiRequest<ApiSessionResponse>("/auth/refresh", {
      body: { refreshToken: token.refreshToken },
      internal: true,
    });

    return mergeTokenWithSession(token, toNextAuthUser(session));
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

async function loginWithGoogle(account: Account, profile: GoogleProfile): Promise<ApiSessionResponse> {
  if (!profile.email || !profile.name) {
    throw new Error("Google profile did not include a verified email and name.");
  }

  return apiRequest<ApiSessionResponse>("/auth/oauth/google", {
    body: {
      provider: "google",
      providerAccountId: account.providerAccountId ?? profile.sub ?? profile.email,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
      emailVerified: Boolean(profile.email_verified),
    },
    internal: true,
  });
}

async function apiRequest<T>(
  path: string,
  options: { body: Record<string, unknown>; internal?: boolean },
): Promise<T> {
  const baseUrl = options.internal ? internalApiUrl : apiUrl;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.internal && process.env.NEXTAUTH_SECRET
        ? { "x-alphasignal-internal-auth": process.env.NEXTAUTH_SECRET }
        : {}),
    },
    body: JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`AlphaSignal API request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}
