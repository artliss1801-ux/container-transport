import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function GET() {
  try {
    console.log('Adding new columns to Order table...');
    
    // Список новых колонок для добавления
    const alterStatements = [
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "client" TEXT;`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "port" TEXT;`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "carrier" TEXT;`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "clientRate" DOUBLE PRECISION;`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "carrierRate" DOUBLE PRECISION;`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "carrierPaymentDueDate" TIMESTAMP(3);`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryDate" TIMESTAMP(3);`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "emptyContainerReturnDate" TIMESTAMP(3);`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "documentSubmissionDate" TIMESTAMP(3);`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "unloadingDatetime" TIMESTAMP(3);`,
    ];

    for (const sql of alterStatements) {
      try {
        await prisma.$executeRawUnsafe(sql);
        console.log('Added column successfully');
      } catch (e: any) {
        if (!e.message.includes('already exists')) {
          console.log('Column error:', e.message);
        }
      }
    }

    // Получаем всех пользователей
    const users = await prisma.$queryRaw`
      SELECT id, email, name, role FROM "User" ORDER BY "createdAt" DESC
    `;

    return Response.json({
      success: true,
      message: 'Database schema updated with new Order columns!',
      users: users,
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return Response.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
}
