import type { ZodType } from "zod";
import { MarketDataError } from "../utils/errors.js";

export async function fetchJson<T>(
  provider: string,
  url: URL,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MarketDataError(provider);
  }

  if (!response.ok) {
    throw new MarketDataError(provider);
  }

  try {
    return schema.parse(await response.json());
  } catch {
    throw new MarketDataError(provider, "Market data provider returned an invalid response.");
  }
}
