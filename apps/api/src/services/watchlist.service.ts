import type { WatchlistItemInput } from "@alphasignal/shared";
import type { WatchlistRepository } from "../repositories/watchlist.repository.js";
import { conflict, notFound } from "../utils/errors.js";

export class WatchlistService {
  constructor(private readonly repository: WatchlistRepository) {}

  list(userId: string) {
    return this.repository.list(userId);
  }

  async add(userId: string, input: WatchlistItemInput) {
    if ((await this.repository.count(userId)) >= 100) {
      throw conflict("Watchlists are limited to 100 instruments.");
    }

    try {
      return await this.repository.create(userId, input);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict("Instrument is already on your watchlist.");
      }
      throw error;
    }
  }

  async remove(userId: string, itemId: string): Promise<void> {
    if (!(await this.repository.delete(userId, itemId))) {
      throw notFound("Watchlist item not found.");
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}
