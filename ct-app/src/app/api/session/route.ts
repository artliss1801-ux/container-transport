import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";

import { db } from "@/lib/db";

export async function GET() {
  try {
    const user = await getServerUser(request);
    
    if (!user) {
      return NextResponse.json({
        authenticated: false,
        message: "Не авторизован"
      });
    }

    // Получаем актуальные данные из базы
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
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
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      dbUser: dbUser,
      roleMatch: user.role === dbUser?.role,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}
