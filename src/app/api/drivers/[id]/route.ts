import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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

// PUT - Update driver
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
    const data = driverSchema.parse(body);

    const driver = await db.driver.update({
      where: { id },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        licenseNumber: data.licenseNumber,
        passportData: data.passportData,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(driver);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Update driver error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления водителя" },
      { status: 500 }
    );
  }
}

// DELETE - Delete driver (soft delete)
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
    const driver = await db.driver.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Водитель успешно удален" });
  } catch (error) {
    console.error("Delete driver error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления водителя" },
      { status: 500 }
    );
  }
}
