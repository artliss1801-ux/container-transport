/**
 * Production Calendar Utilities
 * Calculates business/working days according to the Russian Federation production calendar.
 * Accounts for weekends (Sat/Sun), national holidays, and transferred working days.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Cache for production calendar data (per-year)
let calendarCache: Map<number, Set<string>> = new Map();
let transferredWorkingCache: Map<number, Set<string>> = new Map();
let cacheYear: number | null = null;

interface CalendarEntry {
  date: string;
  type: 'HOLIDAY' | 'WEEKEND' | 'TRANSFERRED_WORKING' | 'CUSTOM';
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
    const entries = await prisma.$queryRaw<CalendarEntry[]>`
      SELECT "date", "type", "title", "isNonWorking"
      FROM "ProductionCalendar"
      WHERE "year" = ${year}
      ORDER BY "date"
    `;

    const nonWorkingDays = new Set<string>();
    const transferredWorkingDays = new Set<string>();

    for (const entry of entries) {
      const dateStr = entry.date;
      if (entry.type === 'TRANSFERRED_WORKING') {
        // This is a weekend day that has been designated as a working day
        transferredWorkingDays.add(dateStr);
      } else if (entry.isNonWorking) {
        // This is a holiday or custom non-working day
        nonWorkingDays.add(dateStr);
      }
    }

    calendarCache.set(year, nonWorkingDays);
    transferredWorkingCache.set(year, transferredWorkingDays);

    return { nonWorkingDays, transferredWorkingDays };
  } catch (error) {
    console.error('[ProductionCalendar] Failed to load calendar for year:', year, error);
    return { nonWorkingDays: new Set(), transferredWorkingDays: new Set() };
  }
}

/**
 * Format a date as YYYY-MM-DD string for lookup
 */
function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Check if a date is a working day according to the production calendar.
 * A working day is:
 * - Monday-Friday (not weekend)
 * - AND not a holiday/non-working day in the production calendar
 * - OR a Saturday/Sunday that is marked as TRANSFERRED_WORKING
 */
export async function isWorkingDay(date: Date): Promise<boolean> {
  const dateStr = formatDateStr(date);
  const year = date.getFullYear();
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

  const { nonWorkingDays, transferredWorkingDays } = await loadCalendarForYear(year);

  // Check if it's a transferred working day (weekend that became working)
  if (transferredWorkingDays.has(dateStr)) {
    return true;
  }

  // Check if it's a weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Check if it's a holiday/non-working day
  if (nonWorkingDays.has(dateStr)) {
    return false;
  }

  return true;
}

/**
 * Calculate the date that is N business/working days after the start date.
 * The start date itself is NOT counted (counting starts from the next day).
 * 
 * @param startDate - The starting date (typically document submission date)
 * @param businessDays - Number of business days to add
 * @returns The calculated due date
 */
export async function addBusinessDays(startDate: Date, businessDays: number): Promise<Date> {
  if (businessDays <= 0) return new Date(startDate);

  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  
  let remaining = businessDays;
  
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    
    if (await isWorkingDay(current)) {
      remaining--;
    }
  }
  
  return current;
}

/**
 * Count the number of business/working days between two dates (inclusive of end, exclusive of start).
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
    if (await isWorkingDay(current)) {
      count++;
    }
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
    if (await isWorkingDay(current)) {
      return current;
    }
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
 * Get all non-working days for a year range (for client-side use)
 */
export async function getCalendarEntries(
  year?: number,
  month?: number
): Promise<CalendarEntry[]> {
  try {
    let query = '';
    const params: any[] = [];
    
    if (year) {
      query += ' WHERE "year" = $1';
      params.push(year);
    }
    
    if (month && year) {
      query += ' AND EXTRACT(MONTH FROM "date")::int = $2';
      params.push(month);
    }
    
    query += ' ORDER BY "date"';
    
    if (params.length === 0) {
      return await prisma.$queryRaw<CalendarEntry[]>`
        SELECT "date", "type", "title", "isNonWorking"
        FROM "ProductionCalendar"
        ORDER BY "date"
      `;
    }
    
    // Use tagged template for dynamic queries
    return await prisma.$queryRawUnsafe<CalendarEntry[]>(
      `SELECT "date", "type", "title", "isNonWorking" FROM "ProductionCalendar" ${query}`,
      ...params
    );
  } catch (error) {
    console.error('[ProductionCalendar] Failed to get entries:', error);
    return [];
  }
}
