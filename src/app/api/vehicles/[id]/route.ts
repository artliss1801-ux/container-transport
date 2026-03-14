import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const vehicleSchema = z.object({
  vehicleNumber: z.string().min(1, "Укажите госномер автомобиля"),
  trailerNumber: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  vehicleType: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// PUT - Update vehicle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = vehicleSchema.parse(body);

    const vehicle = await db.vehicle.update({
      where: { id },
      data: {
        vehicleNumber: data.vehicleNumber,
        trailerNumber: data.trailerNumber,
        brand: data.brand,
        vehicleType: data.vehicleType,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(vehicle);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Update vehicle error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления транспортного средства" },
      { status: 500 }
    );
  }
}

// DELETE - Delete vehicle (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    // Soft delete
    await db.vehicle.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Транспортное средство успешно удалено" });
  } catch (error) {
    console.error("Delete vehicle error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления транспортного средства" },
      { status: 500 }
    );
  }
}
