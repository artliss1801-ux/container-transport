import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const portSchema = z.object({
  name: z.string().min(1, "Укажите название порта"),
  code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET - List ports
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const where: any = { isActive: true };
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    const ports = await db.port.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(ports);
  } catch (error) {
    console.error("Get ports error:", error);
    return NextResponse.json(
      { error: "Ошибка получения списка портов" },
      { status: 500 }
    );
  }
}

// POST - Create port (Admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Только ADMIN может добавлять порты
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json();
    const data = portSchema.parse(body);

    const port = await db.port.create({
      data: {
        name: data.name,
        code: data.code,
        country: data.country,
        notes: data.notes,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(port, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Create port error:", error);
    return NextResponse.json(
      { error: "Ошибка создания порта" },
      { status: 500 }
    );
  }
}
