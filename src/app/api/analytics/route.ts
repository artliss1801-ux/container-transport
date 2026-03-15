import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

// GET - Get analytics data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Менеджер по логистике видит только свои заявки
    const where: any = {};
    if (session.user.role === "LOGISTICS_MANAGER") {
      where.userId = session.user.id;
    }

    // Get orders by status
    const ordersByStatus = await db.order.groupBy({
      by: ["status"],
      where,
      _count: true,
    });

    // Get daily orders for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const orders = await db.order.findMany({
      where: {
        ...where,
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      select: {
        createdAt: true,
      },
    });

    // Group by date
    const dailyOrders: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      dailyOrders[dateStr] = 0;
    }

    orders.forEach((order) => {
      const dateStr = order.createdAt.toISOString().split("T")[0];
      if (dailyOrders[dateStr] !== undefined) {
        dailyOrders[dateStr]++;
      }
    });

    // Convert to array sorted by date
    const dailyOrdersArray = Object.entries(dailyOrders)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({
        date,
        count,
      }));

    // Get total counts
    const totalOrders = await db.order.count({ where });
    const newOrders = await db.order.count({ where: { ...where, status: "NEW" } });
    const inProgressOrders = await db.order.count({ where: { ...where, status: "IN_PROGRESS" } });
    const deliveredOrders = await db.order.count({ where: { ...where, status: "DELIVERED" } });
    const cancelledOrders = await db.order.count({ where: { ...where, status: "CANCELLED" } });

    // Get total weight
    const totalWeightResult = await db.order.aggregate({
      where,
      _sum: {
        cargoWeight: true,
      },
    });
    const totalWeight = totalWeightResult._sum.cargoWeight || 0;

    // Status labels in Russian
    const statusLabels: Record<string, string> = {
      NEW: "Новые",
      IN_PROGRESS: "В пути",
      DELIVERED: "Доставлены",
      CANCELLED: "Отменены",
    };

    const statusData = ordersByStatus.map((item) => ({
      name: statusLabels[item.status] || item.status,
      value: item._count,
      status: item.status,
    }));

    return NextResponse.json({
      statusData,
      dailyOrders: dailyOrdersArray,
      summary: {
        totalOrders,
        newOrders,
        inProgressOrders,
        deliveredOrders,
        cancelledOrders,
        totalWeight,
      },
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    return NextResponse.json(
      { error: "Ошибка получения аналитики" },
      { status: 500 }
    );
  }
}
