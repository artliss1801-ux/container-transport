import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { clearCalendarCache, getCalendarEntries } from "@/lib/production-calendar";

// GET /api/production-calendar - Get production calendar entries
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;

    const entries = await getCalendarEntries(year, month);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[ProductionCalendar API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch production calendar" },
      { status: 500 }
    );
  }
}

// POST /api/production-calendar - Add a new calendar entry (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const body = await request.json();
    const { date, type, title, isNonWorking } = body;

    if (!date || !type) {
      return NextResponse.json(
        { error: "Date and type are required" },
        { status: 400 }
      );
    }

    const { db } = await import("@/lib/db");
    const dateObj = new Date(date + "T00:00:00Z");
    const year = dateObj.getUTCFullYear();

    const entry = await db.productionCalendar.upsert({
      where: { date: dateObj },
      create: {
        date: dateObj,
        type,
        title: title || "",
        isNonWorking: isNonWorking ?? true,
        year,
      },
      update: {
        type,
        title: title || "",
        isNonWorking: isNonWorking ?? true,
      },
    });

    clearCalendarCache();

    return NextResponse.json({ entry });
  } catch (error: any) {
    if (error?.status === 401 || error?.status === 403) {
      return NextResponse.json({ error: error?.body || "Access denied" }, { status: error.status });
    }
    console.error("[ProductionCalendar API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create calendar entry" },
      { status: 500 }
    );
  }
}

// DELETE /api/production-calendar - Remove a calendar entry (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json(
        { error: "Date parameter is required" },
        { status: 400 }
      );
    }

    const { db } = await import("@/lib/db");
    await db.productionCalendar.delete({
      where: { date: new Date(date + "T00:00:00Z") },
    });

    clearCalendarCache();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.status === 401 || error?.status === 403) {
      return NextResponse.json({ error: error?.body || "Access denied" }, { status: error.status });
    }
    console.error("[ProductionCalendar API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete calendar entry" },
      { status: 500 }
    );
  }
}

// PATCH /api/production-calendar - Update a calendar entry (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const body = await request.json();
    const { date, type, title, isNonWorking } = body;

    if (!date) {
      return NextResponse.json(
        { error: "Date parameter is required" },
        { status: 400 }
      );
    }

    const { db } = await import("@/lib/db");
    const updateData: any = {};
    if (type !== undefined) updateData.type = type;
    if (title !== undefined) updateData.title = title;
    if (isNonWorking !== undefined) updateData.isNonWorking = isNonWorking;

    const entry = await db.productionCalendar.update({
      where: { date: new Date(date + "T00:00:00Z") },
      data: updateData,
    });

    clearCalendarCache();

    return NextResponse.json({ entry });
  } catch (error: any) {
    if (error?.status === 401 || error?.status === 403) {
      return NextResponse.json({ error: error?.body || "Access denied" }, { status: error.status });
    }
    console.error("[ProductionCalendar API] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update calendar entry" },
      { status: 500 }
    );
  }
}
