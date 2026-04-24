import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";

// In-memory lock storage
interface OrderLock {
  orderId: string;
  userId: string;
  userName: string;
  lockedAt: number;
  lastHeartbeat: number;
}

const locks = new Map<string, OrderLock>();

const HEARTBEAT_TIMEOUT = 15 * 1000; // 15 секунд без heartbeat = автоматическое снятие

// Очистка просроченных замков
function cleanupExpiredLocks() {
  const now = Date.now();
  for (const [key, lock] of locks.entries()) {
    if (now - lock.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      locks.delete(key);
    }
  }
}

// GET - Проверить, заблокирована ли заявка
export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json({ error: "Укажите orderId" }, { status: 400 });
    }

    cleanupExpiredLocks();

    const lock = locks.get(orderId);
    if (!lock) {
      return NextResponse.json({ locked: false });
    }

    // Если текущий пользователь — владелец замка, возвращаем информацию
    if (lock.userId === user.id) {
      return NextResponse.json({ locked: true, isOwner: true });
    }

    // Иначе — заявка заблокирована другим пользователем
    return NextResponse.json(
      {
        locked: true,
        isOwner: false,
        lockedBy: lock.userName,
        lockedAt: lock.lockedAt,
      },
      { status: 409 }
    );
  } catch (error) {
    console.error("[order-locks] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка проверки блокировки" },
      { status: 500 }
    );
  }
}

// POST - Захватить/обновить замок
export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: "Укажите orderId" }, { status: 400 });
    }

    cleanupExpiredLocks();

    const existing = locks.get(orderId);

    // Если замок уже существует и принадлежит другому пользователю
    if (existing && existing.userId !== user.id) {
      return NextResponse.json(
        {
          locked: true,
          lockedBy: existing.userName,
          lockedAt: existing.lockedAt,
        },
        { status: 409 }
      );
    }

    // Устанавливаем или обновляем замок
    const now = Date.now();
    locks.set(orderId, {
      orderId,
      userId: user.id,
      userName: user.name || user.email || "Неизвестный пользователь",
      lockedAt: existing ? existing.lockedAt : now,
      lastHeartbeat: now,
    });

    return NextResponse.json({ locked: true, isOwner: true });
  } catch (error) {
    console.error("[order-locks] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка установки блокировки" },
      { status: 500 }
    );
  }
}

// DELETE - Снять замок
export async function DELETE(request: NextRequest) {
  try {
    const user = await getServerUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json({ error: "Укажите orderId" }, { status: 400 });
    }

    const lock = locks.get(orderId);

    // Только владелец или отсутствие замка
    if (lock && lock.userId !== user.id) {
      return NextResponse.json(
        { error: "Невозможно снять чужую блокировку" },
        { status: 403 }
      );
    }

    locks.delete(orderId);
    return NextResponse.json({ locked: false });
  } catch (error) {
    console.error("[order-locks] DELETE error:", error);
    return NextResponse.json(
      { error: "Ошибка снятия блокировки" },
      { status: 500 }
    );
  }
}
