import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { addBusinessDays, clearCalendarCache } from "@/lib/production-calendar";

// POST /api/production-calendar/recalculate - Recalculate all payment dates (admin only)
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { db } = await import("@/lib/db");

    // Get all orders with documentSubmissionDate and carrierPaymentDays
    const orders = await db.order.findMany({
      where: {
        documentSubmissionDate: { not: null },
        carrierPaymentDays: { not: null },
      },
      select: {
        id: true,
        orderNumber: true,
        documentSubmissionDate: true,
        carrierPaymentDays: true,
        carrierExpectedPaymentDate: true,
        emptyContainerReturnDate: true,
        branchId: true,
      },
    });

    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    // Clear cache to ensure fresh data
    clearCalendarCache();

    for (const order of orders) {
      try {
        if (!order.documentSubmissionDate || !order.carrierPaymentDays) continue;

        let actualDays = order.carrierPaymentDays;
        const docDate = new Date(order.documentSubmissionDate);
        const returnDate = order.emptyContainerReturnDate
          ? new Date(order.emptyContainerReturnDate)
          : null;

        // Account for grace period if branch has it
        if (returnDate && order.branchId) {
          try {
            const branch = await db.branch.findUnique({
              where: { id: order.branchId },
              select: { documentGraceDays: true },
            });
            if (branch && branch.documentGraceDays !== null && branch.documentGraceDays !== undefined) {
              const workDaysBetween = await addBusinessDays;
              // Count business days between return and doc submission
              let count = 0;
              const current = new Date(returnDate);
              while (current < docDate) {
                current.setDate(current.getDate() + 1);
                if (await (await import("@/lib/production-calendar")).isWorkingDay(current)) count++;
              }
              const extraDays = Math.max(0, count - branch.documentGraceDays);
              actualDays = order.carrierPaymentDays + extraDays;
            }
          } catch {
            // Skip grace period calculation if error
          }
        }

        const newDate = await addBusinessDays(docDate, actualDays);
        const oldDateStr = order.carrierExpectedPaymentDate
          ? new Date(order.carrierExpectedPaymentDate).toISOString().split("T")[0]
          : null;
        const newDateStr = newDate.toISOString().split("T")[0];

        const changed = oldDateStr !== newDateStr;

        if (changed) {
          await db.order.update({
            where: { id: order.id },
            data: {
              carrierExpectedPaymentDate: newDate,
              carrierActualPaymentDays: actualDays,
            },
          });
          updated++;
        } else {
          unchanged++;
        }
      } catch (err) {
        errors++;
        console.error(`[Recalculate] Error for order ${order.orderNumber}:`, err);
      }
    }

    return NextResponse.json({
      total: orders.length,
      updated,
      unchanged,
      errors,
    });
  } catch (error: any) {
    if (error?.status === 401 || error?.status === 403) {
      return NextResponse.json({ error: error?.body || "Access denied" }, { status: error.status });
    }
    console.error("[ProductionCalendar Recalculate API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to recalculate payment dates" },
      { status: 500 }
    );
  }
}
