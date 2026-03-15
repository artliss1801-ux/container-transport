import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const clientSchema = z.object({
  name: z.string().min(1, "Укажите наименование клиента"),
  inn: z.string().nullable().optional(),
  kpp: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET - List clients
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
        { inn: { contains: search, mode: "insensitive" } },
      ];
    }

    const clients = await db.client.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(clients);
  } catch (error) {
    console.error("Get clients error:", error);
    return NextResponse.json(
      { error: "Ошибка получения списка клиентов" },
      { status: 500 }
    );
  }
}

// POST - Create client (Admin and Commercial Manager only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Только ADMIN и COMMERCIAL_MANAGER могут добавлять клиентов
    if (session.user.role !== "ADMIN" && session.user.role !== "COMMERCIAL_MANAGER") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json();
    const data = clientSchema.parse(body);

    const client = await db.client.create({
      data: {
        name: data.name,
        inn: data.inn,
        kpp: data.kpp,
        address: data.address,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email,
        notes: data.notes,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Create client error:", error);
    return NextResponse.json(
      { error: "Ошибка создания клиента" },
      { status: 500 }
    );
  }
}
