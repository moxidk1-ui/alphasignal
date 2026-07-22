import type { Plan, PrismaClient, UserRole } from "@alphasignal/db";

export interface BillingAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: Plan;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
}

export class BillingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAccount(userId: string): Promise<BillingAccount | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: billingSelect });
  }

  findAccountByCustomerId(customerId: string): Promise<BillingAccount | null> {
    return this.prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: billingSelect });
  }

  setCustomerId(userId: string, customerId: string): Promise<BillingAccount> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
      select: billingSelect,
    });
  }

  async applyPlan(input: {
    userId: string;
    plan: Plan;
    customerId?: string;
    subscriptionId?: string | null;
  }): Promise<BillingAccount> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.user.findUniqueOrThrow({ where: { id: input.userId }, select: { role: true } });
      const role = entitlementRole(current.role, input.plan);
      const user = await transaction.user.update({
        where: { id: input.userId },
        data: {
          plan: input.plan,
          role,
          ...(input.customerId ? { stripeCustomerId: input.customerId } : {}),
          ...(input.subscriptionId !== undefined ? { stripeSubId: input.subscriptionId } : {}),
        },
        select: billingSelect,
      });

      if (input.plan === "PROVIDER") {
        await transaction.providerProfile.upsert({
          where: { userId: input.userId },
          update: {},
          create: {
            userId: input.userId,
            bio: "Trading signal provider on AlphaSignal.",
          },
        });
      }

      return user;
    });
  }
}

const billingSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  plan: true,
  stripeCustomerId: true,
  stripeSubId: true,
} as const;

function entitlementRole(current: UserRole, plan: Plan): UserRole {
  if (current === "ADMIN") {
    return "ADMIN";
  }
  if (plan === "PROVIDER") {
    return "PROVIDER";
  }
  return plan === "PRO" ? "SUBSCRIBER" : "FREE_USER";
}
