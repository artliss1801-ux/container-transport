import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const clientUpdateSchema = z.object({
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

// GET - Get single client
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

    const client = await db.client.findUnique({
      where: { id },
    });

    if (!client) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("Get client error:", error);
    return NextResponse.json(
      { error: "Ошибка получения клиента" },
      { status: 500 }
    );
  }
}

// PUT - Update client
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Только ADMIN и COMMERCIAL_MANAGER могут редактировать клиентов
    if (session.user.role !== "ADMIN" && session.user.role !== "COMMERCIAL_MANAGER") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = clientUpdateSchema.parse(body);

    const existingClient = await db.client.findUnique({
      where: { id },
    });

    if (!existingClient) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    }

    const client = await db.client.update({
      where: { id },
      data: {
        name: data.name,
        inn: data.inn,
        kpp: data.kpp,
        address: data.address,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email,
        notes: data.notes,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Update client error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления клиента" },
      { status: 500 }
    );
  }
}

// DELETE - Delete client (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Только ADMIN и COMMERCIAL_MANAGER могут удалять клиентов
    if (session.user.role !== "ADMIN" && session.user.role !== "COMMERCIAL_MANAGER") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    const existingClient = await db.client.findUnique({
      where: { id },
    });

    if (!existingClient) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    }

    // Soft delete
    await db.client.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Клиент успешно удален" });
  } catch (error) {
    console.error("Delete client error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления клиента" },
      { status: 500 }
    );
  }
}
