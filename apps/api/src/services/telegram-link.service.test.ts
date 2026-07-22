import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import type { AppConfig } from "../config/env.js";
import type { TelegramIntegration } from "../integrations/telegram.js";
import type { AuthRepository } from "../repositories/auth.repository.js";
import { TelegramLinkService } from "./telegram-link.service.js";

describe("TelegramLinkService", () => {
  it("creates a short-lived one-time Telegram link command", async () => {
    const redis = { set: vi.fn().mockResolvedValue("OK") };
    const service = buildService(redis);

    const link = await service.createLink("user-1");

    expect(link.command).toMatch(/^\/start [A-Za-z0-9_-]+$/);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^telegram:link:[A-Za-z0-9_-]+$/),
      "user-1",
      "EX",
      600,
    );
  });

  it("links a private chat only after a valid secret-token webhook update", async () => {
    const redis = { getdel: vi.fn().mockResolvedValue("user-1") };
    const repository = { setTelegramChatId: vi.fn().mockResolvedValue(undefined) };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ skipped: false }) };
    const service = buildService(redis, repository, telegram);

    await service.handleWebhook("webhook-secret", {
      message: {
        text: "/start one-time-token",
        chat: { id: 1234, type: "private" },
      },
    });

    expect(redis.getdel).toHaveBeenCalledWith("telegram:link:one-time-token");
    expect(repository.setTelegramChatId).toHaveBeenCalledWith("user-1", "1234");
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "1234",
      "AlphaSignal alerts are now linked to this Telegram chat.",
    );
  });

  it("rejects webhook updates with an invalid secret header", async () => {
    const repository = { setTelegramChatId: vi.fn() };
    const service = buildService({ getdel: vi.fn() }, repository);

    await expect(service.handleWebhook("wrong-secret", {})).rejects.toThrow("Invalid Telegram webhook signature.");
    expect(repository.setTelegramChatId).not.toHaveBeenCalled();
  });
});

function buildService(
  redis: object,
  repository: object = { setTelegramChatId: vi.fn() },
  telegram: object = { sendMessage: vi.fn() },
) {
  return new TelegramLinkService(
    { TELEGRAM_WEBHOOK_SECRET: "webhook-secret" } as AppConfig,
    redis as Redis,
    repository as AuthRepository,
    telegram as TelegramIntegration,
  );
}
