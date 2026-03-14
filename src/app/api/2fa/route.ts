import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

// Generate 2FA secret and QR code
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Generate new secret
    const secret = authenticator.generateSecret();
    
    // Create OTP auth URL
    const serviceName = "ContainerTransport";
    const otpauth = authenticator.keyuri(user.email, serviceName, secret);

    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    return NextResponse.json({
      secret,
      qrCodeUrl,
      manualEntryKey: secret,
    });
  } catch (error) {
    console.error("2FA setup error:", error);
    return NextResponse.json(
      { error: "Ошибка генерации 2FA" },
      { status: 500 }
    );
  }
}

// Enable/disable 2FA
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { action, secret, code } = body;

    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (action === "enable") {
      // Verify the code before enabling
      if (!secret || !code) {
        return NextResponse.json(
          { error: "Не указан секрет или код" },
          { status: 400 }
        );
      }

      const isValid = authenticator.check(code, secret);

      if (!isValid) {
        return NextResponse.json(
          { error: "Неверный код подтверждения" },
          { status: 400 }
        );
      }

      // Enable 2FA
      await db.user.update({
        where: { id: session.user.id },
        data: {
          isTwoFactorEnabled: true,
          twoFactorSecret: secret,
        },
      });

      return NextResponse.json({ message: "2FA успешно включена" });
    }

    if (action === "disable") {
      // Verify current 2FA code before disabling
      if (!user.twoFactorSecret) {
        return NextResponse.json(
          { error: "2FA не настроена" },
          { status: 400 }
        );
      }

      if (!code) {
        return NextResponse.json(
          { error: "Не указан код подтверждения" },
          { status: 400 }
        );
      }

      const isValid = authenticator.check(code, user.twoFactorSecret);

      if (!isValid) {
        return NextResponse.json(
          { error: "Неверный код подтверждения" },
          { status: 400 }
        );
      }

      // Disable 2FA
      await db.user.update({
        where: { id: session.user.id },
        data: {
          isTwoFactorEnabled: false,
          twoFactorSecret: null,
        },
      });

      return NextResponse.json({ message: "2FA успешно отключена" });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    console.error("2FA toggle error:", error);
    return NextResponse.json(
      { error: "Ошибка изменения настроек 2FA" },
      { status: 500 }
    );
  }
}
