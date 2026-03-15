"use client";

import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "next-auth/react";

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { data: session } = useSession();

<<<<<<< HEAD
  const roleLabel = session?.user?.role === "ADMIN" ? "Администратор" : "Менеджер";
=======
  // Отладка
  console.log("Header - session.user.role:", session?.user?.role);
  console.log("Header - roleLabels:", roleLabels);
  
  const roleLabel = roleLabels[session?.user?.role || ""] || session?.user?.role || "Пользователь";
  console.log("Header - roleLabel:", roleLabel);
>>>>>>> e117ad3 (Add session debug endpoint and improve Header role display)

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="hidden sm:flex">
          {roleLabel}
        </Badge>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-gray-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </Button>
      </div>
    </header>
  );
}
