import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  alphasignalPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.alphasignalPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : [
            {
              emit: "event",
              level: "error",
            },
          ],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.alphasignalPrisma = prisma;
}

export { Prisma, PrismaClient } from "@prisma/client";
export * from "@prisma/client";
