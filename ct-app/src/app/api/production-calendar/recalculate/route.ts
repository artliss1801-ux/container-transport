import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { addBusinessDays, clearCalendarCache } from '@/lib/production-calendar';

const prisma = new PrismaClient();

// POST /api/production-calendar/recalculate - Recalculate all payment dates (admin only)
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

    // Get all orders with documentSubmissionDate and carrierPaymentDays
    const orders = await prisma.order.findMany({
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
      },
    });

    let updated = 0;
    let unchanged = 0;
    let errors = 0;
    const details: Array<{
      orderNumber: string;
      oldDate: string | null;
      newDate: string;
      changed: boolean;
    }> = [];

    // Clear cache to ensure fresh data
    clearCalendarCache();

    for (const order of orders) {
      try {
        if (!order.documentSubmissionDate || !order.carrierPaymentDays) continue;

        const newDate = await addBusinessDays(
          order.documentSubmissionDate,
          order.carrierPaymentDays
        );

        const oldDateStr = order.carrierExpectedPaymentDate
          ? order.carrierExpectedPaymentDate.toISOString().split('T')[0]
          : null;
        const newDateStr = newDate.toISOString().split('T')[0];

        const changed = oldDateStr !== newDateStr;

        if (changed) {
          await prisma.order.update({
            where: { id: order.id },
            data: { carrierExpectedPaymentDate: newDate },
          });
          updated++;
        } else {
          unchanged++;
        }

        details.push({
          orderNumber: order.orderNumber,
          oldDate: oldDateStr,
          newDate: newDateStr,
          changed,
        });
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
      details,
    });
  } catch (error) {
    console.error('[ProductionCalendar Recalculate API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate payment dates' },
      { status: 500 }
    );
  }
}
