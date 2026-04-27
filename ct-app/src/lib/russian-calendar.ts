// Russian Business Calendar Utility
// Handles Russian non-working days (weekends + official holidays)
// Loads production calendar from DB (ProductionCalendar table) with fallback to hardcoded values.
// Based on Трудовой кодекс РФ (Art. 112) and Постановления Правительства РФ

// ============================================================
// DB-LOADED PRODUCTION CALENDAR (takes priority over hardcoded)
// ============================================================

// Loaded calendar data per year: { nonWorking: Set<string>, transferred: Set<string> }
// Keys are "YYYY-MM-DD" strings
let dbCalendarCache: Map<number, { nonWorking: Set<string>; transferred: Set<string> }> = new Map();
let dbCalendarLoaded = false;
let dbCalendarLoadFailed = false;

/**
 * Load production calendar from DB for all years we might need.
 * Call this at the start of a request handler to ensure DB data is available.
 * Returns true if DB data was loaded successfully.
 * Uses dynamic import to avoid pulling server-only modules into client bundle.
 */
export async function ensureProductionCalendar(): Promise<boolean> {
  if (dbCalendarLoaded || dbCalendarLoadFailed) return !dbCalendarLoadFailed;

  try {
    // Dynamic import to prevent client bundling of server modules
    const { db } = await import("@/lib/db");
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];

    const entries = await db.$queryRaw<Array<{ date: string; type: string; isNonWorking: boolean }>>`
      SELECT "date"::text as date, "type", "isNonWorking"
      FROM "ProductionCalendar"
      WHERE "year" IN (${years[0]}, ${years[1]}, ${years[2]})
      ORDER BY "date"
    `;

    for (const entry of entries) {
      const dateStr = entry.date.split("T")[0]; // Handle timestamp format
      if (!dateStr) continue;

      // Parse year from date string
      const yearStr = dateStr.split("-")[0];
      const year = parseInt(yearStr);
      if (isNaN(year)) continue;

      if (!dbCalendarCache.has(year)) {
        dbCalendarCache.set(year, { nonWorking: new Set(), transferred: new Set() });
      }
      const yearData = dbCalendarCache.get(year)!;

      if (entry.type === "TRANSFERRED_WORKING") {
        yearData.transferred.add(dateStr);
      } else if (entry.isNonWorking) {
        yearData.nonWorking.add(dateStr);
      }
    }

    dbCalendarLoaded = true;
    console.log(`[russian-calendar] Loaded production calendar from DB for years ${years}, total entries: ${entries.length}`);
    return true;
  } catch (error: any) {
    console.warn("[russian-calendar] Failed to load from DB, using hardcoded fallback:", error?.message || error);
    dbCalendarLoadFailed = true;
    return false;
  }
}

/**
 * Clear the DB calendar cache (call after calendar updates)
 */
export function clearProductionCalendarCache(): void {
  dbCalendarCache.clear();
  dbCalendarLoaded = false;
  dbCalendarLoadFailed = false;
}

/**
 * Get DB calendar data for a specific year
 */
function getDbCalendar(year: number): { nonWorking: Set<string>; transferred: Set<string> } | null {
  return dbCalendarCache.get(year) || null;
}

// ============================================================
// HARDCODED FALLBACK
// ============================================================

// Fixed Russian holidays (month-day format, applicable every year)
const RUSSIAN_HOLIDAYS: [number, number][] = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8],  // New Year + Christmas
  [2, 23],  // Defender of the Fatherland Day
  [3, 8],   // International Women's Day
  [5, 1],   // Spring and Labor Day
  [5, 9],   // Victory Day
  [6, 12],  // Russia Day
  [11, 4],  // Unity Day
];

// Year-specific government transfers (Постановления Правительства РФ)
// Fallback: used only when DB calendar is not available
const YEARLY_TRANSFERS: Record<number, { from: [number, number]; to: [number, number] }[]> = {
  2024: [
    { from: [1, 6], to: [1, 8] },
    { from: [5, 4], to: [5, 10] },
    { from: [11, 2], to: [11, 4] },
    { from: [12, 28], to: [12, 31] },
  ],
  2025: [
    { from: [1, 4], to: [1, 9] },
    { from: [1, 5], to: [1, 9] },
    { from: [5, 2], to: [5, 5] },
    { from: [6, 14], to: [6, 13] },
    { from: [11, 1], to: [11, 3] },
    { from: [12, 27], to: [12, 31] },
    { from: [12, 28], to: [12, 31] },
  ],
  2026: [
    { from: [1, 3], to: [1, 9] },
    { from: [1, 4], to: [12, 31] },
  ],
};

