import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/production-calendar/days - Get non-working and transferred-working dates for client-side use
// Returns sets of date strings for quick client-side lookup
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year')
      ? parseInt(searchParams.get('year')!)
      : new Date().getFullYear();

    const entries = await prisma.$queryRaw<
      Array<{ date: string; type: string; isNonWorking: boolean }>
    >`
      SELECT "date"::text, "type", "isNonWorking"
      FROM "ProductionCalendar"
      WHERE "year" = ${year}
      ORDER BY "date"
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

    return NextResponse.json({
      year,
      nonWorkingDays,
      transferredWorkingDays,
    });
  } catch (error) {
    console.error('[ProductionCalendar Days API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar days' },
      { status: 500 }
    );
  }
}
