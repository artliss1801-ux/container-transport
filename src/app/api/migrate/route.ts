import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function GET() {
  try {
    // Обновляем старую роль MANAGER на LOGISTICS_MANAGER если есть
    console.log('Migrating MANAGER role to LOGISTICS_MANAGER...');
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE "User" SET role = 'LOGISTICS_MANAGER' WHERE role = 'MANAGER';
      `);
    } catch (e) {
      console.log('No MANAGER role to migrate');
    }

    // Создаём таблицы если не существуют
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" TEXT UNIQUE NOT NULL,
        "name" TEXT,
        "password" TEXT,
        "image" TEXT,
        "role" TEXT NOT NULL DEFAULT 'LOGISTICS_MANAGER',
        "emailVerified" TIMESTAMP,
        "verificationToken" TEXT UNIQUE,
        "isTwoFactorEnabled" BOOLEAN DEFAULT false,
        "twoFactorSecret" TEXT,
        "resetToken" TEXT UNIQUE,
        "resetTokenExpiry" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Account" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "type" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "providerAccountId" TEXT NOT NULL,
        "refresh_token" TEXT,
        "access_token" TEXT,
        "expires_at" INTEGER,
        "token_type" TEXT,
        "scope" TEXT,
        "id_token" TEXT,
        "session_state" TEXT,
        UNIQUE("provider", "providerAccountId")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionToken" TEXT UNIQUE NOT NULL,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "expires" TIMESTAMP NOT NULL
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VerificationToken" (
        "identifier" TEXT NOT NULL,
        "token" TEXT UNIQUE NOT NULL,
        "expires" TIMESTAMP NOT NULL,
        UNIQUE("identifier", "token")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ContainerType" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" TEXT NOT NULL,
        "code" TEXT,
        "description" TEXT,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Driver" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "fullName" TEXT NOT NULL,
        "phone" TEXT,
        "licenseNumber" TEXT,
        "passportData" TEXT,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Vehicle" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "vehicleNumber" TEXT NOT NULL,
        "trailerNumber" TEXT,
        "brand" TEXT,
        "vehicleType" TEXT,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Order" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderNumber" TEXT UNIQUE NOT NULL,
        "loadingDatetime" TIMESTAMP NOT NULL,
        "loadingCity" TEXT NOT NULL,
        "loadingAddress" TEXT NOT NULL,
        "unloadingCity" TEXT NOT NULL,
        "unloadingAddress" TEXT NOT NULL,
        "containerNumber" TEXT NOT NULL,
        "containerTypeId" TEXT NOT NULL REFERENCES "ContainerType"("id"),
        "cargoWeight" DOUBLE PRECISION NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'NEW',
        "driverId" TEXT REFERENCES "Driver"("id"),
        "vehicleId" TEXT REFERENCES "Vehicle"("id"),
        "userId" TEXT NOT NULL REFERENCES "User"("id"),
        "notes" TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT,
        "action" TEXT NOT NULL,
        "entityType" TEXT NOT NULL,
        "entityId" TEXT,
        "details" TEXT,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // Получаем ВСЕХ пользователей для диагностики
    const allUsers = await prisma.$queryRaw`
      SELECT id, email, name, role, "createdAt" FROM "User" ORDER BY "createdAt" DESC
    `;

    return Response.json({
      success: true,
      message: 'Database initialized!',
      allUsers: allUsers,
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return Response.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
}
