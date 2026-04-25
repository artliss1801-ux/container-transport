import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerUser } from "@/lib/server-auth";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getServerUser(request);

    const ALLOWED_ROLES = ["ADMIN", "LOGISTICS_MANAGER"];
    if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role)) {
      return NextResponse.json({ users: [] });
    }

    // 30 seconds threshold — fast removal when user closes tab
    const thresholdSeconds = 30;
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000).toISOString();

    // Use raw SQL to avoid Prisma errors if lastActivity column doesn't exist yet
    // Migration 20260401000000_add_last_activity adds this column
    const activeLogins: Array<{ id: string; name: string | null; email: string; role: string; image: string | null; customRoleName: string | null }> =
      await db.$queryRawUnsafe(
        `SELECT DISTINCT ON (lh."userId")
          u."id", u."name", u."email", u."role", u."image", u."customRoleName"
          FROM "LoginHistory" lh
          JOIN "User" u ON u."id" = lh."userId"
          WHERE lh."isRevoked" = false
            AND lh."lastActivity" >= $1::timestamptz
            AND u."dismissalDate" IS NULL
          ORDER BY lh."userId", lh."lastActivity" DESC`,
        cutoff
      );

    return NextResponse.json({ users: activeLogins });
  } catch (error: unknown) {
    console.error("[Online-Users] Error:", error);
    return NextResponse.json({ users: [] });
  }
}
