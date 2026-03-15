import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

// Helper to parse date string (handles empty strings)
const parseDate = (val: string | null | undefined): Date | null => {
  if (!val || val.trim() === "") return null;
  const date = new Date(val);
  return isNaN(date.getTime()) ? null : date;
};

// Schema for creating/updating orders
const orderSchema = z.object({
  client: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  port: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  loadingDatetime: z.string().min(1, "Укажите дату и время загрузки").transform((val) => new Date(val)),
  loadingCity: z.string().min(1, "Укажите город загрузки"),
  loadingAddress: z.string().min(1, "Укажите адрес загрузки"),
  unloadingDatetime: z.string().transform(val => parseDate(val)).nullable().optional(),
  unloadingCity: z.string().min(1, "Укажите город выгрузки"),
  unloadingAddress: z.string().min(1, "Укажите адрес выгрузки"),
  containerNumber: z.string().min(1, "Укажите номер контейнера"),
  containerTypeId: z.string().min(1, "Выберите тип контейнера"),
  cargoWeight: z.number().positive("Вес должен быть положительным числом"),
  status: z.string().default("NEW"),
  driverId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  vehicleId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  carrier: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  clientRate: z.number().nullable().optional(),
  carrierRate: z.number().nullable().optional(),
  carrierPaymentDueDate: z.string().transform(val => parseDate(val)).nullable().optional(),
  deliveryDate: z.string().transform(val => parseDate(val)).nullable().optional(),
  emptyContainerReturnDate: z.string().transform(val => parseDate(val)).nullable().optional(),
  documentSubmissionDate: z.string().transform(val => parseDate(val)).nullable().optional(),
  notes: z.string().transform(val => val === "" ? null : val).nullable().optional(),
});

// Generate unique order number
async function generateOrderNumber(): Promise<string> {
  const prefix = "ORD";
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  
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

    const where: any = {};

    // Менеджер по логистике видит только свои заявки
    if (session.user.role === "LOGISTICS_MANAGER") {
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
        { client: { contains: search } },
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

    const total = await db.order.count({ where });

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

    if (exportCsv) {
      const headers = [
        "Клиент",
        "Порт",
        "Номер контейнера",
        "Тип контейнера",
        "Вес (кг)",
        "Дата погрузки",
        "Статус",
        "Примечания",
        "Номер заявки",
        "Маршрут",
        "Дата доставки",
        "Водитель",
        "Телефон",
        "Перевозчик",
        "Ставка клиента",
        "Ставка перевозчика",
        "Срок оплаты",
        "Дата сдачи порожнего",
        "Дата сдачи документов",
      ];

      const statusMap: Record<string, string> = {
        NEW: "Новая",
        IN_PROGRESS: "В пути",
        DELIVERED: "Доставлена",
        CANCELLED: "Отменена",
      };

      const rows = orders.map((order) => [
        order.client || "",
        order.port || "",
        order.containerNumber,
        order.containerType.name,
        order.cargoWeight.toString(),
        order.loadingDatetime.toLocaleString("ru-RU"),
        statusMap[order.status] || order.status,
        order.notes || "",
        order.orderNumber,
        `${order.loadingCity} → ${order.unloadingCity}`,
        order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("ru-RU") : "",
        order.driver?.fullName || "",
        order.driver?.phone || "",
        order.carrier || "",
        order.clientRate?.toString() || "",
        order.carrierRate?.toString() || "",
        order.carrierPaymentDueDate ? new Date(order.carrierPaymentDueDate).toLocaleDateString("ru-RU") : "",
        order.emptyContainerReturnDate ? new Date(order.emptyContainerReturnDate).toLocaleDateString("ru-RU") : "",
        order.documentSubmissionDate ? new Date(order.documentSubmissionDate).toLocaleDateString("ru-RU") : "",
      ]);

      const csvContent = [
        headers.join(";"),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(";")),
      ].join("\n");

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

    const orderNumber = await generateOrderNumber();

    const order = await db.order.create({
      data: {
        orderNumber,
        client: data.client,
        port: data.port,
        loadingDatetime: data.loadingDatetime,
        loadingCity: data.loadingCity,
        loadingAddress: data.loadingAddress,
        unloadingDatetime: data.unloadingDatetime,
        unloadingCity: data.unloadingCity,
        unloadingAddress: data.unloadingAddress,
        containerNumber: data.containerNumber,
        containerTypeId: data.containerTypeId,
        cargoWeight: data.cargoWeight,
        status: data.status || "NEW",
        driverId: data.driverId,
        vehicleId: data.vehicleId,
        carrier: data.carrier,
        clientRate: data.clientRate,
        carrierRate: data.carrierRate,
        carrierPaymentDueDate: data.carrierPaymentDueDate,
        deliveryDate: data.deliveryDate,
        emptyContainerReturnDate: data.emptyContainerReturnDate,
        documentSubmissionDate: data.documentSubmissionDate,
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
