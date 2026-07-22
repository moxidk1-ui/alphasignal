import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { serviceUnavailable } from "../utils/errors.js";
import { ProviderCircuit } from "./circuit-breaker.js";
import type { ExternalQuotaTracker } from "./external-quota.js";

const anthropicResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }),
  ),
});

export class AnthropicIntegration {
  private readonly circuit: ProviderCircuit;

  constructor(
    private readonly config: AppConfig,
    private readonly quota: ExternalQuotaTracker,
    logger: FastifyBaseLogger,
  ) {
    this.circuit = new ProviderCircuit("anthropic", logger);
  }

  completeAnalysis(system: string, user: string): Promise<string> {
    return this.circuit.execute(async () => {
      await this.quota.trackAnthropic();
      let response: Response;
      try {
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": this.config.ANTHROPIC_API_KEY,
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            system,
            messages: [{ role: "user", content: user }],
          }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw serviceUnavailable("AI analysis service is temporarily unavailable.");
      }

      if (!response.ok) {
        throw serviceUnavailable("AI analysis service rejected the request.");
      }

      const payload = anthropicResponseSchema.safeParse(await response.json());
      if (!payload.success) {
        throw serviceUnavailable("AI analysis service returned an invalid response.");
      }
      const text = payload.data.content.find((block) => block.type === "text")?.text;
      if (!text) {
        throw serviceUnavailable("AI analysis service returned an empty response.");
      }

      return text;
    });
  }
}
