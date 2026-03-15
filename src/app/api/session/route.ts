import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({
        authenticated: false,
        message: "Не авторизован"
      });
    }

    // Получаем актуальные данные из базы
    const dbUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return NextResponse.json({
      authenticated: true,
      sessionUser: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
      dbUser: dbUser,
      roleMatch: session.user.role === dbUser?.role,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}