/**
 * Compute automatic holiday transfers for a year (hardcoded fallback).
 */
function getAutoHolidayTransfers(year: number): Set<string> {
  const transfers = new Set<string>();

  for (const [m, d] of RUSSIAN_HOLIDAYS) {
    const date = new Date(year, m - 1, d);
    const dow = date.getDay();

    if (dow === 6) {
      const nextMon = new Date(date);
      nextMon.setDate(nextMon.getDate() + 2);
      const key = `${nextMon.getFullYear()}-${String(nextMon.getMonth() + 1).padStart(2, "0")}-${String(nextMon.getDate()).padStart(2, "0")}`;
      transfers.add(key);
    } else if (dow === 0) {
      const nextMon = new Date(date);
      nextMon.setDate(nextMon.getDate() + 1);
      const key = `${nextMon.getFullYear()}-${String(nextMon.getMonth() + 1).padStart(2, "0")}-${String(nextMon.getDate()).padStart(2, "0")}`;
      transfers.add(key);
    }
  }

  return transfers;
}

const autoTransferCache = new Map<number, Set<string>>();
function getCachedAutoTransfers(year: number): Set<string> {
  if (!autoTransferCache.has(year)) {
    autoTransferCache.set(year, getAutoHolidayTransfers(year));
  }
  return autoTransferCache.get(year)!;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// ============================================================
// PUBLIC API (synchronous, uses preloaded DB data or hardcoded fallback)
// ============================================================

/**
 * Check if a date is a Russian working day.
 *
 * When DB production calendar is loaded (via ensureProductionCalendar()),
 * uses DB data as the source of truth. Otherwise falls back to hardcoded
 * holidays + auto-transfer logic.
 *
 * Priority order (DB mode):
 * 1. Transferred working day (weekend marked as working) → WORKING
 * 2. DB non-working day (holiday) → NOT working
 * 3. Regular weekend (Sat/Sun) → NOT working
 * 4. Otherwise → WORKING
 */
export function isRussianWorkingDay(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dow = date.getDay();
  const dateKey = formatDateKey(date);

  // === DB MODE: use production calendar from database ===
  const dbCal = getDbCalendar(year);
  if (dbCal) {
    // 1. Transferred working day (e.g., Saturday that became working for compensation)
    if (dbCal.transferred.has(dateKey)) return true;

    // 2. Non-working day from production calendar (holiday or custom)
    if (dbCal.nonWorking.has(dateKey)) return false;

    // 3. Regular weekends
    if (dow === 0 || dow === 6) return false;

    // 4. Regular working day
    return true;
  }

  // === HARDCODED FALLBACK ===
  // 1. Government-decreed additional holidays (`to` dates)
  const transfers = YEARLY_TRANSFERS[year];
  if (transfers) {
    for (const t of transfers) {
      if (t.to[0] === month && t.to[1] === day) return false;
    }
  }

  // 2. Fixed holidays
  for (const [m, d] of RUSSIAN_HOLIDAYS) {
    if (m === month && d === day) return false;
  }

  // 3. Automatic transfers
  const autoTransfers = getCachedAutoTransfers(year);
  if (autoTransfers.has(dateKey)) return false;

  // 4. `from` transfers (working Saturdays)
  if (transfers) {
    for (const t of transfers) {
      if (t.from[0] === month && t.from[1] === day) return true;
    }
  }

  // 5. Regular weekends
  if (dow === 0 || dow === 6) return false;

  // 6. Regular working day
  return true;
}

/**
 * Count Russian working days between two dates (inclusive).
 */
export function countRussianWorkingDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    if (isRussianWorkingDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Add N Russian working days to a date.
 * Returns the date that is N working days after startDate.
 */
export function addRussianWorkingDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  result.setHours(0, 0, 0, 0);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isRussianWorkingDay(result)) remaining--;
  }

  // Safety net: ensure the result is always a working day
  while (!isRussianWorkingDay(result)) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}

/**
 * Ensure a date falls on a Russian working day.
 */
export function ensureRussianWorkingDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  while (!isRussianWorkingDay(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}
