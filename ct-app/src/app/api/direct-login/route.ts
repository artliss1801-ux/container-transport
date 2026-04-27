import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, withRetry } from "@/lib/db";
import { SignJWT } from "jose";
import { serialize } from "cookie";
import { recordLogin } from "@/lib/login-history";
import { logAudit, extractIpAddress, extractUserAgent } from "@/lib/audit";
import { 
  getClientIp, 
  isRateLimited, 
  recordFailedAttempt, 
  resetAttempts 
} from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Проверка наличия секретного ключа
const getJwtSecret = () => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("[Direct-Login] КРИТИЧЕСКАЯ ОШИБКА: NEXTAUTH_SECRET не установлен!");
    throw new Error("Server configuration error");
  }
  return secret;
};

export async function POST(request: NextRequest) {
  try {
    // Получаем IP клиента для rate limiting
    const clientIp = getClientIp(request);
    const rateLimitKey = `login:${clientIp}`;
    
    // Проверяем rate limiting
    const rateLimitStatus = isRateLimited(rateLimitKey);
    if (rateLimitStatus.limited) {
      const remainingMinutes = Math.ceil((rateLimitStatus.remainingMs || 0) / 60000);
      logger.log("[Direct-Login] Rate limited IP:", clientIp);
      return NextResponse.json({ 
        error: `Слишком много попыток входа. Попробуйте через ${remainingMinutes} мин.`,
        rateLimited: true,
        remainingMinutes
      }, { status: 429 });
    }
    
    const body = await request.json();
    const { login, password } = body;
    
    logger.log("[Direct-Login] Attempting login for:", login);
    
    if (!login || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }
    
    // Find user
    const user = await withRetry(() => db.user.findUnique({
      where: { email: login },
    }));
    
    if (!user) {
      logger.log("[Direct-Login] User not found:", login);
      // Записываем неудачную попытку
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json({ 
        error: "Invalid credentials",
        remainingAttempts: rateLimitStatus.remainingAttempts ? rateLimitStatus.remainingAttempts - 1 : undefined
      }, { status: 401 });
    }
    
    // Check if user is dismissed
    if (user.dismissalDate) {
      return NextResponse.json({ error: "Аккаунт отключен" }, { status: 403 });
    }
    
    // Check if user is blocked (e.g. demo expired)
    const IS_DEMO = process.env.NEXT_PUBLIC_IS_DEMO === "true";
    const DEMO_ADMIN_EMAIL = "demo@containertrans.ru";
    if (IS_DEMO && user.email !== DEMO_ADMIN_EMAIL) {
      const blocked = await withRetry(() => db.revokedSession.findFirst({
        where: { userId: user.id },
      }));
      if (blocked) {
        logger.log("[Direct-Login] User is blocked (demo expired):", login);
        return NextResponse.json({ 
          error: "Демо-доступ истек. Для получения доступа обратитесь к администратору.",
          demoBlocked: true,
        }, { status: 403 });
      }
    }
    
    if (!user.password) {
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json({ 
        error: "Invalid credentials",
        remainingAttempts: rateLimitStatus.remainingAttempts ? rateLimitStatus.remainingAttempts - 1 : undefined
      }, { status: 401 });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      logger.log("[Direct-Login] Invalid password for:", login);
      
      // Записываем неудачную попытку
      const attemptResult = recordFailedAttempt(rateLimitKey);
      
      await recordLogin({
        userId: user.id,
        headers: request.headers,
        success: false,
        failureReason: "Invalid password",
      });
      
      if (attemptResult.blocked) {
        return NextResponse.json({ 
          error: "Слишком много неудачных попыток. Попробуйте через 30 минут.",
          rateLimited: true,
          remainingMinutes: 30
        }, { status: 429 });
      }
      
      return NextResponse.json({ 
        error: "Invalid credentials",
        remainingAttempts: attemptResult.remainingAttempts
      }, { status: 401 });
    }
    
    // Успешный вход - сбрасываем счетчик попыток
    resetAttempts(rateLimitKey);
    
    logger.log("[Direct-Login] Login successful:", login);
    
    // Close all previous sessions for this user (one session per user)
    await db.loginHistory.updateMany({
      where: {
        userId: user.id,
        success: true,
        isRevoked: false,
        sessionId: { not: null },
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
    
    // Generate new session ID
    const sessionId = crypto.randomUUID();
    
    // Record successful login
    await recordLogin({
      userId: user.id,
      sessionId,
      headers: request.headers,
      success: true,
    });
    
    // Логируем вход в аудит
    await logAudit({
      userId: user.id,
      action: "LOGIN",
      entityType: "LOGIN_SESSION",
      entityId: sessionId,
      entityName: `Сессия ${sessionId.slice(0, 8)}`,
      description: `Вход в систему`,
      ipAddress: extractIpAddress(request),
      userAgent: extractUserAgent(request),
    });
    
    // Create JWT token
    const secret = new TextEncoder().encode(getJwtSecret());
    const token = await new SignJWT({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secret);
    
    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionId,
      },
    });
    
    // Set cookie with name that matches what we check in session-info
    response.headers.set(
      "Set-Cookie",
      serialize("ct-session-token", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 24 * 60 * 60,
        secure: false,
      })
    );
    
    return response;
  } catch (error: any) {
    console.error("[Direct-Login] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
