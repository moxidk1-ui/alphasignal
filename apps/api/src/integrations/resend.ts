import { Resend } from "resend";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config/env.js";
import { serviceUnavailable } from "../utils/errors.js";
import { ProviderCircuit } from "./circuit-breaker.js";

export interface EmailSendResult {
  id: string;
  skipped: boolean;
}

export class ResendIntegration {
  private readonly resend: Resend;
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    logger: FastifyBaseLogger,
  ) {
    this.resend = new Resend(config.RESEND_API_KEY);
    this.circuit = new ProviderCircuit(
      "resend",
      logger,
      () => serviceUnavailable("Email delivery is temporarily unavailable."),
    );
  }

  async sendEmail(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey?: string;
  }): Promise<EmailSendResult> {
    if (this.shouldSkipExternalSend()) {
      return {
        id: `local-${Date.now()}`,
        skipped: true,
      };
    }

    return this.circuit.execute(async () => {
      const email = {
        from: this.config.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      };
      const response = input.idempotencyKey
        ? await this.resend.emails.send(email, { idempotencyKey: input.idempotencyKey })
        : await this.resend.emails.send(email);

      if (response.error) {
        throw new Error(response.error.message);
      }

      return {
        id: response.data?.id ?? "resend-accepted",
        skipped: false,
      };
    });
  }

  private shouldSkipExternalSend(): boolean {
    return (
      this.config.NODE_ENV !== "production" &&
      (this.config.RESEND_API_KEY.includes("local") ||
        this.config.RESEND_API_KEY.includes("replace") ||
        !this.config.RESEND_API_KEY.startsWith("re_"))
    );
  }
}
