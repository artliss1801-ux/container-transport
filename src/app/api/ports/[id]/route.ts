import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const portUpdateSchema = z.object({
  name: z.string().min(1, "Укажите название порта"),
  code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET - Get single port
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

    const port = await db.port.findUnique({
      where: { id },
    });

    if (!port) {
      return NextResponse.json({ error: "Порт не найден" }, { status: 404 });
    }

    return NextResponse.json(port);
  } catch (error) {
    console.error("Get port error:", error);
    return NextResponse.json(
      { error: "Ошибка получения порта" },
      { status: 500 }
    );
  }
}

// PUT - Update port
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Только ADMIN может редактировать порты
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = portUpdateSchema.parse(body);

    const existingPort = await db.port.findUnique({
      where: { id },
    });

    if (!existingPort) {
      return NextResponse.json({ error: "Порт не найден" }, { status: 404 });
    }

    const port = await db.port.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        country: data.country,
        notes: data.notes,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(port);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Update port error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления порта" },
      { status: 500 }
    );
  }
}

// DELETE - Delete port (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Только ADMIN может удалять порты
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    const existingPort = await db.port.findUnique({
      where: { id },
    });

    if (!existingPort) {
      return NextResponse.json({ error: "Порт не найден" }, { status: 404 });
    }

    // Soft delete
    await db.port.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Порт успешно удален" });
  } catch (error) {
    console.error("Delete port error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления порта" },
      { status: 500 }
    );
  }
}
