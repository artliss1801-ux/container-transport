import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    return NextResponse.json({
      status: "ok",
      database: "connected",
      users: users,
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      error: error.message,
    }, { status: 500 });
  }
}
