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

// GET - List container types
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const containerTypes = await db.containerType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(containerTypes);
  } catch (error) {
    console.error("Get container types error:", error);
    return NextResponse.json(
      { error: "Ошибка получения списка типов контейнеров" },
      { status: 500 }
    );
  }
}

// POST - Create container type (Admin only)
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
    const data = containerTypeSchema.parse(body);

    const containerType = await db.containerType.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(containerType, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Create container type error:", error);
    return NextResponse.json(
      { error: "Ошибка создания типа контейнера" },
      { status: 500 }
    );
  }
}
