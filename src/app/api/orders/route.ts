import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

// Schema for creating/updating orders
const orderSchema = z.object({
  loadingDatetime: z.string().transform((val) => new Date(val)),
  loadingCity: z.string().min(1, "Укажите город загрузки"),
  loadingAddress: z.string().min(1, "Укажите адрес загрузки"),
  unloadingCity: z.string().min(1, "Укажите город выгрузки"),
  unloadingAddress: z.string().min(1, "Укажите адрес выгрузки"),
  containerNumber: z.string().min(1, "Укажите номер контейнера"),
  containerTypeId: z.string().min(1, "Выберите тип контейнера"),
  cargoWeight: z.number().positive("Вес должен быть положительным числом"),
  status: z.enum(["NEW", "IN_PROGRESS", "DELIVERED", "CANCELLED"]).optional(),
  driverId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Generate unique order number
async function generateOrderNumber(): Promise<string> {
  const prefix = "ORD";
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  
  // Get count of orders this month
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const count = await db.order.count({
    where: {
      createdAt: {
        gte: startOfMonth,
      },
    },
  });
  
  const sequence = (count + 1).toString().padStart(4, "0");
  return `${prefix}-${year}${month}-${sequence}`;
}

// GET - List orders with filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const driverId = searchParams.get("driverId");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const exportCsv = searchParams.get("export") === "csv";

    // Build where clause
    const where: any = {};

    // Admin sees all orders, Manager sees only their own
    if (session.user.role === "MANAGER") {
      where.userId = session.user.id;
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (driverId && driverId !== "ALL") {
      where.driverId = driverId;
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { containerNumber: { contains: search } },
        { loadingCity: { contains: search } },
        { unloadingCity: { contains: search } },
      ];
    }

    if (dateFrom || dateTo) {
      where.loadingDatetime = {};
      if (dateFrom) {
        where.loadingDatetime.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.loadingDatetime.lte = new Date(dateTo);
      }
    }

    // Get total count
    const total = await db.order.count({ where });

    // Get orders
    const orders = await db.order.findMany({
      where,
      include: {
        containerType: true,
        driver: true,
        vehicle: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: exportCsv ? undefined : (page - 1) * limit,
      take: exportCsv ? undefined : limit,
    });

    // Export to CSV
    if (exportCsv) {
      const headers = [
        "Номер заявки",
        "Дата загрузки",
        "Город загрузки",
        "Адрес загрузки",
        "Город выгрузки",
        "Адрес выгрузки",
        "Номер контейнера",
        "Тип контейнера",
        "Вес груза (т)",
        "Статус",
        "Водитель",
        "Транспорт",
        "Примечания",
      ];

      const statusMap: Record<string, string> = {
        NEW: "Новая",
        IN_PROGRESS: "В пути",
        DELIVERED: "Доставлена",
        CANCELLED: "Отменена",
      };

      const rows = orders.map((order) => [
        order.orderNumber,
        order.loadingDatetime.toLocaleString("ru-RU"),
        order.loadingCity,
        order.loadingAddress,
        order.unloadingCity,
        order.unloadingAddress,
        order.containerNumber,
        order.containerType.name,
        order.cargoWeight.toString(),
        statusMap[order.status] || order.status,
        order.driver?.fullName || "",
        order.vehicle ? `${order.vehicle.vehicleNumber}${order.vehicle.trailerNumber ? ` / ${order.vehicle.trailerNumber}` : ""}` : "",
        order.notes || "",
      ]);

      const csvContent = [
        headers.join(";"),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(";")),
      ].join("\n");

      // Add BOM for Excel to recognize UTF-8
      const bom = "\uFEFF";
      const csvBuffer = Buffer.from(bom + csvContent, "utf-8");

      return new NextResponse(csvBuffer, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get orders error:", error);
    return NextResponse.json(
      { error: "Ошибка получения списка заявок" },
      { status: 500 }
    );
  }
}

// POST - Create new order
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = orderSchema.parse(body);

    // Generate order number
    const orderNumber = await generateOrderNumber();

    const order = await db.order.create({
      data: {
        orderNumber,
        loadingDatetime: data.loadingDatetime,
        loadingCity: data.loadingCity,
        loadingAddress: data.loadingAddress,
        unloadingCity: data.unloadingCity,
        unloadingAddress: data.unloadingAddress,
        containerNumber: data.containerNumber,
        containerTypeId: data.containerTypeId,
        cargoWeight: data.cargoWeight,
        status: data.status || "NEW",
        driverId: data.driverId,
        vehicleId: data.vehicleId,
        notes: data.notes,
        userId: session.user.id,
      },
      include: {
        containerType: true,
        driver: true,
        vehicle: true,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Create order error:", error);
    return NextResponse.json(
      { error: "Ошибка создания заявки" },
      { status: 500 }
    );
  }
}
