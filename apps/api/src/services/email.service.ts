import type { AppConfig } from "../config/env.js";
import type { ResendIntegration } from "../integrations/resend.js";
import type { AuthenticatedUser } from "../types/auth.js";

export class EmailService {
  constructor(
    private readonly config: AppConfig,
    private readonly resend: ResendIntegration,
  ) {}

  async sendVerificationEmail(user: AuthenticatedUser, token: string): Promise<void> {
    const verificationUrl = `${this.config.FRONTEND_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;background:#080a0f;color:#e2e8f0;padding:32px">
        <div style="max-width:560px;margin:0 auto;background:#111318;border:1px solid #252a3a;padding:28px">
          <h1 style="margin:0 0 12px;font-size:22px">Verify your AlphaSignal email</h1>
          <p style="line-height:1.6;color:#cbd5e1">Hi ${escapeHtml(user.name)}, confirm this email address to secure your account and enable provider alerts.</p>
          <p style="margin:24px 0">
            <a href="${verificationUrl}" style="background:#3b82f6;color:white;padding:12px 16px;text-decoration:none;border-radius:6px;display:inline-block">Verify email</a>
          </p>
          <p style="line-height:1.6;color:#64748b;font-size:13px">This link expires in 24 hours. If you did not create an AlphaSignal account, ignore this email.</p>
        </div>
      </div>
    `;

    const text = [
      `Hi ${user.name},`,
      "",
      "Confirm this email address to secure your AlphaSignal account.",
      verificationUrl,
      "",
      "This link expires in 24 hours.",
    ].join("\n");

    await this.resend.sendEmail({
      to: user.email,
      subject: "Verify your AlphaSignal email",
      html,
      text,
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
