import { describe, expect, it, vi } from "vitest";
import type { WatchlistRepository } from "../repositories/watchlist.repository.js";
import { WatchlistService } from "./watchlist.service.js";

describe("WatchlistService", () => {
  it("adds a normalized instrument when capacity is available", async () => {
    const repository = repositoryMock({
      count: vi.fn().mockResolvedValue(4),
      create: vi.fn().mockResolvedValue({ id: "watch-1", ticker: "AAPL", market: "STOCKS" }),
    });
    const service = new WatchlistService(repository);

    await expect(service.add("user-1", { ticker: "AAPL", market: "STOCKS" })).resolves.toEqual({
      id: "watch-1",
      ticker: "AAPL",
      market: "STOCKS",
    });
  });

  it("maps duplicate instruments to a conflict response", async () => {
    const repository = repositoryMock({
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockRejectedValue({ code: "P2002" }),
    });
    const service = new WatchlistService(repository);

    await expect(service.add("user-1", { ticker: "AAPL", market: "STOCKS" })).rejects.toThrow(
      "already on your watchlist",
    );
  });

  it("does not remove another user's watchlist row", async () => {
    const service = new WatchlistService(repositoryMock({ delete: vi.fn().mockResolvedValue(false) }));
    await expect(service.remove("user-1", "watch-elsewhere")).rejects.toThrow("Watchlist item not found");
  });
});

function repositoryMock(overrides: Partial<WatchlistRepository> = {}): WatchlistRepository {
  return {
    list: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as WatchlistRepository;
}
