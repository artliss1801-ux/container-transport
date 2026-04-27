import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { clearCalendarCache, getCalendarEntries } from '@/lib/production-calendar';

const prisma = new PrismaClient();

// GET /api/production-calendar - Get production calendar entries
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined;

    const entries = await getCalendarEntries(year, month);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('[ProductionCalendar API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch production calendar' },
      { status: 500 }
    );
  }
}

// POST /api/production-calendar - Add a new calendar entry (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permission
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, customRoles: true },
    });

    if (!user || (user.role !== 'ADMIN' && user.customRoles?.name !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { date, type, title, isNonWorking } = body;

    if (!date || !type) {
      return NextResponse.json(
        { error: 'Date and type are required' },
        { status: 400 }
      );
    }

    const dateObj = new Date(date);
    const year = dateObj.getFullYear();

    // Upsert: create or update
    const entry = await prisma.productionCalendar.upsert({
      where: { date: dateObj },
      create: {
        id: crypto.randomUUID(),
        date: dateObj,
        type,
        title: title || '',
        isNonWorking: isNonWorking ?? true,
        year,
      },
      update: {
        type,
        title: title || '',
        isNonWorking: isNonWorking ?? true,
      },
    });

    clearCalendarCache();

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('[ProductionCalendar API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create calendar entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/production-calendar - Remove a calendar entry (admin only)
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter is required' },
        { status: 400 }
      );
    }

    await prisma.productionCalendar.delete({
      where: { date: new Date(date) },
    });

    clearCalendarCache();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[ProductionCalendar API] DELETE error:', error);
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete calendar entry' },
      { status: 500 }
    );
  }
}

// PATCH /api/production-calendar - Update a calendar entry (admin only)
export async function PATCH(request: NextRequest) {
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
    const { date, type, title, isNonWorking } = body;

    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (type !== undefined) updateData.type = type;
    if (title !== undefined) updateData.title = title;
    if (isNonWorking !== undefined) updateData.isNonWorking = isNonWorking;

    const entry = await prisma.productionCalendar.update({
      where: { date: new Date(date) },
      data: updateData,
    });

    clearCalendarCache();

    return NextResponse.json({ entry });
  } catch (error: any) {
    console.error('[ProductionCalendar API] PATCH error:', error);
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update calendar entry' },
      { status: 500 }
    );
  }
}
