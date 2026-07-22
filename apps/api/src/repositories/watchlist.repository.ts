import type { PrismaClient } from "@alphasignal/db";
import type { WatchlistItemInput } from "@alphasignal/shared";

export class WatchlistRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(userId: string) {
    return this.prisma.watchlistItem.findMany({
      where: { userId },
      select: { id: true, ticker: true, market: true, addedAt: true },
      orderBy: { addedAt: "desc" },
    });
  }

  count(userId: string): Promise<number> {
    return this.prisma.watchlistItem.count({ where: { userId } });
  }

  create(userId: string, input: WatchlistItemInput) {
    return this.prisma.watchlistItem.create({
      data: { userId, ticker: input.ticker, market: input.market },
      select: { id: true, ticker: true, market: true, addedAt: true },
    });
  }

  async delete(userId: string, itemId: string): Promise<boolean> {
    const result = await this.prisma.watchlistItem.deleteMany({
      where: { id: itemId, userId },
    });

    return result.count > 0;
  }
}
