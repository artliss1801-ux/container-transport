"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  BookOpen,
  User,
  Truck,
  Container,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { roleLabels } from "@/lib/permissions";

const navigation = [
  { name: "Главная", href: "/dashboard", icon: LayoutDashboard },
  { name: "Заявки", href: "/orders", icon: FileText },
  { name: "Отчеты", href: "/reports", icon: BarChart3 },
];

const adminNavigation = [
  { name: "Пользователи", href: "/users", icon: Users },
];

const directoryNavigation = [
  { name: "Водители", href: "/directories/drivers", icon: Users },
  { name: "Транспорт", href: "/directories/vehicles", icon: Truck },
  { name: "Типы контейнеров", href: "/directories/container-types", icon: Container },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAdmin = session?.user?.role === "ADMIN";

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-gray-200">
        <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-lg">
          <Truck className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-semibold text-gray-900">
          ContainerTrans
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Admin section - Admin only */}
        {isAdmin && (
          <>
            <Separator className="my-4" />
            <div className="px-3 mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Администрирование
              </span>
            </div>
            <ul className="space-y-1">
              {adminNavigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Directories section - Admin only */}
        {isAdmin && (
          <>
            <Separator className="my-4" />
            <div className="px-3 mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Справочники
              </span>
            </div>
            <ul className="space-y-1">
              {directoryNavigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <Separator className="my-4" />

        {/* Profile link */}
        <ul className="space-y-1">
          <li>
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname === "/profile"
                  ? "bg-primary/10 text-primary"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <User className="w-5 h-5" />
              Профиль
            </Link>
          </li>
        </ul>
      </nav>

      {/* User info & Logout */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-10 h-10 bg-gray-100 rounded-full">
            <User className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {session?.user?.name || "Пользователь"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {roleLabels[session?.user?.role || ""] || session?.user?.role}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Выйти
        </Button>
      </div>
    </div>
  );
}
