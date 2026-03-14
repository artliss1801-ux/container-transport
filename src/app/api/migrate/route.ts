import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Временный endpoint для инициализации базы данных на Vercel
// ВАЖНО: Удалите этот файл после первого использования!

export async function GET() {
  try {
    console.log('Starting database initialization...');

    // Создаём таблицы через raw SQL
    console.log('Creating tables...');

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

    console.log('Tables created successfully!');

    // Создаем администратора если не существует
    let existingAdmin;
    try {
      existingAdmin = await prisma.user.findUnique({
        where: { email: 'admin@example.com' }
      });
    } catch (e) {
      existingAdmin = null;
    }

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      await prisma.user.create({
        data: {
          email: 'admin@example.com',
          name: 'Администратор',
          password: hashedPassword,
          role: 'ADMIN',
        }
      });
      console.log('Admin user created');
    }

    // Создаем менеджера если не существует
    let existingManager;
    try {
      existingManager = await prisma.user.findUnique({
        where: { email: 'manager@example.com' }
      });
    } catch (e) {
      existingManager = null;
    }

    if (!existingManager) {
      const hashedPassword = await bcrypt.hash('manager123', 12);
      await prisma.user.create({
        data: {
          email: 'manager@example.com',
          name: 'Иван Менеджер',
          password: hashedPassword,
          role: 'MANAGER',
        }
      });
      console.log('Manager user created');
    }

    // Создаем типы контейнеров
    let containerTypesCount = 0;
    try {
      containerTypesCount = await prisma.containerType.count();
    } catch (e) {}
    
    if (containerTypesCount === 0) {
      await prisma.containerType.createMany({
        data: [
          { name: '20 футов стандарт', code: '20DC', description: 'Стандартный 20-футовый контейнер' },
          { name: '40 футов стандарт', code: '40DC', description: 'Стандартный 40-футовый контейнер' },
          { name: '40 футов высокий', code: '40HC', description: '40-футовый высокий куб' },
          { name: '20 футов рефрижератор', code: '20RF', description: 'Рефрижераторный 20-футовый контейнер' },
          { name: '40 футов рефрижератор', code: '40RF', description: 'Рефрижераторный 40-футовый контейнер' },
        ]
      });
      console.log('Container types created');
    }

    // Создаем тестовых водителей
    let driversCount = 0;
    try {
      driversCount = await prisma.driver.count();
    } catch (e) {}
    
    if (driversCount === 0) {
      await prisma.driver.createMany({
        data: [
          { fullName: 'Петров Иван Сергеевич', phone: '+7 900 123-45-67', licenseNumber: '12 34 567890' },
          { fullName: 'Сидоров Алексей Владимирович', phone: '+7 900 234-56-78', licenseNumber: '23 45 678901' },
          { fullName: 'Козлов Дмитрий Николаевич', phone: '+7 900 345-67-89', licenseNumber: '34 56 789012' },
        ]
      });
      console.log('Drivers created');
    }

    // Создаем тестовые транспортные средства
    let vehiclesCount = 0;
    try {
      vehiclesCount = await prisma.vehicle.count();
    } catch (e) {}
    
    if (vehiclesCount === 0) {
      await prisma.vehicle.createMany({
        data: [
          { vehicleNumber: 'А123БВ777', trailerNumber: 'АВ123478', brand: 'Volvo FH16', vehicleType: 'Тягач' },
          { vehicleNumber: 'В456ГХ777', trailerNumber: 'ГХ567878', brand: 'Scania R500', vehicleType: 'Тягач' },
          { vehicleNumber: 'С789ДЕ777', trailerNumber: 'ДЕ901278', brand: 'MAN TGX', vehicleType: 'Тягач' },
        ]
      });
      console.log('Vehicles created');
    }

    return Response.json({
      success: true,
      message: 'Database initialized successfully!',
      users: {
        admin: !existingAdmin ? 'created' : 'already exists',
        manager: !existingManager ? 'created' : 'already exists'
      },
      credentials: {
        admin: 'admin@example.com / admin123',
        manager: 'manager@example.com / manager123'
      },
      note: 'DELETE THIS ENDPOINT AFTER INITIALIZATION FOR SECURITY!'
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
