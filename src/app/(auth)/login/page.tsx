"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [show2FA, setShow2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        twoFactorCode: show2FA ? twoFactorCode : undefined,
        redirect: false,
      });

      if (result?.error) {
        // Check if 2FA is required
        if (result.error === "Verification" || result.code === "2FA_REQUIRED") {
          setShow2FA(true);
          toast({
            title: "Требуется 2FA",
            description: "Введите код из приложения-аутентификатора",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Ошибка входа",
            description: "Неверный email или пароль",
          });
        }
      } else {
        toast({
          title: "Успешный вход",
          description: "Добро пожаловать в систему!",
        });
        router.push("/dashboard");
        router.refresh();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Произошла ошибка при входе",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="flex items-center justify-center w-14 h-14 bg-primary rounded-xl">
            <Truck className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl">ContainerTrans</CardTitle>
        <CardDescription>
          Система учета контейнерных автоперевозок
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {!show2FA ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Введите 6-значный код из приложения-аутентификатора
              </p>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={setTwoFactorCode}
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setShow2FA(false);
                  setTwoFactorCode("");
                }}
              >
                Назад к входу
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Вход..." : show2FA ? "Подтвердить" : "Войти"}
          </Button>
          {!show2FA && (
            <>
              <div className="text-sm text-center text-muted-foreground">
                Нет аккаунта?{" "}
                <Link href="/register" className="text-primary hover:underline">
                  Зарегистрироваться
                </Link>
              </div>
              <div className="text-sm text-center">
                <Link
                  href="/forgot-password"
                  className="text-muted-foreground hover:text-primary"
                >
                  Забыли пароль?
                </Link>
              </div>
            </>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
