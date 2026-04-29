import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Убеждаемся, что Prisma-клиент подключён к БД.
 * В production-schema (standalone) Prisma уже инициализирован,
 * но для безопаснсти делаем лёгкий query.
 */
export async function ensureMigrations() {
  try {
    await db.$connect();
  } catch {
    // already connected
  }
}

/**
 * Обёртка с ретраями для нестабильных DB-операций
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
      }
    }
  }
  throw lastError;
}
