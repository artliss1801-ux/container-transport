import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create admin user
  const hashedPassword = await bcrypt.hash("admin123", 12);
  
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Администратор",
      password: hashedPassword,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  console.log("✅ Created admin user:", admin.email);

  // Create manager user
  const managerPassword = await bcrypt.hash("manager123", 12);
  
  const manager = await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: {
      email: "manager@example.com",
      name: "Иван Менеджер",
      password: managerPassword,
      role: "MANAGER",
      emailVerified: new Date(),
    },
  });

  console.log("✅ Created manager user:", manager.email);

  // Create container types
  const containerTypes = await Promise.all([
    prisma.containerType.upsert({
      where: { id: "ct-20dc" },
      update: {},
      create: {
        id: "ct-20dc",
        name: "20 футов DC",
        code: "20DC",
        description: "Стандартный контейнер 20 футов (Dry Container)",
      },
    }),
    prisma.containerType.upsert({
      where: { id: "ct-40dc" },
      update: {},
      create: {
        id: "ct-40dc",
        name: "40 футов DC",
        code: "40DC",
        description: "Стандартный контейнер 40 футов (Dry Container)",
      },
    }),
    prisma.containerType.upsert({
      where: { id: "ct-40hc" },
      update: {},
      create: {
        id: "ct-40hc",
        name: "40 футов HC",
        code: "40HC",
        description: "High Cube контейнер 40 футов (увеличенная высота)",
      },
    }),
    prisma.containerType.upsert({
      where: { id: "ct-20rf" },
      update: {},
      create: {
        id: "ct-20rf",
        name: "20 футов Рефрижератор",
        code: "20RF",
        description: "Рефрижераторный контейнер 20 футов",
      },
    }),
    prisma.containerType.upsert({
      where: { id: "ct-40rf" },
      update: {},
      create: {
        id: "ct-40rf",
        name: "40 футов Рефрижератор",
        code: "40RF",
        description: "Рефрижераторный контейнер 40 футов",
      },
    }),
  ]);

  console.log("✅ Created", containerTypes.length, "container types");

  // Create drivers
  const drivers = await Promise.all([
    prisma.driver.upsert({
      where: { id: "driver-1" },
      update: {},
      create: {
        id: "driver-1",
        fullName: "Петров Петр Петрович",
        phone: "+7 (999) 123-45-67",
        licenseNumber: "99 99 123456",
      },
    }),
    prisma.driver.upsert({
      where: { id: "driver-2" },
      update: {},
      create: {
        id: "driver-2",
        fullName: "Сидоров Алексей Иванович",
        phone: "+7 (999) 234-56-78",
        licenseNumber: "99 99 234567",
      },
    }),
    prisma.driver.upsert({
      where: { id: "driver-3" },
      update: {},
      create: {
        id: "driver-3",
        fullName: "Козлов Дмитрий Сергеевич",
        phone: "+7 (999) 345-67-89",
        licenseNumber: "99 99 345678",
      },
    }),
  ]);

  console.log("✅ Created", drivers.length, "drivers");

  // Create vehicles
  const vehicles = await Promise.all([
    prisma.vehicle.upsert({
      where: { id: "vehicle-1" },
      update: {},
      create: {
        id: "vehicle-1",
        vehicleNumber: "А123БВ777",
        trailerNumber: "ВГ12345",
        brand: "Volvo FH16",
        vehicleType: "Тягач",
      },
    }),
    prisma.vehicle.upsert({
      where: { id: "vehicle-2" },
      update: {},
      create: {
        id: "vehicle-2",
        vehicleNumber: "Б456ГД799",
        trailerNumber: "ДЕ67890",
        brand: "Scania R500",
        vehicleType: "Тягач",
      },
    }),
    prisma.vehicle.upsert({
      where: { id: "vehicle-3" },
      update: {},
      create: {
        id: "vehicle-3",
        vehicleNumber: "В789ЕЖ750",
        trailerNumber: "ЖЗ11111",
        brand: "MAN TGX",
        vehicleType: "Тягач",
      },
    }),
  ]);

  console.log("✅ Created", vehicles.length, "vehicles");

  // Create sample orders
  const orders = [];
  const statuses = ["NEW", "IN_PROGRESS", "DELIVERED", "CANCELLED"] as const;
  const cities = ["Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург", "Нижний Новгород", "Самара", "Омск"];

  for (let i = 1; i <= 25; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const loadingCity = cities[Math.floor(Math.random() * cities.length)];
    let unloadingCity = cities[Math.floor(Math.random() * cities.length)];
    while (unloadingCity === loadingCity) {
      unloadingCity = cities[Math.floor(Math.random() * cities.length)];
    }

    const loadingDate = new Date();
    loadingDate.setDate(loadingDate.getDate() - Math.floor(Math.random() * 30));

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${String(loadingDate.getFullYear()).slice(-2)}${String(loadingDate.getMonth() + 1).padStart(2, "0")}-${String(i).padStart(4, "0")}`,
        loadingDatetime: loadingDate,
        loadingCity,
        loadingAddress: `ул. Примерная, д. ${Math.floor(Math.random() * 100) + 1}`,
        unloadingCity,
        unloadingAddress: `ул. Тестовая, д. ${Math.floor(Math.random() * 100) + 1}`,
        containerNumber: `CONT${Math.floor(Math.random() * 9000000) + 1000000}`,
        containerTypeId: containerTypes[Math.floor(Math.random() * containerTypes.length)].id,
        cargoWeight: Math.round((Math.random() * 20 + 5) * 100) / 100,
        status,
        driverId: drivers[Math.floor(Math.random() * drivers.length)].id,
        vehicleId: vehicles[Math.floor(Math.random() * vehicles.length)].id,
        userId: Math.random() > 0.5 ? admin.id : manager.id,
        notes: Math.random() > 0.7 ? "Пример примечания к заявке" : null,
      },
    });
    orders.push(order);
  }

  console.log("✅ Created", orders.length, "sample orders");

  console.log("🎉 Database seeded successfully!");
  console.log("\n📋 Test credentials:");
  console.log("  Admin: admin@example.com / admin123");
  console.log("  Manager: manager@example.com / manager123");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
