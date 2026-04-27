import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// User agent parser
function parseUserAgent(userAgent: string): { deviceType: string; browser: string; os: string } {
  const ua = userAgent.toLowerCase();
  
  // Detect device type
  let deviceType = "desktop";
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    deviceType = "mobile";
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
  }
  
  // Detect browser (order matters - check for specific browsers before generic Chrome)
  // Yandex Browser user-agent contains "yabrowser" (lowercase in UA string)
  let browser = "Unknown";
  if (ua.includes("yabrowser")) {
    browser = "Yandex Browser";
  } else if (ua.includes("edg/") || ua.includes("edge")) {
    browser = "Edge";
  } else if (ua.includes("opr/") || ua.includes("opera")) {
    browser = "Opera";
  } else if (ua.includes("firefox")) {
    browser = "Firefox";
  } else if (ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium")) {
    browser = "Safari";
  } else if (ua.includes("chrome") || ua.includes("chromium")) {
    browser = "Chrome";
  } else if (ua.includes("msie") || ua.includes("trident")) {
    browser = "Internet Explorer";
  }
  
  // Detect OS
  let os = "Unknown";
  if (ua.includes("windows")) {
    os = "Windows";
  } else if (ua.includes("mac os") || ua.includes("macos")) {
    os = "macOS";
  } else if (ua.includes("linux")) {
    os = "Linux";
  } else if (ua.includes("android")) {
    os = "Android";
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    os = "iOS";
  }
  
  return { deviceType, browser, os };
}

// Get geolocation from IP using free API
async function getGeoLocation(ip: string): Promise<{ country: string | null; region: string | null; city: string | null; latitude: number | null; longitude: number | null }> {
  // Skip localhost and private IPs
  if (!ip || ip === "127.0.0.1" || ip === "::1" ||
    ip.startsWith("192.168.") || ip.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
    return { country: "Local", region: "Local", city: "Local", latitude: null, longitude: null };
  }
  
  try {
    // Using ip-api.com (free, no API key needed, 45 requests/min limit)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon`);
    const data = await response.json();
    
    if (data.status === "success") {
      return {
        country: data.country || null,
        region: data.regionName || null,
        city: data.city || null,
        latitude: data.lat || null,
        longitude: data.lon || null,
      };
    }
  } catch (error) {
    console.error("Failed to get geolocation:", error);
  }
  
  return { country: null, region: null, city: null, latitude: null, longitude: null };
}

// Extract IP from request headers
function extractIP(headers: Headers): string | null {
  // Try various headers that might contain the real IP
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may contain multiple IPs, the first one is the client
    return forwarded.split(",")[0].trim();
  }
  
  const realIP = headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  
  const cfIP = headers.get("cf-connecting-ip"); // Cloudflare
  if (cfIP) {
    return cfIP;
  }
  
  return null;
}

// Record a successful login
export async function recordLogin(params: {
  userId: string;
  sessionId?: string;
  headers: Headers;
  success?: boolean;
  failureReason?: string;
}): Promise<void> {
  try {
    const { userId, sessionId, headers, success = true, failureReason } = params;
    
    const userAgent = headers.get("user-agent") || null;
    const ipAddress = extractIP(headers);
    
    // Parse user agent
    const { deviceType, browser, os } = userAgent ? parseUserAgent(userAgent) : { deviceType: null, browser: null, os: null };
    
    // Log for debugging
    if (userAgent) {
      logger.log(`[LoginHistory] User-Agent: ${userAgent.substring(0, 100)}...`);
      logger.log(`[LoginHistory] Parsed: deviceType=${deviceType}, browser=${browser}, os=${os}`);
    }
    
    // Get geolocation (async, don't wait too long)
    let geoData = { country: null as string | null, region: null as string | null, city: null as string | null, latitude: null as number | null, longitude: null as number | null };
    if (ipAddress) {
      try {
        geoData = await Promise.race([
          getGeoLocation(ipAddress),
          new Promise<typeof geoData>((resolve) => setTimeout(() => resolve(geoData), 2000)), // 2s timeout
        ]);
      } catch (e) {
        console.error("Geolocation lookup failed:", e);
      }
    }
    
    await db.loginHistory.create({
      data: {
        userId,
        sessionId,
        userAgent,
        deviceType,
        browser,
        os,
        ipAddress,
        country: geoData.country,
        region: geoData.region,
        city: geoData.city,
        latitude: geoData.latitude,
        longitude: geoData.longitude,
        lastActivity: new Date(), // Сразу помечаем как активного для мгновенного появления в "Онлайн"
        success,
        failureReason,
      },
    });
    
    logger.log(`[LoginHistory] Recorded login for user ${userId} from ${ipAddress} (${geoData.city || "unknown location"})`);
  } catch (error) {
    console.error("Failed to record login history:", error);
  }
}

