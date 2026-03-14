import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Временный endpoint для инициализации базы данных на Vercel
// ВАЖНО: Удалите этот файл после первого использования!

export async function GET() {
  try {
    console.log('Starting database initialization...');

    // Сначала создаём таблицы через prisma db push
    console.log('Running prisma db push...');
    try {
      const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss --skip-generate', {
        timeout: 60000,
        env: process.env
      });
      console.log('Prisma db push stdout:', stdout);
      if (stderr) console.log('Prisma db push stderr:', stderr);
    } catch (pushError) {
      console.log('Prisma db push warning:', pushError);
      // Продолжаем даже если есть предупреждения
    }

    // Создаем администратора если не существует
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' }
    });

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
    const existingManager = await prisma.user.findUnique({
      where: { email: 'manager@example.com' }
    });

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
    const containerTypes = await prisma.containerType.count();
    if (containerTypes === 0) {
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
    const drivers = await prisma.driver.count();
    if (drivers === 0) {
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
    const vehicles = await prisma.vehicle.count();
    if (vehicles === 0) {
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
