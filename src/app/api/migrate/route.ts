import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function GET() {
  try {
    console.log('Creating User table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" TEXT UNIQUE NOT NULL,
        "name" TEXT,
        "password" TEXT,
        "image" TEXT,
        "role" TEXT NOT NULL DEFAULT 'MANAGER',
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

    console.log('Creating Account table...');
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

    console.log('Creating Session table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionToken" TEXT UNIQUE NOT NULL,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "expires" TIMESTAMP NOT NULL
      );
    `);

    console.log('Creating VerificationToken table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VerificationToken" (
        "identifier" TEXT NOT NULL,
        "token" TEXT UNIQUE NOT NULL,
        "expires" TIMESTAMP NOT NULL,
        UNIQUE("identifier", "token")
      );
    `);

    console.log('Creating ContainerType table...');
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

    console.log('Creating Driver table...');
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

    console.log('Creating Vehicle table...');
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

    console.log('Creating Order table...');
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

    console.log('Tables created! Creating users...');

    // Проверяем есть ли уже пользователи
    const usersCount = await prisma.$queryRaw`SELECT COUNT(*) FROM "User"`;
    const count = Number((usersCount as any)[0].count);

    if (count === 0) {
      const hashedAdminPassword = await bcrypt.hash('admin123', 12);
      const hashedManagerPassword = await bcrypt.hash('manager123', 12);

      await prisma.$executeRawUnsafe(`
        INSERT INTO "User" (email, name, password, role)
        VALUES 
          ('admin@example.com', 'Администратор', '${hashedAdminPassword}', 'ADMIN'),
          ('manager@example.com', 'Иван Менеджер', '${hashedManagerPassword}', 'MANAGER')
      `);
    }

    return Response.json({
      success: true,
      message: 'Database initialized!',
      credentials: {
        admin: 'admin@example.com / admin123',
        manager: 'manager@example.com / manager123'
      }
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
}
