import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { clearCalendarCache, addBusinessDays } from '@/lib/production-calendar';

const prisma = new PrismaClient();

// POST /api/production-calendar/batch - Batch add/remove calendar entries (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, customRoles: true },
    });

    if (!user || (user.role !== 'ADMIN' && user.customRoles?.name !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { entries, deleteDates, year } = body;

    const results = { created: 0, updated: 0, deleted: 0 };

    // Delete specified dates
    if (deleteDates && Array.isArray(deleteDates)) {
      await prisma.productionCalendar.deleteMany({
        where: {
          date: { in: deleteDates.map((d: string) => new Date(d)) },
        },
      });
      results.deleted = deleteDates.length;
    }

    // Upsert entries
    if (entries && Array.isArray(entries)) {
      for (const entry of entries) {
        const dateObj = new Date(entry.date);
        const entryYear = year || dateObj.getFullYear();

        await prisma.productionCalendar.upsert({
          where: { date: dateObj },
          create: {
            id: crypto.randomUUID(),
            date: dateObj,
            type: entry.type || 'HOLIDAY',
            title: entry.title || '',
            isNonWorking: entry.isNonWorking ?? true,
            year: entryYear,
          },
          update: {
            type: entry.type || 'HOLIDAY',
            title: entry.title || '',
            isNonWorking: entry.isNonWorking ?? true,
          },
        });
        results.created++;
      }
    }

    clearCalendarCache();

    return NextResponse.json({ results });
  } catch (error) {
    console.error('[ProductionCalendar Batch API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to batch update calendar' },
      { status: 500 }
    );
  }
}
