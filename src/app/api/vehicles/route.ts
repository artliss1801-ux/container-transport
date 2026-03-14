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

// GET - List vehicles
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const vehicles = await db.vehicle.findMany({
      where: { isActive: true },
      orderBy: { vehicleNumber: "asc" },
    });

    return NextResponse.json(vehicles);
  } catch (error) {
    console.error("Get vehicles error:", error);
    return NextResponse.json(
      { error: "Ошибка получения списка транспорта" },
      { status: 500 }
    );
  }
}

// POST - Create vehicle (Admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json();
    const data = vehicleSchema.parse(body);

    const vehicle = await db.vehicle.create({
      data: {
        vehicleNumber: data.vehicleNumber,
        trailerNumber: data.trailerNumber,
        brand: data.brand,
        vehicleType: data.vehicleType,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(vehicle, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Create vehicle error:", error);
    return NextResponse.json(
      { error: "Ошибка создания транспортного средства" },
      { status: 500 }
    );
  }
}
