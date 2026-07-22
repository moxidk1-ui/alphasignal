import type { Redis } from "ioredis";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import type { TelegramIntegration } from "../integrations/telegram.js";
import type { AuthRepository } from "../repositories/auth.repository.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { randomSecret, safeSecretEqual } from "../utils/crypto.js";
import { unauthorized } from "../utils/errors.js";
import { toAuthenticatedUser } from "./auth.service.js";

const telegramUpdateSchema = z.object({
  message: z
    .object({
      text: z.string().optional(),
      chat: z.object({
        id: z.union([z.string(), z.number()]),
        type: z.string(),
      }),
    })
    .optional(),
});

export class TelegramLinkService {
  constructor(
    private readonly config: AppConfig,
    private readonly redis: Redis,
    private readonly repository: AuthRepository,
    private readonly telegram: TelegramIntegration,
  ) {}

  async createLink(userId: string): Promise<{ command: string; expiresAt: string }> {
    const token = randomSecret(24);
    await this.redis.set(`telegram:link:${token}`, userId, "EX", 10 * 60);

    return {
      command: `/start ${token}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }

  async unlink(userId: string): Promise<AuthenticatedUser> {
    return toAuthenticatedUser(await this.repository.setTelegramChatId(userId, null));
  }

  async handleWebhook(secretHeader: string | undefined, update: unknown): Promise<void> {
    if (!safeSecretEqual(secretHeader, this.config.TELEGRAM_WEBHOOK_SECRET)) {
      throw unauthorized("Invalid Telegram webhook signature.");
    }

    const parsed = telegramUpdateSchema.safeParse(update);
    if (!parsed.success || !parsed.data.message?.text) {
      return;
    }

    const match = /^\/start\s+([A-Za-z0-9_-]+)$/.exec(parsed.data.message.text.trim());
    if (!match) {
      return;
    }

    const chatId = String(parsed.data.message.chat.id);
    if (parsed.data.message.chat.type !== "private") {
      await this.telegram.sendMessage(chatId, "AlphaSignal alerts can only be linked in a private chat.");
      return;
    }

    const userId = await this.redis.getdel(`telegram:link:${match[1]!}`);
    if (!userId) {
      await this.telegram.sendMessage(chatId, "This AlphaSignal link code has expired. Generate a new code in settings.");
      return;
    }

    await this.repository.setTelegramChatId(userId, chatId);
    await this.telegram.sendMessage(chatId, "AlphaSignal alerts are now linked to this Telegram chat.");
  }
}
