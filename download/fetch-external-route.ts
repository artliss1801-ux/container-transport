import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { clearCalendarCache } from '@/lib/production-calendar';
import { clearProductionCalendarCache } from '@/lib/russian-calendar';

const prisma = new PrismaClient();

// Known Russian holiday names (Article 112 of the Labor Code)
const HOLIDAY_NAMES: Record<string, string> = {
  '01-01': 'Новый год',
  '01-02': 'Новогодние каникулы',
  '01-03': 'Новогодние каникулы',
  '01-04': 'Новогодние каникулы',
  '01-05': 'Новогодние каникулы',
  '01-06': 'Новогодние каникулы',
  '01-07': 'Рождество Христово',
  '01-08': 'Новогодние каникулы',
  '02-23': 'День защитника Отечества',
  '03-08': 'Международный женский день',
  '05-01': 'Праздник Весны и Труда',
  '05-09': 'День Победы',
  '06-12': 'День России',
  '11-04': 'День народного единства',
};

/**
 * Fetch production calendar data from isDayOff.ru API
 * Returns array of day statuses: 0=working, 1=non-working, 2=short day
 */
async function fetchFromIsDayOff(year: number): Promise<string[]> {
  const url = `https://isdayoff.ru/api/getdata?year=${year}&cc=ru&pre=1`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ContainerTrans-App/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`isDayOff.ru returned status ${response.status}`);
  }

  const data = await response.text();
  return data.split(',');
}

/**
 * POST /api/production-calendar/fetch-external - Fetch production calendar from internet and update DB
 * Admin only
 */
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
    const year = body.year || new Date().getFullYear();

    if (year < 2020 || year > 2030) {
      return NextResponse.json(
        { error: 'Year must be between 2020 and 2030' },
        { status: 400 }
      );
    }

    // Fetch from isDayOff.ru
    const days = await fetchFromIsDayOff(year);

    const entries: Array<{
      date: Date;
      type: string;
      title: string;
      isNonWorking: boolean;
      year: number;
    }> = [];

    for (let i = 0; i < days.length; i++) {
      const dayOfYear = i + 1;
      const date = new Date(year, 0, dayOfYear);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
      const status = parseInt(days[i]);

      // Check if this date is a weekend (Sat=6, Sun=0)
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (status === 0) {
        // Working day
        if (isWeekend) {
          // Weekend day that is a working day → transferred working day
          entries.push({
            date,
            type: 'TRANSFERRED_WORKING',
            title: 'Перенос выходного дня',
            isNonWorking: false,
            year,
          });
        }
        // Regular weekdays with status 0 → no entry needed
      } else if (status === 1) {
        // Non-working day
        if (!isWeekend) {
          // Weekday that is non-working → holiday or transferred holiday
          const monthDay = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const title = HOLIDAY_NAMES[monthDay] || 'Выходной день (перенос)';
          entries.push({
            date,
            type: 'HOLIDAY',
            title,
            isNonWorking: true,
            year,
          });
        }
        // Regular weekends with status 1 → no entry needed (handled by isWeekend check)
      }
      // status === 2 (short day) → skip for now, still a working day
    }

    // Delete existing entries for this year
    const deleteResult = await prisma.productionCalendar.deleteMany({
      where: { year },
    });

    // Insert new entries
    if (entries.length > 0) {
      await prisma.productionCalendar.createMany({
        data: entries.map(e => ({
          id: crypto.randomUUID(),
          date: e.date,
          type: e.type,
          title: e.title,
          isNonWorking: e.isNonWorking,
          year: e.year,
        })),
      });
    }

    // Clear caches
    clearCalendarCache();
    clearProductionCalendarCache();

    const summary = {
      year,
      deleted: deleteResult.count,
      inserted: entries.length,
      holidays: entries.filter(e => e.type === 'HOLIDAY').length,
      transferredWorking: entries.filter(e => e.type === 'TRANSFERRED_WORKING').length,
      source: 'isdayoff.ru',
    };

    console.log('[ProductionCalendar] External fetch result:', summary);

    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    console.error('[ProductionCalendar] Fetch external error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch production calendar from external source' },
      { status: 500 }
    );
  }
}
