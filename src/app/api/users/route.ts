import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";

// Допустимые роли (должны совпадать с Prisma enum)
const VALID_ROLES = ["ADMIN", "LOGISTICS_MANAGER", "COMMERCIAL_MANAGER", "ACCOUNTANT", "LAWYER"] as const;

// GET - получить список пользователей (только для админа)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role && role !== "ALL") {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isTwoFactorEnabled: true,
          emailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { error: "Ошибка получения пользователей", details: error.message },
      { status: 500 }
    );
  }
}

// POST - создать нового пользователя (только для админа)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json();
    const { email, name, password, role } = body;

    console.log("POST user request:", { email, name, role });

    // Валидация
    if (!email || !password || !role) {
      return NextResponse.json(
        { error: "Email, пароль и роль обязательны" },
        { status: 400 }
      );
    }

    // Проверка валидности роли
    if (!VALID_ROLES.includes(role as any)) {
      return NextResponse.json(
        { error: `Недопустимая роль: ${role}. Допустимые роли: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // Проверяем, существует ли пользователь
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 400 }
      );
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 12);

    // Создаем пользователя
    const user = await db.user.create({
      data: {
        email,
        name: name || null,
        password: hashedPassword,
        role: role as any,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    console.log("User created successfully:", user);
    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Ошибка создания пользователя", details: error.message, code: error.code },
      { status: 500 }
    );
  }
}
