"use client";

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/logger";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  customRoleName?: string | null;
  branchId?: string | null;
  sessionId?: string;
  dismissalDate?: string | null;
  image?: string | null;
  canCreatePreliminary?: boolean;
  accessibleClientIds?: string[];
  hasKpiAccess?: boolean;
  clientVisibleColumns?: string[];
}

interface SessionContextType {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const SessionContext = createContext<SessionContextType>({
  user: null,
  loading: true,
  authenticated: false,
  refresh: async () => {},
  setUser: () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

// Sign out function
export async function signOut(options?: { redirect?: boolean; callbackUrl?: string }) {
  await fetch("/api/direct-logout", { method: "POST" });
  
  if (options?.redirect !== false) {
    const callbackUrl = options?.callbackUrl || "/login";
    window.location.href = callbackUrl;
  }
}

// Sign in function (for compatibility)
export async function signIn(provider: string, options?: { redirect?: boolean; callbackUrl?: string }) {
  // This is a stub - actual login is handled by /api/direct-login
  logger.log("[SessionProvider] signIn called with provider:", provider);
  return { error: "Use /api/direct-login for authentication" };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = async () => {
    try {
      const response = await fetch("/api/session-info", {
        credentials: "include", // Important: include cookies
      });
      const data = await response.json();
      
      logger.log("[SessionProvider] Session data:", data);
      
      if (data.authenticated && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("[SessionProvider] Error fetching session:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Poll session every 30 seconds
    intervalRef.current = setInterval(refresh, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        user,
        loading,
        authenticated: !!user,
        refresh,
        setUser,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
