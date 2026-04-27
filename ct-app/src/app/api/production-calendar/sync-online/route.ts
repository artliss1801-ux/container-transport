import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { clearCalendarCache } from "@/lib/production-calendar";

// Fixed Russian holidays (month-day format) for title mapping
const HOLIDAY_NAMES: Record<string, Record<number, string>> = {
  "01-01": "Новый год",
  "01-02": "Новогодние каникулы",
  "01-03": "Новогодние каникулы",
  "01-04": "Новогодние каникулы",
  "01-05": "Новогодние каникулы",
  "01-06": "Новогодние каникулы",
  "01-07": "Рождество Христово",
  "01-08": "Новогодние каникулы",
  "02-23": "День защитника Отечества",
  "03-08": "Международный женский день",
  "05-01": "Праздник Весны и Труда",
  "05-09": "День Победы",
  "06-12": "День России",
  "11-04": "День народного единства",
};

function getHolidayTitle(monthDay: string): string {
  return HOLIDAY_NAMES[monthDay] || "Выходной день";
}

// POST /api/production-calendar/sync-online - Sync production calendar from isdayoff.ru API
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { db } = await import("@/lib/db");
    const body = await request.json();
    const year = body.year || new Date().getFullYear();

    console.log(`[SyncOnline] Starting sync for year ${year} from isdayoff.ru`);

    // Fetch data from isdayoff.ru API
    // Response format: comma-separated values, one per day of the year
    // 0 = day off, 1 = working day, 2 = shortened working day
    const apiUrl = `https://isdayoff.ru/api/getdata?year=${year}&delimeter=comma&cc=ru`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "ContainerTrans-App/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[SyncOnline] API returned status ${response.status}`);
      return NextResponse.json(
        { error: `Ошибка получения данных: HTTP ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.text();
    const values = data.split(",");

    if (values.length < 365) {
      console.error("[SyncOnline] Invalid response data, too few days");
      return NextResponse.json(
        { error: "Некорректный ответ от сервиса" },
        { status: 502 }
      );
    }

    // Track weekends that became working days (transferred)
    // And weekdays that became non-working (holidays/bridge days)
    const newEntries: Array<{
      date: string;
      type: string;
      title: string;
      isNonWorking: boolean;
      year: number;
    }> = [];

    const transferredWorking: string[] = [];
    const additionalHolidays: string[] = [];

    for (let i = 0; i < values.length; i++) {
      const dayNum = i + 1;
      const date = new Date(Date.UTC(year, 0, dayNum));
      if (date.getUTCFullYear() !== year) break; // Safety check

      const dayOfWeek = date.getUTCDay(); // 0=Sun, 6=Sat
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const monthDay = `${month}-${day}`;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const status = parseInt(values[i]);

      if (status === 0) {
        // Day off / non-working
        if (isWeekend) {
          // Regular weekend — don't store in ProductionCalendar (computed automatically)
          continue;
        } else {
          // Weekday that's non-working = holiday or bridge day
          additionalHolidays.push(dateStr);
          newEntries.push({
            date: dateStr,
            type: "HOLIDAY",
            title: getHolidayTitle(monthDay),
            isNonWorking: true,
            year,
          });
        }
      } else if (status === 1) {
        // Working day
        if (isWeekend) {
          // Weekend that's a working day = transferred working day
          transferredWorking.push(dateStr);
          newEntries.push({
            date: dateStr,
            type: "TRANSFERRED_WORKING",
            title: "Перенесённый рабочий день",
            isNonWorking: false,
            year,
          });
        }
        // Regular weekday working day — don't store
      }
      // status === 2: shortened working day — not stored as non-working
    }

    // Delete existing entries for the year (except manually added CUSTOM entries)
    const existing = await db.productionCalendar.findMany({
      where: {
        year,
        type: { not: "CUSTOM" },
      },
      select: { id: true, date: true },
    });

    if (existing.length > 0) {
      await db.productionCalendar.deleteMany({
        where: {
          id: { in: existing.map(e => e.id) },
        },
      });
    }

    // Create new entries
    if (newEntries.length > 0) {
      await db.productionCalendar.createMany({
        data: newEntries.map(e => ({
          date: new Date(e.date + "T00:00:00Z"),
          type: e.type,
          title: e.title,
          isNonWorking: e.isNonWorking,
          year: e.year,
        })),
      });
    }

    // Also clear russian-calendar cache
    try {
      const { clearProductionCalendarCache } = await import("@/lib/russian-calendar");
      clearProductionCalendarCache();
    } catch {}

    clearCalendarCache();

    console.log(`[SyncOnline] Year ${year}: added ${newEntries.length} entries (${additionalHolidays.length} holidays, ${transferredWorking.length} transferred working days)`);

    return NextResponse.json({
      success: true,
      year,
      holidays: additionalHolidays.length,
      transferredWorking: transferredWorking.length,
      total: newEntries.length,
    });
  } catch (error: any) {
    if (error?.status === 401 || error?.status === 403) {
      return NextResponse.json({ error: error?.body || "Access denied" }, { status: error.status });
    }
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      console.error("[SyncOnline] Timeout connecting to isdayoff.ru");
      return NextResponse.json(
        { error: "Таймаут при подключении к сервису производственного календаря. Попробуйте позже." },
        { status: 504 }
      );
    }
    console.error("[SyncOnline] Error:", error);
    return NextResponse.json(
      { error: "Ошибка синхронизации: " + (error?.message || "Unknown") },
      { status: 500 }
    );
  }
}
