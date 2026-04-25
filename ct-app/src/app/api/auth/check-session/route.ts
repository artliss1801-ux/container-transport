import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db, withRetry } from "@/lib/db";

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "container-transport-secret-key-2024-production";
const IS_DEMO = process.env.NEXT_PUBLIC_IS_DEMO === "true";
const DEMO_TIMEOUT_MS = (parseInt(process.env.NEXT_PUBLIC_DEMO_TIMEOUT_MINUTES || "120", 10)) * 60 * 1000;
const DEMO_ADMIN_EMAIL = "demo@containertrans.ru";

export const dynamic = "force-dynamic";

// ── In-memory session cache ─────────────────────────────────────────
// Avoids hitting the DB on every 30s poll. A session that was valid
// recently is almost certainly still valid, so we cache the result.
// Each serverless function instance has its own cache (per-process).
interface CachedSession {
  revoked: boolean;
  timeoutMinutes: number;
  updatedAt: number;
}
const sessionCache = new Map<string, CachedSession>();
const CACHE_TTL_MS = 15_000; // 15 seconds — fast revocation detection

function getCached(sessionId: string): CachedSession | null {
  const entry = sessionCache.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
    sessionCache.delete(sessionId);
    return null;
  }
  return entry;
}

function setCache(sessionId: string, revoked: boolean, timeoutMinutes: number) {
  sessionCache.set(sessionId, { revoked, timeoutMinutes, updatedAt: Date.now() });
  // Prune old entries to prevent memory leak
  if (sessionCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of sessionCache) {
      if (now - val.updatedAt > CACHE_TTL_MS) sessionCache.delete(key);
    }
  }
}
// ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/ct-session-token=([^;]+)/);
    if (!match) return NextResponse.json({ revoked: true });

    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(match[1], secret);
    if (!payload.id) return NextResponse.json({ revoked: false });

    const sessionId = (payload.sessionId as string) || "";
    const userId = payload.id as string;

    // Check if the frontend reports real user activity (clicks, keypresses, etc.)
    const { searchParams } = new URL(request.url);
    const hasUserActivity = searchParams.get("active") === "true";
    const isGoingOffline = searchParams.get("offline") === "true";

    // ── Fast path: return cached result if available and not stale ──
    // Skip cache if we need to check inactivity timeout (don't miss a stale session)
    if (sessionId && !hasUserActivity) {
      const cached = getCached(sessionId);
      if (cached && !cached.revoked) {
        // Even with cached valid result, check inactivity on the server
        // We'll do a lightweight check below (without the full DB query when cache hit)
        // Fall through to the inactivity check below
      } else if (cached && cached.revoked) {
        return NextResponse.json({ revoked: true, sessionTimeoutMinutes: cached.timeoutMinutes });
      }
    }

    // ── Inactivity timeout (default 30 min) ──
    let INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
    try {
      const settingRows = await withRetry(() => db.$queryRawUnsafe(
        `SELECT value FROM "SystemSetting" WHERE key = 'session_timeout_minutes' LIMIT 1`
      ));
      if (Array.isArray(settingRows) && settingRows.length > 0) {
        const minutes = parseInt((settingRows[0] as any).value, 10);
        if (!isNaN(minutes) && minutes > 0) {
          INACTIVITY_TIMEOUT_MS = minutes * 60 * 1000;
        }
      }
    } catch (_e) {}

    const timeoutMinutes = Math.round(INACTIVITY_TIMEOUT_MS / 60000);

    // ── Check session revoked + user dismissed in ONE query ──
    if (sessionId) {
      try {
        const loginRecord = await withRetry(() => db.loginHistory.findUnique({
          where: { sessionId },
          select: { isRevoked: true, lastActivity: true, loginAt: true, user: { select: { dismissalDate: true, email: true } } },
        }));
        if (loginRecord?.isRevoked) {
          setCache(sessionId, true, timeoutMinutes);
          return NextResponse.json({ revoked: true, sessionTimeoutMinutes: timeoutMinutes });
        }

        // Check user dismissed via the relation we already loaded
        if (loginRecord?.user?.dismissalDate) {
          setCache(sessionId, true, timeoutMinutes);
          return NextResponse.json({ revoked: true, sessionTimeoutMinutes: timeoutMinutes });
        }

        // ── Demo mode: hard timeout for non-admin demo users ──
        if (IS_DEMO && loginRecord?.loginAt && loginRecord?.user?.email !== DEMO_ADMIN_EMAIL) {
          const demoElapsedMs = Date.now() - new Date(loginRecord.loginAt).getTime();
          if (demoElapsedMs > DEMO_TIMEOUT_MS) {
            // Revoke the current session
            await withRetry(() => db.loginHistory.update({
              where: { sessionId },
              data: { isRevoked: true, revokedAt: new Date() },
            }));
            // Permanently block the user by creating a RevokedSession entry
            // This prevents the user from logging back in
            const existingBlock = await withRetry(() => db.revokedSession.findFirst({
              where: { userId },
            }));
            if (!existingBlock) {
              await withRetry(() => db.revokedSession.create({
                data: { userId },
              }));
            }
            console.log(`[Check-Session] Demo session ${sessionId} expired (${Math.round(demoElapsedMs / 60000)} min), user ${userId} blocked`);
            setCache(sessionId, true, timeoutMinutes);
            return NextResponse.json({ revoked: true, sessionTimeoutMinutes: timeoutMinutes });
          }
        }

        // Check inactivity timeout
        const lastActiveTime = loginRecord?.lastActivity || loginRecord?.loginAt;
        if (lastActiveTime) {
          const inactiveMs = Date.now() - new Date(lastActiveTime).getTime();
          if (inactiveMs > INACTIVITY_TIMEOUT_MS) {
            await withRetry(() => db.loginHistory.update({
              where: { sessionId },
              data: { isRevoked: true, revokedAt: new Date() },
            }));
            console.log(`[Check-Session] Session ${sessionId} revoked due to inactivity (${Math.round(inactiveMs / 60000)} min)`);
            setCache(sessionId, true, timeoutMinutes);
            return NextResponse.json({ revoked: true, sessionTimeoutMinutes: timeoutMinutes });
          }
        }

        // Update lastActivity only when user actually interacted
        if (hasUserActivity) {
          await withRetry(() => db.loginHistory.update({
            where: { sessionId },
            data: { lastActivity: new Date() },
          }));
        }

        // When user is closing tab/navigating away, set lastActivity to past
        // so they disappear from the online users bar immediately
        if (isGoingOffline) {
          await withRetry(() => db.loginHistory.update({
            where: { sessionId },
            data: { lastActivity: new Date(Date.now() - 10 * 60 * 1000) }, // 10 minutes ago — outside 30s threshold
          }));
          return NextResponse.json({ revoked: false, sessionTimeoutMinutes: timeoutMinutes });
        }
      } catch (_e) {}
    }

    // Check user blocked
    try {
      const revokedCount = await withRetry(() => db.revokedSession.count({
        where: { userId },
      }));
      if (revokedCount > 0) {
        if (sessionId) setCache(sessionId, true, timeoutMinutes);
        return NextResponse.json({ revoked: true, sessionTimeoutMinutes: timeoutMinutes });
      }
    } catch (_e) {}

    // ── Cache the valid result ──
    if (sessionId) setCache(sessionId, false, timeoutMinutes);

    return NextResponse.json({ revoked: false, sessionTimeoutMinutes: timeoutMinutes });
  } catch (_error) {
    return NextResponse.json({ revoked: true, sessionTimeoutMinutes: 30 });
  }
}
