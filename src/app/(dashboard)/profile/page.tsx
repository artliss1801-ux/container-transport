"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldOff, QrCode, Copy, Check } from "lucide-react";

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const { toast } = useToast();

  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const is2FAEnabled = session?.user?.isTwoFactorEnabled;

  const handleSetup2FA = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/2fa");
      if (!response.ok) throw new Error("Failed to setup 2FA");

      const data = await response.json();
      setQrCodeUrl(data.qrCodeUrl);
      setSecret(data.secret);
      setShowSetup2FA(true);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось сгенерировать QR-код",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEnable2FA = async () => {
    if (otpCode.length !== 6) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Введите 6-значный код",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable",
          secret,
          code: otpCode,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to enable 2FA");
      }

      toast({
        title: "2FA включена",
        description: "Двухфакторная аутентификация успешно активирована",
      });

      setShowSetup2FA(false);
      setOtpCode("");
      setSecret("");
      setQrCodeUrl("");
      update();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Неверный код подтверждения",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (otpCode.length !== 6) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Введите 6-значный код",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable",
          code: otpCode,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to disable 2FA");
      }

      toast({
        title: "2FA отключена",
        description: "Двухфакторная аутентификация отключена",
      });

      setShowDisable2FA(false);
      setOtpCode("");
      update();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Неверный код подтверждения",
      });
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Скопировано в буфер обмена" });
  };

  const roleLabel = session?.user?.role === "ADMIN" ? "Администратор" : "Менеджер";

  return (
    <div className="flex flex-col h-full">
      <Header title="Профиль" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* User info */}
          <Card>
            <CardHeader>
              <CardTitle>Информация о пользователе</CardTitle>
              <CardDescription>
                Основные данные вашего аккаунта
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-gray-500">Имя</Label>
                  <p className="font-medium">{session?.user?.name || "Не указано"}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-500">Email</Label>
                  <p className="font-medium">{session?.user?.email}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-500">Роль</Label>
                  <p className="font-medium">{roleLabel}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-500">Статус</Label>
                  <Badge variant={is2FAEnabled ? "default" : "secondary"}>
                    {is2FAEnabled ? "2FA включена" : "2FA отключена"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Безопасность
              </CardTitle>
              <CardDescription>
                Настройки двухфакторной аутентификации
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Двухфакторная аутентификация</p>
                  <p className="text-sm text-gray-500">
                    {is2FAEnabled
                      ? "Ваш аккаунт защищен 2FA"
                      : "Добавьте дополнительный уровень защиты"}
                  </p>
                </div>
                {is2FAEnabled ? (
                  <Button
                    variant="outline"
                    className="text-red-600"
                    onClick={() => setShowDisable2FA(true)}
                  >
                    <ShieldOff className="w-4 h-4 mr-2" />
                    Отключить 2FA
                  </Button>
                ) : (
                  <Button onClick={handleSetup2FA} disabled={loading}>
                    <Shield className="w-4 h-4 mr-2" />
                    Включить 2FA
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Инструкция по 2FA</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                <li>Скачайте приложение-аутентификатор (Google Authenticator, Authy и др.)</li>
                <li>Нажмите "Включить 2FA" и отсканируйте QR-код</li>
                <li>Введите 6-значный код из приложения для подтверждения</li>
                <li>При каждом входе в систему вам нужно будет вводить код из приложения</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Setup 2FA Dialog */}
      <Dialog open={showSetup2FA} onOpenChange={setShowSetup2FA}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Настройка 2FA</DialogTitle>
            <DialogDescription>
              Отсканируйте QR-код в приложении-аутентификаторе
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {qrCodeUrl && (
              <div className="flex justify-center">
                <img src={qrCodeUrl} alt="2FA QR Code" className="rounded-lg border" />
              </div>
            )}
            <div>
              <Label className="text-sm text-gray-500">
                Или введите код вручную:
              </Label>
              <div className="flex gap-2 mt-1">
                <Input value={secret} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={copySecret}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label>Введите код из приложения</Label>
              <div className="flex justify-center mt-2">
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={setOtpCode}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetup2FA(false)}>
              Отмена
            </Button>
            <Button onClick={handleEnable2FA} disabled={loading || otpCode.length !== 6}>
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Dialog */}
      <Dialog open={showDisable2FA} onOpenChange={setShowDisable2FA}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отключить 2FA</DialogTitle>
            <DialogDescription>
              Введите код из приложения-аутентификатора для подтверждения
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={setOtpCode}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisable2FA(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisable2FA}
              disabled={loading || otpCode.length !== 6}
            >
              Отключить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
