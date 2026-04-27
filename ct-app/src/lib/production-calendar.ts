/**
 * Production Calendar Utilities
 * Calculates business/working days according to the Russian Federation production calendar.
 * Accounts for weekends (Sat/Sun), national holidays, and transferred working days.
 * Uses the shared db instance from @/lib/db.
 */

import { db } from "@/lib/db";

// Cache for production calendar data (per-year)
let calendarCache: Map<number, Set<string>> = new Map();
let transferredWorkingCache: Map<number, Set<string>> = new Map();

interface CalendarEntry {
  date: string;
  type: string;
  title: string;
  isNonWorking: boolean;
}

/**
 * Load production calendar for a specific year into cache
 */
async function loadCalendarForYear(year: number): Promise<{
  nonWorkingDays: Set<string>;
  transferredWorkingDays: Set<string>;
}> {
  if (calendarCache.has(year) && transferredWorkingCache.has(year)) {
    return {
      nonWorkingDays: calendarCache.get(year)!,
      transferredWorkingDays: transferredWorkingCache.get(year)!,
    };
  }

  try {
    const entries = await db.$queryRaw<CalendarEntry[]>`
      SELECT "date"::text as date, "type", "title", "isNonWorking"
      FROM "ProductionCalendar"
      WHERE "year" = ${year}
      ORDER BY "date"
    `;

    const nonWorkingDays = new Set<string>();
    const transferredWorkingDays = new Set<string>();

    for (const entry of entries) {
      const dateStr = entry.date.split("T")[0];
      if (!dateStr) continue;
      if (entry.type === "TRANSFERRED_WORKING") {
        transferredWorkingDays.add(dateStr);
      } else if (entry.isNonWorking) {
        nonWorkingDays.add(dateStr);
      }
    }

    calendarCache.set(year, nonWorkingDays);
    transferredWorkingCache.set(year, transferredWorkingDays);

    return { nonWorkingDays, transferredWorkingDays };
  } catch (error) {
    console.error("[ProductionCalendar] Failed to load calendar for year:", year, error);
    return { nonWorkingDays: new Set(), transferredWorkingDays: new Set() };
  }
}

/**
 * Format a date as YYYY-MM-DD string for lookup
 */
function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Check if a date is a working day according to the production calendar.
 */
export async function isWorkingDay(date: Date): Promise<boolean> {
  const dateStr = formatDateStr(date);
  const year = date.getFullYear();
  const dayOfWeek = date.getDay();

  const { nonWorkingDays, transferredWorkingDays } = await loadCalendarForYear(year);

  if (transferredWorkingDays.has(dateStr)) return true;
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  if (nonWorkingDays.has(dateStr)) return false;
  return true;
}

/**
 * Calculate the date that is N business/working days after the start date.
 */
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

/**
 * Count the number of business/working days between two dates.
 */
export async function countBusinessDays(startDate: Date, endDate: Date): Promise<number> {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  const current = new Date(start);

  while (current < end) {
    current.setDate(current.getDate() + 1);
    if (await isWorkingDay(current)) count++;
  }

  return count;
}

/**
 * Get the next working day after a given date
 */
export async function getNextWorkingDay(date: Date): Promise<Date> {
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);

  while (true) {
    current.setDate(current.getDate() + 1);
    if (await isWorkingDay(current)) return current;
  }
}

/**
 * Clear the calendar cache (useful after calendar updates)
 */
export function clearCalendarCache(): void {
  calendarCache.clear();
  transferredWorkingCache.clear();
}

/**
 * Get all calendar entries for a year/month range (for client-side use)
 */
export async function getCalendarEntries(
  year?: number,
  month?: number
): Promise<CalendarEntry[]> {
  try {
    if (year && month) {
      return await db.$queryRaw<CalendarEntry[]>`
        SELECT "date"::text as date, "type", "title", "isNonWorking"
        FROM "ProductionCalendar"
        WHERE "year" = ${year} AND EXTRACT(MONTH FROM "date")::int = ${month}
        ORDER BY "date"
      `;
    } else if (year) {
      return await db.$queryRaw<CalendarEntry[]>`
        SELECT "date"::text as date, "type", "title", "isNonWorking"
        FROM "ProductionCalendar"
        WHERE "year" = ${year}
        ORDER BY "date"
      `;
    }
    return await db.$queryRaw<CalendarEntry[]>`
      SELECT "date"::text as date, "type", "title", "isNonWorking"
      FROM "ProductionCalendar"
      ORDER BY "date"
    `;
  } catch (error) {
    console.error("[ProductionCalendar] Failed to get entries:", error);
    return [];
  }
}
