import { SignJWT, importPKCS8, importSPKI, jwtVerify } from "jose";
import type { JWTPayload, KeyLike } from "jose";
import type { AppConfig } from "../config/env.js";
import { randomTokenId } from "../utils/crypto.js";
import { unauthorized } from "../utils/errors.js";
import type { AuthenticatedUser } from "../types/auth.js";

interface AccessTokenClaims extends JWTPayload {
  typ: "access";
  email: string;
  role: AuthenticatedUser["role"];
  plan: AuthenticatedUser["plan"];
}

interface RefreshTokenClaims extends JWTPayload {
  typ: "refresh";
}

interface EmailVerificationClaims extends JWTPayload {
  typ: "email_verification";
  email: string;
}

export class TokenService {
  private privateKeyPromise: Promise<KeyLike> | undefined;
  private publicKeyPromise: Promise<KeyLike> | undefined;
  private readonly issuer = "alphasignal-api";
  private readonly audience = "alphasignal";
  private readonly refreshSecret: Uint8Array;

  constructor(private readonly config: AppConfig) {
    this.refreshSecret = new TextEncoder().encode(config.JWT_REFRESH_SECRET);
  }

  async createAccessToken(user: AuthenticatedUser): Promise<{ token: string; expiresAt: Date; jti: string }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const jti = randomTokenId();
    const privateKey = await this.getPrivateKey();

    const token = await new SignJWT({
      typ: "access",
      email: user.email,
      role: user.role,
      plan: user.plan,
    } satisfies AccessTokenClaims)
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(user.id)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(privateKey);

    return { token, expiresAt, jti };
  }

  async verifyAccessToken(token: string): Promise<{ userId: string; tokenId: string }> {
    try {
      const { payload } = await jwtVerify<AccessTokenClaims>(token, await this.getPublicKey(), {
        audience: this.audience,
        issuer: this.issuer,
      });

      if (payload.typ !== "access" || !payload.sub || !payload.jti) {
        throw unauthorized("Invalid access token.");
      }

      return { userId: payload.sub, tokenId: payload.jti };
    } catch {
      throw unauthorized("Invalid or expired access token.");
    }
  }

  async createRefreshToken(userId: string, tokenId: string): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = await new SignJWT({ typ: "refresh" } satisfies RefreshTokenClaims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(userId)
      .setJti(tokenId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.refreshSecret);

    return { token, expiresAt };
  }

  async verifyRefreshToken(token: string): Promise<{ userId: string; tokenId: string }> {
    try {
      const { payload } = await jwtVerify<RefreshTokenClaims>(token, this.refreshSecret, {
        audience: this.audience,
        issuer: this.issuer,
      });

      if (payload.typ !== "refresh" || !payload.sub || !payload.jti) {
        throw unauthorized("Invalid refresh token.");
      }

      return { userId: payload.sub, tokenId: payload.jti };
    } catch {
      throw unauthorized("Invalid or expired refresh token.");
    }
  }

  async createEmailVerificationToken(user: AuthenticatedUser): Promise<string> {
    const privateKey = await this.getPrivateKey();

    return new SignJWT({
      typ: "email_verification",
      email: user.email,
    } satisfies EmailVerificationClaims)
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(user.id)
      .setJti(randomTokenId())
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(privateKey);
  }

  async verifyEmailVerificationToken(token: string): Promise<{ userId: string; email: string }> {
    try {
      const { payload } = await jwtVerify<EmailVerificationClaims>(token, await this.getPublicKey(), {
        audience: this.audience,
        issuer: this.issuer,
      });

      if (payload.typ !== "email_verification" || !payload.sub || !payload.email) {
        throw unauthorized("Invalid email verification token.");
      }

      return { userId: payload.sub, email: payload.email };
    } catch {
      throw unauthorized("Invalid or expired email verification token.");
    }
  }

  private getPrivateKey(): Promise<KeyLike> {
    this.privateKeyPromise ??= importPKCS8(this.config.JWT_PRIVATE_KEY, "RS256");
    return this.privateKeyPromise;
  }

  private getPublicKey(): Promise<KeyLike> {
    this.publicKeyPromise ??= importSPKI(this.config.JWT_PUBLIC_KEY, "RS256");
    return this.publicKeyPromise;
  }
}
