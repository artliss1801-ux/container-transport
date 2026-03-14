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
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Ошибка получения пользователя" },
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

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
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

    // Обновляем пользователя
    try {
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

      return NextResponse.json(user);
    } catch (updateError: any) {
      console.error("Prisma update error:", updateError);
      
      // Если ошибка связана с enum
      if (updateError.code === "P2009" || updateError.message?.includes("enum")) {
        return NextResponse.json(
          { 
            error: "Ошибка базы данных: роль не найдена в схеме. Выполните /api/migrate для обновления.",
            details: updateError.message 
          },
          { status: 500 }
        );
      }
      
      throw updateError;
    }
  } catch (error: any) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления пользователя", details: error.message || String(error) },
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
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления пользователя" },
      { status: 500 }
    );
  }
}
