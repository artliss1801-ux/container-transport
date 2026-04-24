import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Internal endpoint for session cleanup — called by cron script
// No auth required — only accessible from localhost via Nginx or container network
export async function POST() {
  try {
    const now = new Date();
    const results: Record<string, number> = {};

    // 1. JWT tokens expire after 24 hours — close sessions older than 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expired = await db.loginHistory.updateMany({
      where: {
        success: true,
        isRevoked: false,
        sessionId: { not: null },
        loginAt: { lt: twentyFourHoursAgo },
      },
      data: { isRevoked: true, revokedAt: now },
    });
    results.expiredJwt = expired.count;

    // 2. Get the inactivity timeout from SystemSetting (default 30 min)
    let timeoutMinutes = 30;
    try {
      const rows = await db.$queryRawUnsafe(
        `SELECT value FROM "SystemSetting" WHERE key = 'session_timeout_minutes' LIMIT 1`
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const parsed = parseInt((rows[0] as any).value, 10);
        if (!isNaN(parsed) && parsed > 0) timeoutMinutes = parsed;
      }
    } catch {}

    // 3. Close sessions with lastActivity older than timeout
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const inactiveWithActivity = await db.loginHistory.updateMany({
      where: {
        success: true,
        isRevoked: false,
        sessionId: { not: null },
        lastActivity: { not: null, lt: cutoff },
      },
      data: { isRevoked: true, revokedAt: now },
    });
    results.inactiveWithActivity = inactiveWithActivity.count;

    // 4. Close sessions where lastActivity is NULL and loginAt older than timeout
    const inactiveNoActivity = await db.loginHistory.updateMany({
      where: {
        success: true,
        isRevoked: false,
        sessionId: { not: null },
        lastActivity: null,
        loginAt: { lt: cutoff },
      },
      data: { isRevoked: true, revokedAt: now },
    });
    results.inactiveNoActivity = inactiveNoActivity.count;

    const total = expired.count + inactiveWithActivity.count + inactiveNoActivity.count;

    if (total > 0) {
      console.log(
        `[SessionCleanup] Revoked ${total} sessions (JWT-expired: ${expired.count}, inactive: ${inactiveWithActivity.count + inactiveNoActivity.count}, timeout: ${timeoutMinutes}min)`
      );
    }

    return NextResponse.json({ ok: true, revoked: total, details: results, timeoutMinutes });
  } catch (error: any) {
    console.error("[SessionCleanup] Error:", error?.message || error);
    return NextResponse.json({ ok: false, error: error?.message || "unknown" }, { status: 500 });
  }
}