// Get login history for admin
export async function getLoginHistory(params: {
  limit?: number;
  offset?: number;
  userId?: string;
}) {
  const { limit = 50, offset = 0, userId } = params;
  
  const where = userId ? { userId } : {};
  
  const [history, total] = await Promise.all([
    db.loginHistory.findMany({
      where,
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
      take: limit,
      skip: offset,
    }),
    db.loginHistory.count({ where }),
  ]);
  
  return { history, total };
}

// Get active sessions
export async function getActiveSessions(params?: {
  limit?: number;
  offset?: number;
}) {
  const { limit = 50, offset = 0 } = params || {};
  
  // Sessions expire after 24 hours (JWT expiration)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Get all non-revoked login sessions from last 24 hours
  const sessions = await db.loginHistory.findMany({
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
    take: limit,
    skip: offset,
  });
  
  return sessions;
}

// Revoke a single session - closes the session but user can login again
export async function revokeSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the login history entry
    const loginEntry = await db.loginHistory.findUnique({
      where: { sessionId },
    });
    
    if (!loginEntry) {
      return { success: false, error: "Session not found" };
    }
    
    // Mark as revoked in LoginHistory only
    // User can still login again with a new session
    await db.loginHistory.update({
      where: { sessionId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
    
    logger.log(`[Security] Session ${sessionId} closed for user ${loginEntry.userId} - user can login again`);
    return { success: true };
  } catch (error) {
    console.error("Failed to revoke session:", error);
    return { success: false, error: "Failed to revoke session" };
  }
}

// Revoke all sessions for a user
export async function revokeAllUserSessions(userId: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Mark all active sessions as revoked
    const result = await db.loginHistory.updateMany({
      where: {
        userId,
        success: true,
        isRevoked: false,
        sessionId: { not: null },
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
    
    // Add a revoked session entry
    await db.revokedSession.create({
      data: {
        userId,
      },
    });
    
    logger.log(`[Security] All sessions revoked for user ${userId}, count: ${result.count}`);
    return { success: true, count: result.count };
  } catch (error) {
    console.error("Failed to revoke all sessions:", error);
    return { success: false, count: 0, error: "Failed to revoke sessions" };
  }
}

// Unblock a user - clear all revocations so they can log in again
export async function unblockUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete all revoked session entries for this user
    // This allows the user to log in again with a NEW session
    const result = await db.revokedSession.deleteMany({
      where: { userId },
    });
    
    logger.log(`[Security] User ${userId} unblocked - deleted ${result.count} revocation records`);
    return { success: true };
  } catch (error) {
    console.error("Failed to unblock user:", error);
    return { success: false, error: "Failed to unblock user" };
  }
}

// Check if a user is currently blocked (has revoked sessions)
export async function isUserBlocked(userId: string): Promise<boolean> {
  try {
    const count = await db.revokedSession.count({
      where: { userId },
    });
    return count > 0;
  } catch (error) {
    console.error("Failed to check user blocked status:", error);
    return false;
  }
}
