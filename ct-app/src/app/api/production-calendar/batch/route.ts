import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { clearCalendarCache } from "@/lib/production-calendar";

// POST /api/production-calendar/batch - Batch add/remove calendar entries (admin only)
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { entries, deleteDates, year } = body;

    const { db } = await import("@/lib/db");
    const results = { created: 0, updated: 0, deleted: 0 };

    // Delete specified dates
    if (deleteDates && Array.isArray(deleteDates)) {
      await db.productionCalendar.deleteMany({
        where: {
          date: { in: deleteDates.map((d: string) => new Date(d + "T00:00:00Z")) },
        },
      });
      results.deleted = deleteDates.length;
    }

    // Upsert entries
    if (entries && Array.isArray(entries)) {
      for (const entry of entries) {
        const dateObj = new Date(entry.date + "T00:00:00Z");
        const entryYear = year || dateObj.getUTCFullYear();

        await db.productionCalendar.upsert({
          where: { date: dateObj },
          create: {
            date: dateObj,
            type: entry.type || "HOLIDAY",
            title: entry.title || "",
            isNonWorking: entry.isNonWorking ?? true,
            year: entryYear,
          },
          update: {
            type: entry.type || "HOLIDAY",
            title: entry.title || "",
            isNonWorking: entry.isNonWorking ?? true,
          },
        });
        results.created++;
      }
    }

    clearCalendarCache();

    return NextResponse.json({ results });
  } catch (error: any) {
    if (error?.status === 401 || error?.status === 403) {
      return NextResponse.json({ error: error?.body || "Access denied" }, { status: error.status });
    }
    console.error("[ProductionCalendar Batch API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to batch update calendar" },
      { status: 500 }
    );
  }
}
