import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Clear all RevokedSession records and reset isRevoked flags
// This allows all previously blocked users to log in again
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
    
    // Delete all RevokedSession records
    const deletedRevoked = await db.revokedSession.deleteMany({});
    console.log(`[ClearBlocks] Deleted ${deletedRevoked.count} RevokedSession records`);
    
    // Reset all isRevoked flags in LoginHistory
    const resetHistory = await db.loginHistory.updateMany({
      where: { isRevoked: true },
      data: {
        isRevoked: false,
        revokedAt: null,
      },
    });
    console.log(`[ClearBlocks] Reset ${resetHistory.count} LoginHistory records`);
    
    return NextResponse.json({
      success: true,
      message: "Все блокировки сняты",
      deletedRevokedSessions: deletedRevoked.count,
      resetLoginHistory: resetHistory.count,
    });
  } catch (error) {
    console.error("Error clearing blocks:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
