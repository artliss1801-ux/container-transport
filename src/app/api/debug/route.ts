import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // Проверяем подключение к базе
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
      },
      take: 5,
    });

    const containerTypes = await db.containerType.count();
    const drivers = await db.driver.count();
    const vehicles = await db.vehicle.count();

    return NextResponse.json({
      status: "ok",
      database: "connected",
      counts: {
        users: users.length,
        containerTypes,
        drivers,
        vehicles,
      },
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
      })),
    });
  } catch (error: any) {
    console.error("Debug error:", error);
    return NextResponse.json({
      status: "error",
      error: error.message,
      code: error.code,
    }, { status: 500 });
  }
}
