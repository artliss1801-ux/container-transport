import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/production-calendar/days - Get non-working and transferred-working dates for client-side use
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year")!)
      : new Date().getFullYear();

    const entries = await db.$queryRaw<
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
      const dateStr = entry.date.split("T")[0];
      if (entry.type === "TRANSFERRED_WORKING") {
        transferredWorkingDays.push(dateStr);
      } else if (entry.isNonWorking) {
        nonWorkingDays.push(dateStr);
      }
    }

    return NextResponse.json({
      year,
      nonWorkingDays,
      transferredWorkingDays,
    });
  } catch (error) {
    console.error("[ProductionCalendar Days API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar days" },
      { status: 500 }
    );
  }
}
