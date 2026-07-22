import type { FastifyBaseLogger } from "fastify";
import { Telegraf } from "telegraf";
import type { AppConfig } from "../config/env.js";
import { serviceUnavailable } from "../utils/errors.js";
import { ProviderCircuit } from "./circuit-breaker.js";

export interface TelegramSendResult {
  skipped: boolean;
}

export class TelegramIntegration {
  private readonly bot: Telegraf;
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    logger: FastifyBaseLogger,
  ) {
    this.bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
    this.circuit = new ProviderCircuit(
      "telegram",
      logger,
      () => serviceUnavailable("Telegram delivery is temporarily unavailable."),
    );
  }

  async sendMessage(chatId: string, message: string): Promise<TelegramSendResult> {
    if (this.shouldSkipExternalSend()) {
      return { skipped: true };
    }

    return this.circuit.execute(async () => {
      await this.bot.telegram.sendMessage(chatId, message, {
        link_preview_options: { is_disabled: true },
      });

      return { skipped: false };
    });
  }

  private shouldSkipExternalSend(): boolean {
    return (
      this.config.NODE_ENV !== "production" &&
      (this.config.TELEGRAM_BOT_TOKEN.includes("local") ||
        this.config.TELEGRAM_BOT_TOKEN.includes("replace"))
    );
  }
}
