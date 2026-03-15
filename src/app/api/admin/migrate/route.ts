import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

// GET and POST - Run database migration
async function runMigration() {
  const results: string[] = [];

  // 1. Create Client table if not exists
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Client" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "inn" TEXT,
        "kpp" TEXT,
        "address" TEXT,
        "contactPerson" TEXT,
        "phone" TEXT,
        "email" TEXT,
        "notes" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
      );
    `);
    results.push("✓ Client table created or already exists");
  } catch (e: any) {
    results.push(`⚠ Client table: ${e.message}`);
  }

  // 2. Create Port table if not exists
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Port" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "code" TEXT,
        "country" TEXT,
        "notes" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Port_pkey" PRIMARY KEY ("id")
      );
    `);
    results.push("✓ Port table created or already exists");
  } catch (e: any) {
    results.push(`⚠ Port table: ${e.message}`);
  }

  // 3. Add new columns to Order table
  const orderColumns = [
    { name: "clientId", sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "clientId" TEXT` },
    { name: "portId", sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "portId" TEXT` },
    { name: "clientRateVat", sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "clientRateVat" TEXT DEFAULT 'NO_VAT'` },
    { name: "carrierRateVat", sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "carrierRateVat" TEXT DEFAULT 'NO_VAT'` },
    { name: "carrierPaymentDays", sql: `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "carrierPaymentDays" INTEGER` },
  ];

  for (const col of orderColumns) {
    try {
      await db.$executeRawUnsafe(col.sql);
      results.push(`✓ Order.${col.name} column added or already exists`);
    } catch (e: any) {
      if (e.message.includes("already exists") || e.message.includes("duplicate")) {
        results.push(`✓ Order.${col.name} already exists`);
      } else {
        results.push(`⚠ Order.${col.name}: ${e.message}`);
      }
    }
  }

  // 4. Drop old columns from Order table (deliveryDate, carrierPaymentDueDate)
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "Order" DROP COLUMN IF EXISTS "deliveryDate"`);
    results.push("✓ Order.deliveryDate column removed");
  } catch (e: any) {
    results.push(`⚠ Order.deliveryDate removal: ${e.message}`);
  }

  try {
    await db.$executeRawUnsafe(`ALTER TABLE "Order" DROP COLUMN IF EXISTS "carrierPaymentDueDate"`);
    results.push("✓ Order.carrierPaymentDueDate column removed");
  } catch (e: any) {
    results.push(`⚠ Order.carrierPaymentDueDate removal: ${e.message}`);
  }

  // 5. Add foreign key constraints
  try {
    const constraintExists = await db.$queryRawUnsafe(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'Order' 
      AND constraint_name = 'Order_clientId_fkey'
    `);
    
    if (!Array.isArray(constraintExists) || constraintExists.length === 0) {
      await db.$executeRawUnsafe(`
        ALTER TABLE "Order" 
        ADD CONSTRAINT "Order_clientId_fkey" 
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
      results.push("✓ Order -> Client foreign key added");
    } else {
      results.push("✓ Order -> Client foreign key already exists");
    }
  } catch (e: any) {
    results.push(`⚠ Order -> Client FK: ${e.message}`);
  }

  try {
    const portFkExists = await db.$queryRawUnsafe(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'Order' 
      AND constraint_name = 'Order_portId_fkey'
    `);
    
    if (!Array.isArray(portFkExists) || portFkExists.length === 0) {
      await db.$executeRawUnsafe(`
        ALTER TABLE "Order" 
        ADD CONSTRAINT "Order_portId_fkey" 
        FOREIGN KEY ("portId") REFERENCES "Port"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
      results.push("✓ Order -> Port foreign key added");
    } else {
      results.push("✓ Order -> Port foreign key already exists");
    }
  } catch (e: any) {
    results.push(`⚠ Order -> Port FK: ${e.message}`);
  }

  // 6. Create indexes
  try {
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Client_name_idx" ON "Client"("name")`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Port_name_idx" ON "Port"("name")`);
    results.push("✓ Indexes created");
  } catch (e: any) {
    results.push(`⚠ Indexes: ${e.message}`);
  }

  return results;
}

// GET - Run migration (for easy browser access)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован. Войдите в систему." }, { status: 401 });
    }

    // Только ADMIN может запускать миграции
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен. Требуются права администратора." }, { status: 403 });
    }

    const results = await runMigration();

    return NextResponse.json({
      success: true,
      message: "Миграция завершена",
      results,
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: "Ошибка миграции", detail: error?.message },
      { status: 500 }
    );
  }
}

// POST - Run database migration
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Только ADMIN может запускать миграции
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const results = await runMigration();

    return NextResponse.json({
      success: true,
      message: "Миграция завершена",
      results,
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: "Ошибка миграции", detail: error?.message },
      { status: 500 }
    );
  }
}
