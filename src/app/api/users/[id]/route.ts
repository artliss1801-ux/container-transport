import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";

// Допустимые роли
const VALID_ROLES = [
  "ADMIN",
  "LOGISTICS_MANAGER",
  "COMMERCIAL_MANAGER",
  "ACCOUNTANT",
  "LAWYER",
] as const;

type Role = (typeof VALID_ROLES)[number];

// GET - получить пользователя по ID (только для админа)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    console.log("GET user - session:", session?.user?.email, session?.user?.role);

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isTwoFactorEnabled: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Ошибка получения пользователя", details: error.message },
      { status: 500 }
    );
  }
}

// PUT - обновить пользователя (только для админа)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    console.log("PUT user - session:", session?.user?.email, session?.user?.role);

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    console.log("PUT user - id:", id, "body:", body);

    const { email, name, password, role } = body;

    // Если передана роль, проверяем её валидность
    if (role && !VALID_ROLES.includes(role as Role)) {
      return NextResponse.json(
        { error: `Недопустимая роль: ${role}. Допустимые роли: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // Проверяем существование пользователя
    const existingUser = await db.user.findUnique({
      where: { id },
    });

    console.log("PUT user - existingUser:", existingUser?.email, existingUser?.role);

    if (!existingUser) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Если меняем email, проверяем на дубликат
    if (email && email !== existingUser.email) {
      const emailExists = await db.user.findUnique({
        where: { email },
      });
      if (emailExists) {
        return NextResponse.json(
          { error: "Пользователь с таким email уже существует" },
          { status: 400 }
        );
      }
    }

    // Подготавливаем данные для обновления
    const updateData: any = {};
    if (email) updateData.email = email;
    if (name !== undefined) updateData.name = name || null;
    if (role) updateData.role = role;
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }

    console.log("PUT user - updateData:", updateData);

    // Обновляем пользователя
    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true,
      },
    });

    console.log("PUT user - result:", user);
    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления пользователя", details: error.message, code: error.code },
      { status: 500 }
    );
  }
}

// DELETE - удалить пользователя (только для админа)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    // Нельзя удалить самого себя
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Нельзя удалить свой аккаунт" },
        { status: 400 }
      );
    }

    // Проверяем существование пользователя
    const existingUser = await db.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Удаляем пользователя
    await db.user.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Пользователь удален" });
  } catch (error: any) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления пользователя", details: error.message },
      { status: 500 }
    );
  }
}
