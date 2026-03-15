import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const containerTypeSchema = z.object({
  name: z.string().min(1, "Укажите название типа контейнера"),
  code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// PUT - Update container type
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
    const data = containerTypeSchema.parse(body);

    const containerType = await db.containerType.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(containerType);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Update container type error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления типа контейнера" },
      { status: 500 }
    );
  }
}

// DELETE - Delete container type (soft delete)
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
    await db.containerType.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Тип контейнера успешно удален" });
  } catch (error) {
    console.error("Delete container type error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления типа контейнера" },
      { status: 500 }
    );
  }
}
