import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { db } from "@/lib/db";
import { unblockUser, revokeSession, revokeAllUserSessions } from "@/lib/login-history";

export const dynamic = "force-dynamic";

// Auto-cleanup function - mark expired and inactive sessions as revoked
async function cleanupExpiredSessions() {
  try {
    const now = new Date();

    // 1. JWT tokens expire after 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Mark old sessions as revoked (24h+ since login)
    const expiredResult = await db.loginHistory.updateMany({
      where: {
        success: true,
        isRevoked: false,
        sessionId: { not: null },
        loginAt: { lt: twentyFourHoursAgo },
      },
      data: {
        isRevoked: true,
        revokedAt: now,
      },
    });

    if (expiredResult.count > 0) {
      console.log(`[Cleanup] Marked ${expiredResult.count} expired sessions (24h+) as revoked`);
    }

    // 2. Close sessions inactive for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Sessions where lastActivity is set and older than 30 min
    const inactiveWithActivity = await db.loginHistory.updateMany({
      where: {
        success: true,
        isRevoked: false,
        sessionId: { not: null },
        lastActivity: { not: null, lt: thirtyMinutesAgo },
      },
      data: {
        isRevoked: true,
        revokedAt: now,
      },
    });

    // Sessions where lastActivity is NOT set (never updated) and loginAt is older than 30 min
    const inactiveNoActivity = await db.loginHistory.updateMany({
      where: {
        success: true,
        isRevoked: false,
        sessionId: { not: null },
        lastActivity: null,
        loginAt: { lt: thirtyMinutesAgo },
      },
      data: {
        isRevoked: true,
        revokedAt: now,
      },
    });

    const totalInactive = inactiveWithActivity.count + inactiveNoActivity.count;
    if (totalInactive > 0) {
      console.log(`[Cleanup] Marked ${totalInactive} inactive sessions (30min+) as revoked`);
    }

    return expiredResult.count + totalInactive;
  } catch (error) {
    console.error("[Cleanup] Error cleaning up expired sessions:", error);
    return 0;
  }
}

// GET - get active sessions or blocked users (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Check if user is admin
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    
    if (type === "blocked") {
      // Get blocked users (users with revoked sessions)
      const blockedUsers = await db.user.findMany({
        where: {
          revokedSessions: {
            some: {},
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              revokedSessions: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      return NextResponse.json({ blockedUsers });
    }
    
    if (type === "active") {
      // Auto-cleanup expired sessions first
      await cleanupExpiredSessions();
      
      // Get ALL active sessions (not grouped) - admin sees each session individually
      // Show sessions from last 24 hours (JWT lifetime)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const activeSessions = await db.loginHistory.findMany({
        where: {
          success: true,
          isRevoked: false,
          sessionId: { not: null },
          loginAt: { gte: twentyFourHoursAgo },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { loginAt: "desc" },
        take: 100,
      });
      
      return NextResponse.json({ activeSessions });
    }
    
    return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
  } catch (error) {
    console.error("Error fetching data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - unblock a user (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Check if user is admin
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const body = await request.json();
    const { action, userId } = body;
    
    if (action === "unblock" && userId) {
      console.log(`[Security] Attempting to unblock user ${userId}`);
      
      // Check current blocked status
      const beforeCount = await db.revokedSession.count({
        where: { userId },
      });
      console.log(`[Security] User ${userId} has ${beforeCount} revoked session records before unblock`);
      
      // Use the unblockUser function which properly clears all revocation data
      const result = await unblockUser(userId);
      
      if (!result.success) {
        console.error(`[Security] Failed to unblock user ${userId}:`, result.error);
        return NextResponse.json({ error: result.error || "Failed to unblock user" }, { status: 500 });
      }
      
      // Verify deletion
      const afterCount = await db.revokedSession.count({
        where: { userId },
      });
      console.log(`[Security] User ${userId} has ${afterCount} revoked session records after unblock`);
      
      return NextResponse.json({ 
        success: true, 
        message: "Пользователь разблокирован",
        deletedRecords: beforeCount - afterCount
      });
    }
    
    // Block user (revoke all sessions)
    if (action === "block" && userId) {
      // Create revocation record
      await db.revokedSession.create({
        data: { userId },
      });
      
      // Mark all sessions as revoked
      await db.loginHistory.updateMany({
        where: {
          userId,
          success: true,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });
      
      console.log(`[Security] User ${userId} blocked`);
      return NextResponse.json({ 
        success: true, 
        message: "Пользователь заблокирован" 
      });
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error processing action:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - revoke a specific session (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getServerUser(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Check if user is admin
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const userId = searchParams.get("userId");
    
    // Revoke a specific session
    if (sessionId) {
      const result = await revokeSession(sessionId);
      
      if (!result.success) {
        return NextResponse.json({ error: result.error || "Failed to revoke session" }, { status: 400 });
      }
      
      console.log(`[Security] Session ${sessionId} revoked`);
      return NextResponse.json({ 
        success: true, 
        message: "Сессия заблокирована" 
      });
    }
    
    // Revoke all sessions for a user
    if (userId) {
      const result = await revokeAllUserSessions(userId);
      
      if (!result.success) {
        return NextResponse.json({ error: result.error || "Failed to revoke sessions" }, { status: 500 });
      }
      
      console.log(`[Security] All sessions revoked for user ${userId}, count: ${result.count}`);
      return NextResponse.json({ 
        success: true, 
        message: "Все сессии заблокированы",
        count: result.count 
      });
    }
    
    return NextResponse.json({ error: "Missing sessionId or userId parameter" }, { status: 400 });
  } catch (error) {
    console.error("Error revoking session:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
