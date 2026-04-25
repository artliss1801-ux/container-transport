"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useSession } from "@/components/SessionProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Roles allowed to see the online users bar
const ROLES_WITH_ONLINE_VIEW = ["ADMIN", "LOGISTICS_MANAGER"];

function getInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  return email[0]?.toUpperCase() || "?";
}

const roleLabels: Record<string, string> = {
  ADMIN: "Администратор",
  LOGISTICS_MANAGER: "Менеджер по логистике",
  COMMERCIAL_MANAGER: "Коммерческий менеджер",
  ACCOUNTANT: "Бухгалтер",
  LAWYER: "Юрист",
  EXPEDITOR: "Экспедитор",
  CLIENT: "Клиент",
};

interface OnlineUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  image: string | null;
  customRoleName?: string | null;
}

export function OnlineUsersBar() {
  const { user, authenticated } = useSession();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [lastFetch, setLastFetch] = useState<string>("");

  const canViewOnline = user?.role ? ROLES_WITH_ONLINE_VIEW.includes(user.role) : false;

  useEffect(() => {
    if (!authenticated || !canViewOnline) return;

    const fetchOnlineUsers = async () => {
      try {
        const res = await fetch("/api/online-users");
        const data = await res.json();
        if (data.users) {
          setOnlineUsers(data.users);
        }
        setLastFetch(new Date().toLocaleTimeString("ru-RU"));
      } catch (_err) {
        // silently fail
      }
    };

    fetchOnlineUsers();
    // Poll every 5 seconds for near real-time updates
    const interval = setInterval(fetchOnlineUsers, 5000);

    // Also re-fetch when tab becomes visible (user switched back)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchOnlineUsers();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authenticated, canViewOnline]);

  if (!canViewOnline) return null;

  return (
    <div className="bg-green-50 border-b border-green-200 px-4 py-1.5 flex items-center gap-2 text-xs">
      <Users className="w-3.5 h-3.5 text-green-600 shrink-0" />
      <span className="text-green-700 font-medium shrink-0">
        Онлайн ({onlineUsers.length}):
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {onlineUsers.map((u) => (
          <Tooltip key={u.id}>
            <TooltipTrigger asChild>
              <div className="relative cursor-default">
                <Avatar className="w-6 h-6 border border-green-300">
                  {u.image ? (
                    <AvatarImage src={u.image} alt={u.name || u.email} />
                  ) : null}
                  <AvatarFallback className="text-[9px] font-semibold bg-green-100 text-green-800 select-none">
                    {getInitials(u.name, u.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 ring-1 ring-green-50" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <div className="text-center leading-snug">
                <div className="font-medium">{u.name || u.email}</div>
                {u.name && <div className="opacity-80 text-[10px]">{u.email}</div>}
                <div className="opacity-60 text-[10px]">
                  {u.customRoleName || roleLabels[u.role] || u.role}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
