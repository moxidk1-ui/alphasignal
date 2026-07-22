import type { PrismaClient } from "@alphasignal/db";

export class HealthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async databaseIsReachable(): Promise<boolean> {
    await this.prisma.user.findFirst({
      select: {
        id: true,
      },
    });
    return true;
  }
}
