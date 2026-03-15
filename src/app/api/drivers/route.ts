import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const driverSchema = z.object({
  fullName: z.string().min(2, "ФИО должно содержать минимум 2 символа"),
  phone: z.string().nullable().optional(),
  licenseNumber: z.string().nullable().optional(),
  passportData: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET - List drivers
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const drivers = await db.driver.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
    });

    return NextResponse.json(drivers);
  } catch (error) {
    console.error("Get drivers error:", error);
    return NextResponse.json(
      { error: "Ошибка получения списка водителей" },
      { status: 500 }
    );
  }
}

// POST - Create driver (Admin only)
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
    const data = driverSchema.parse(body);

    const driver = await db.driver.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        licenseNumber: data.licenseNumber,
        passportData: data.passportData,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(driver, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Create driver error:", error);
    return NextResponse.json(
      { error: "Ошибка создания водителя" },
      { status: 500 }
    );
  }
}
