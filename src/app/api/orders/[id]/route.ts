import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const orderUpdateSchema = z.object({
  loadingDatetime: z.string().transform((val) => new Date(val)),
  loadingCity: z.string().min(1, "Укажите город загрузки"),
  loadingAddress: z.string().min(1, "Укажите адрес загрузки"),
  unloadingCity: z.string().min(1, "Укажите город выгрузки"),
  unloadingAddress: z.string().min(1, "Укажите адрес выгрузки"),
  containerNumber: z.string().min(1, "Укажите номер контейнера"),
  containerTypeId: z.string().min(1, "Выберите тип контейнера"),
  cargoWeight: z.number().positive("Вес должен быть положительным числом"),
  status: z.enum(["NEW", "IN_PROGRESS", "DELIVERED", "CANCELLED"]),
  driverId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// GET - Get single order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
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
    });

    if (!order) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    // Check access
    if (session.user.role === "MANAGER" && order.userId !== session.user.id) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json(
      { error: "Ошибка получения заявки" },
      { status: 500 }
    );
  }
}

// PUT - Update order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = orderUpdateSchema.parse(body);

    // Check if order exists
    const existingOrder = await db.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    // Check access
    if (session.user.role === "MANAGER" && existingOrder.userId !== session.user.id) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const order = await db.order.update({
      where: { id },
      data: {
        loadingDatetime: data.loadingDatetime,
        loadingCity: data.loadingCity,
        loadingAddress: data.loadingAddress,
        unloadingCity: data.unloadingCity,
        unloadingAddress: data.unloadingAddress,
        containerNumber: data.containerNumber,
        containerTypeId: data.containerTypeId,
        cargoWeight: data.cargoWeight,
        status: data.status,
        driverId: data.driverId,
        vehicleId: data.vehicleId,
        notes: data.notes,
      },
      include: {
        containerType: true,
        driver: true,
        vehicle: true,
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Update order error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления заявки" },
      { status: 500 }
    );
  }
}

// DELETE - Delete order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;

    // Check if order exists
    const existingOrder = await db.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    // Check access - only Admin can delete
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    await db.order.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Заявка успешно удалена" });
  } catch (error) {
    console.error("Delete order error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления заявки" },
      { status: 500 }
    );
  }
}
