import type { Prisma, PrismaClient, UserRole } from "@alphasignal/db";
import type { AdminUsersQueryInput } from "@alphasignal/shared";

export class AdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listUsers(input: AdminUsersQueryInput) {
    const where: Prisma.UserWhereInput = {
      ...(input.q
        ? {
            OR: [
              { email: { contains: input.q, mode: "insensitive" } },
              { name: { contains: input.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.plan ? { plan: input.plan } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total };
  }

  async updateRole(userId: string, role: UserRole) {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: userId },
        data: { role },
        select: adminUserSelect,
      });
      if (role === "PROVIDER") {
        await transaction.providerProfile.upsert({
          where: { userId },
          update: {},
          create: { userId, bio: "Trading signal provider on AlphaSignal." },
        });
      }
      return user;
    });
  }

  async stats() {
    const [users, plans, providers, activeSignals, pendingDetections] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({ by: ["plan"], _count: { plan: true } }),
      this.prisma.providerProfile.count(),
      this.prisma.signal.count({ where: { status: "PUBLISHED" } }),
      this.prisma.signal.count({ where: { status: "PENDING_APPROVAL", source: "ALGO" } }),
    ]);
    return {
      users,
      providers,
      activeSignals,
      pendingDetections,
      plans: Object.fromEntries(plans.map((entry) => [entry.plan, entry._count.plan])),
    };
  }

  async listDetections(page: number, pageSize: number) {
    const where: Prisma.AlgoDetectionWhereInput = {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.algoDetection.findMany({
        where,
        orderBy: { processedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          ticker: true,
          market: true,
          timeframe: true,
          strategy: true,
          direction: true,
          entry: true,
          confidence: true,
          processedAt: true,
          signalId: true,
        },
      }),
      this.prisma.algoDetection.count({ where }),
    ]);
    return { data, total };
  }
}

const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  plan: true,
  emailVerified: true,
  createdAt: true,
} as const;
