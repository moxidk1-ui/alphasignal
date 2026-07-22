import type { LoggerOptions } from "pino";
import type { AppConfig } from "./env.js";

const redactedPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.token",
  "req.body.refreshToken",
  "req.body.card",
  "req.body.cardNumber",
  "req.body.cvc",
  "res.headers['set-cookie']",
  "*.apiKey",
  "*.apiSecret",
  "*.passwordHash",
  "*.tokenHash",
];

export function createLoggerOptions(config: AppConfig): LoggerOptions {
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    base: {
      service: "alphasignal-api",
      env: config.NODE_ENV,
    },
    redact: {
      paths: redactedPaths,
      censor: "[REDACTED]",
      remove: false,
    },
  };

  if (config.NODE_ENV === "development") {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "SYS:standard",
      },
    };
  }

  return options;
}
