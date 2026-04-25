import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "container-transport-secret-key-2024-production";

export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/ct-session-token=([^;]+)/);
    
    if (!match) {
      return NextResponse.json({ authenticated: false });
    }
    
    const token = match[1];
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    // Get fresh user data
    const isClient = payload.role === "CLIENT";
    const user = await db.user.findUnique({
      where: { id: payload.id as string },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        customRoleName: true,
        dismissalDate: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
        image: true,
        canCreatePreliminary: true,
        hasKpiAccess: true,
        clientVisibleColumns: true,
        clientAccessEntries: isClient ? {
          select: { clientId: true },
        } : false,
      },
    });
    
    if (!user) {
      return NextResponse.json({ authenticated: false });
    }

    // Check if user is dismissed
    if (user.dismissalDate) {
      return NextResponse.json({ authenticated: false });
    }
    
    // Check if session is revoked (non-critical - skip on error)
    const sessionId = payload.sessionId as string | undefined;
    if (sessionId) {
      try {
        const loginRecord = await db.loginHistory.findUnique({
          where: { sessionId },
        });
        if (loginRecord?.isRevoked) {
          return NextResponse.json({ authenticated: false });
        }
      } catch (_e) {
        // Skip revocation check if query fails (e.g. pgbouncer issue)
      }
    }
    
    // Parse clientVisibleColumns from JSON string
    let parsedClientVisibleColumns: string[] | undefined;
    if (user.clientVisibleColumns) {
      try {
        parsedClientVisibleColumns = JSON.parse(user.clientVisibleColumns);
      } catch {
        parsedClientVisibleColumns = undefined;
      }
    }
    
    return NextResponse.json({
      authenticated: true,
      user: {
        ...user,
        clientVisibleColumns: parsedClientVisibleColumns,
        name: user.name || user.email.split("@")[0],
        sessionId,
        accessibleClientIds: isClient && user.clientAccessEntries
          ? user.clientAccessEntries.map(e => e.clientId)
          : undefined,
      },
    });
  } catch (error) {
    console.error("[Session-Info] Error:", error);
    return NextResponse.json({ authenticated: false });
  }
}
