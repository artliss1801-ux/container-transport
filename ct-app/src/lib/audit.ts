import { db } from "./db";

export function extractIpAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
         request.headers.get("x-real-ip") || "unknown";
}

export function extractUserAgent(request: Request): string {
  return request.headers.get("user-agent") || "unknown";
}

export async function logAudit(data: { userId?: string; action: string; entityType: string; entityId?: string; entityName?: string; details?: string; description?: string; ipAddress?: string; userAgent?: string }) {
  try { await db.auditLog.create({ data }); } catch (err) { console.error("[audit] Error:", err); }
}

