#!/bin/bash
# === COMPLETE DEPLOYMENT SCRIPT FOR PRODUCTION CALENDAR ===
# Run this script DIRECTLY on the VPS server as ubuntuuser:
#   bash deploy-pc-server.sh
#
# This script will:
# 1. Create all necessary directories
# 2. Write all new code files
# 3. Add ProductionCalendar model to Prisma schema
# 4. Generate Prisma client
# 5. Deploy the application
#
set -e

APP_DIR="/home/ubuntuuser/ct-app"
echo "=== Production Calendar Deployment ==="
echo "App dir: $APP_DIR"
echo ""

# ============================================================
# 1. Create directories
# ============================================================
echo "[1/7] Creating directories..."
mkdir -p "$APP_DIR/src/lib"
mkdir -p "$APP_DIR/src/app/api/production-calendar/batch"
mkdir -p "$APP_DIR/src/app/api/production-calendar/days"
mkdir -p "$APP_DIR/src/app/api/production-calendar/recalculate"
echo "  Done"

# ============================================================
# 2. Create production-calendar utility
# ============================================================
echo "[2/7] Creating production-calendar utility..."
cat > "$APP_DIR/src/lib/production-calendar.ts" << 'TS_EOF'
/**
 * Production Calendar Utilities
 * Calculates business/working days according to the Russian Federation production calendar.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Cache for production calendar data
let calendarCache: Map<number, { nonWorking: Set<string>; transferred: Set<string> }> = new Map();

interface CalendarEntry {
  date: string;
  type: string;
  title: string;
  isNonWorking: boolean;
}

async function loadCalendarForYear(year: number) {
  if (calendarCache.has(year)) return calendarCache.get(year)!;

  const entries = await prisma.$queryRaw<CalendarEntry[]>`
    SELECT "date", "type", "title", "isNonWorking"
    FROM "ProductionCalendar"
    WHERE "year" = ${year}
  `;

  const nonWorking = new Set<string>();
  const transferred = new Set<string>();

  for (const entry of entries) {
    const ds = entry.date;
    if (entry.type === 'TRANSFERRED_WORKING') {
      transferred.add(ds);
    } else if (entry.isNonWorking) {
      nonWorking.add(ds);
    }
  }

  const result = { nonWorking, transferred };
  calendarCache.set(year, result);
  return result;
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function isWorkingDay(date: Date): Promise<boolean> {
  const ds = formatDateStr(date);
  const year = date.getFullYear();
  const dow = date.getDay();
  const { nonWorking, transferred } = await loadCalendarForYear(year);

  if (transferred.has(ds)) return true;
  if (dow === 0 || dow === 6) return false;
  if (nonWorking.has(ds)) return false;
  return true;
}

export async function addBusinessDays(startDate: Date, businessDays: number): Promise<Date> {
  if (businessDays <= 0) return new Date(startDate);
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  let remaining = businessDays;
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    if (await isWorkingDay(current)) remaining--;
  }
  return current;
}

export async function countBusinessDays(startDate: Date, endDate: Date): Promise<number> {
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(endDate); end.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    if (await isWorkingDay(cur)) count++;
  }
  return count;
}

export async function getNextWorkingDay(date: Date): Promise<Date> {
  const cur = new Date(date); cur.setHours(0, 0, 0, 0);
  while (true) {
    cur.setDate(cur.getDate() + 1);
    if (await isWorkingDay(cur)) return cur;
  }
}

export function clearCalendarCache(): void {
  calendarCache.clear();
}

export async function getCalendarEntries(year?: number, month?: number): Promise<CalendarEntry[]> {
  try {
    if (year && month) {
      return await prisma.$queryRaw<CalendarEntry[]>`
        SELECT "date", "type", "title", "isNonWorking"
        FROM "ProductionCalendar"
        WHERE "year" = ${year} AND EXTRACT(MONTH FROM "date")::int = ${month}
        ORDER BY "date"
      `;
    }
    if (year) {
      return await prisma.$queryRaw<CalendarEntry[]>`
        SELECT "date", "type", "title", "isNonWorking"
        FROM "ProductionCalendar"
        WHERE "year" = ${year}
        ORDER BY "date"
      `;
    }
    return await prisma.$queryRaw<CalendarEntry[]>`
      SELECT "date", "type", "title", "isNonWorking"
      FROM "ProductionCalendar"
      ORDER BY "date"
    `;
  } catch (error) {
    console.error('[ProductionCalendar] Failed to get entries:', error);
    return [];
  }
}
TS_EOF
echo "  Done"

# ============================================================
# 3. Create API routes
# ============================================================
echo "[3/7] Creating API routes..."

# Main route
cat > "$APP_DIR/src/app/api/production-calendar/route.ts" << 'TS_EOF'
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { clearCalendarCache, getCalendarEntries } from '@/lib/production-calendar';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined;
    const entries = await getCalendarEntries(year, month);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('[ProductionCalendar API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, customRoles: true },
    });
    if (!user || (user.role !== 'ADMIN' && user.customRoles?.name !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { date, type, title, isNonWorking } = body;
    if (!date || !type) return NextResponse.json({ error: 'Date and type required' }, { status: 400 });

    const dateObj = new Date(date);
    const entry = await prisma.productionCalendar.upsert({
      where: { date: dateObj },
      create: { id: crypto.randomUUID(), date: dateObj, type, title: title || '', isNonWorking: isNonWorking ?? true, year: dateObj.getFullYear() },
      update: { type, title: title || '', isNonWorking: isNonWorking ?? true },
    });
    clearCalendarCache();
    return NextResponse.json({ entry });
  } catch (error) {
    console.error('[ProductionCalendar API] POST error:', error);
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, customRoles: true },
    });
    if (!user || (user.role !== 'ADMIN' && user.customRoles?.name !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) return NextResponse.json({ error: 'Date required' }, { status: 400 });

    await prisma.productionCalendar.delete({ where: { date: new Date(date) } });
    clearCalendarCache();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, customRoles: true },
    });
    if (!user || (user.role !== 'ADMIN' && user.customRoles?.name !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { date, type, title, isNonWorking } = body;
    if (!date) return NextResponse.json({ error: 'Date required' }, { status: 400 });

    const updateData: any = {};
    if (type !== undefined) updateData.type = type;
    if (title !== undefined) updateData.title = title;
    if (isNonWorking !== undefined) updateData.isNonWorking = isNonWorking;

    const entry = await prisma.productionCalendar.update({ where: { date: new Date(date) }, data: updateData });
    clearCalendarCache();
    return NextResponse.json({ entry });
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
TS_EOF

# Batch route
cat > "$APP_DIR/src/app/api/production-calendar/batch/route.ts" << 'TS_EOF'
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { clearCalendarCache } from '@/lib/production-calendar';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, customRoles: true },
    });
    if (!user || (user.role !== 'ADMIN' && user.customRoles?.name !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { entries, deleteDates } = body;
    const results = { created: 0, deleted: 0 };

    if (deleteDates?.length) {
      await prisma.productionCalendar.deleteMany({
        where: { date: { in: deleteDates.map((d: string) => new Date(d)) } },
      });
      results.deleted = deleteDates.length;
    }

    if (entries?.length) {
      for (const entry of entries) {
        const dateObj = new Date(entry.date);
        await prisma.productionCalendar.upsert({
          where: { date: dateObj },
          create: { id: crypto.randomUUID(), date: dateObj, type: entry.type || 'HOLIDAY', title: entry.title || '', isNonWorking: entry.isNonWorking ?? true, year: dateObj.getFullYear() },
          update: { type: entry.type || 'HOLIDAY', title: entry.title || '', isNonWorking: entry.isNonWorking ?? true },
        });
        results.created++;
      }
    }

    clearCalendarCache();
    return NextResponse.json({ results });
  } catch (error) {
    console.error('[Batch API] error:', error);
    return NextResponse.json({ error: 'Batch failed' }, { status: 500 });
  }
}
TS_EOF

# Recalculate route
cat > "$APP_DIR/src/app/api/production-calendar/recalculate/route.ts" << 'TS_EOF'
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { addBusinessDays, clearCalendarCache } from '@/lib/production-calendar';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, customRoles: true },
    });
    if (!user || (user.role !== 'ADMIN' && user.customRoles?.name !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const yearOnly = body.year ? parseInt(body.year) : undefined;

    clearCalendarCache();

    const whereClause: any = {
      documentSubmissionDate: { not: null },
      carrierPaymentDays: { not: null },
    };
    if (yearOnly) {
      whereClause.documentSubmissionDate = { not: null, gte: new Date(`${yearOnly}-01-01`), lt: new Date(`${yearOnly + 1}-01-01`) };
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      select: { id: true, orderNumber: true, documentSubmissionDate: true, carrierPaymentDays: true, carrierExpectedPaymentDate: true },
    });

    let updated = 0, unchanged = 0, errors = 0;
    const details: any[] = [];

    for (const order of orders) {
      try {
        if (!order.documentSubmissionDate || !order.carrierPaymentDays) continue;
        const newDate = await addBusinessDays(order.documentSubmissionDate, order.carrierPaymentDays);
        const oldStr = order.carrierExpectedPaymentDate?.toISOString().split('T')[0] || null;
        const newStr = newDate.toISOString().split('T')[0];
        const changed = oldStr !== newStr;

        if (changed) {
          await prisma.order.update({ where: { id: order.id }, data: { carrierExpectedPaymentDate: newDate } });
          updated++;
        } else {
          unchanged++;
        }
        details.push({ orderNumber: order.orderNumber, oldDate: oldStr, newDate: newStr, changed });
      } catch (err) { errors++; }
    }

    return NextResponse.json({ total: orders.length, updated, unchanged, errors, details });
  } catch (error) {
    console.error('[Recalculate API] error:', error);
    return NextResponse.json({ error: 'Recalculate failed' }, { status: 500 });
  }
}
TS_EOF

# Days route (for client-side)
cat > "$APP_DIR/src/app/api/production-calendar/days/route.ts" << 'TS_EOF'
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear();

    const entries = await prisma.$queryRaw<Array<{ date: string; type: string; isNonWorking: boolean }>>`
      SELECT "date"::text, "type", "isNonWorking" FROM "ProductionCalendar" WHERE "year" = ${year} ORDER BY "date"
    `;

    const nonWorkingDays: string[] = [];
    const transferredWorkingDays: string[] = [];

    for (const entry of entries) {
      if (entry.type === 'TRANSFERRED_WORKING') {
        transferredWorkingDays.push(entry.date.split('T')[0]);
      } else if (entry.isNonWorking) {
        nonWorkingDays.push(entry.date.split('T')[0]);
      }
    }

    return NextResponse.json({ year, nonWorkingDays, transferredWorkingDays });
  } catch (error) {
    console.error('[Days API] error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
TS_EOF

echo "  Done"

# ============================================================
# 4. Update Prisma schema
# ============================================================
echo "[4/7] Updating Prisma schema..."
SCHEMA_FILE="$APP_DIR/prisma/schema.prisma"
if grep -q "ProductionCalendar" "$SCHEMA_FILE"; then
    echo "  Model already exists in schema"
else
    cat >> "$SCHEMA_FILE" << 'SCHEMA_EOF'

model ProductionCalendar {
  id          String   @id @default(cuid())
  date        DateTime @unique
  type        String   @default("HOLIDAY")
  title       String   @default("")
  isNonWorking Boolean  @default(true)
  year        Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("ProductionCalendar")
}
SCHEMA_EOF
    echo "  Model added to schema"
fi

# ============================================================
# 5. Generate Prisma client
# ============================================================
echo "[5/7] Generating Prisma client..."
cd "$APP_DIR"
npx prisma generate 2>&1 | tail -3

# ============================================================
# 6. Mark migration
# ============================================================
echo "[6/7] Marking migration..."
npx prisma migrate resolve --applied 20260427000000_add_production_calendar 2>&1 || echo "  (Already marked)"

# ============================================================
# 7. Deploy
# ============================================================
echo "[7/7] Deploying application..."
bash "$APP_DIR/deploy-ct.sh"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "The production calendar is now active."
echo "The payment-calendar API will use the new calculation logic."
echo "Admin can manage holidays at: /api/production-calendar"
echo ""
