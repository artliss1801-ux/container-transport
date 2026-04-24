"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession, signOut } from "./SessionProvider";
import { logger } from "@/lib/logger";

// How often to check session status (revoked, blocked, dismissed)
const CHECK_INTERVAL_MS = 30_000; // 30 seconds

// How long a user-activity flag stays "fresh" (we debounce DB writes)
const ACTIVITY_WINDOW_MS = 60_000; // 1 minute

// Default client-side inactivity timeout — overridden by server value
const DEFAULT_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

// This component checks if session was revoked and forces logout.
// It tracks REAL user activity (clicks, keypresses, touch) only.
// Tab visibility changes and polling do NOT count as activity.
export function SessionChecker() {
  const { user, authenticated } = useSession();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(0);
  const clientInactivityMsRef = useRef<number>(DEFAULT_INACTIVITY_MS);
  const mountedRef = useRef<boolean>(false);

  // Mark that the user has done something and reset the inactivity timer
  const onUserActivity = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      logger.log("[SessionChecker] Client inactivity timeout, redirecting");
      window.location.href = "/login?error=SessionExpired&message=Сессия+истекла+из-за+бездействия";
    }, clientInactivityMsRef.current);
  }, []);

  // Mark user as offline when closing tab/navigating away
  const sendOfflineBeacon = useCallback(() => {
    const url = "/api/auth/check-session?offline=true";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { credentials: "include", keepalive: true }).catch(() => {});
    }
  }, []);

  // Set up session polling (runs once on mount/unmount)
  useEffect(() => {
    if (!authenticated || !user) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Start the inactivity timer on mount (30 min countdown starts now)
    inactivityTimerRef.current = setTimeout(() => {
      logger.log("[SessionChecker] Client inactivity timeout, redirecting");
      window.location.href = "/login?error=SessionExpired&message=Сессия+истекла+из-за+бездействия";
    }, clientInactivityMsRef.current);

    // Listen for REAL user interactions ONLY
    const events = ["mousedown", "keydown", "touchstart"] as const;
    events.forEach((evt) => window.addEventListener(evt, onUserActivity, { passive: true }));

    // Tab visibility: check session validity but do NOT report activity
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Just check if session is still valid — don't mark as active
        fetch("/api/auth/check-session", { credentials: "include", keepalive: true })
          .then((res) => res.json())
          .then((data) => {
            if (data.revoked) {
              logger.log("[SessionChecker] Session revoked on tab visible, signing out");
              signOut({ redirect: false });
              window.location.href = "/login?error=SessionExpired&message=Сессия+истекла";
            }
          })
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Page unload: mark user as offline so they disappear quickly
    const onBeforeUnload = () => {
      sendOfflineBeacon();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // Session check function — only reports activity from REAL interactions
    const checkSession = async () => {
      try {
        const now = Date.now();
        const isUserActive = (now - lastActivityRef.current) < ACTIVITY_WINDOW_MS;

        const params = isUserActive ? "?active=true" : "";
        const response = await fetch(`/api/auth/check-session${params}`, {
          credentials: "include",
        });
        const data = await response.json();

        // Update client-side inactivity timer if server provides a value
        if (data.sessionTimeoutMinutes && data.sessionTimeoutMinutes > 0) {
          const serverTimeoutMs = data.sessionTimeoutMinutes * 60 * 1000;
          if (clientInactivityMsRef.current !== serverTimeoutMs) {
            logger.log(`[SessionChecker] Server timeout updated: ${data.sessionTimeoutMinutes} min`);
            clientInactivityMsRef.current = serverTimeoutMs;
          }
        }

        if (data.revoked) {
          logger.log("[SessionChecker] Session revoked, signing out");
          await signOut({ redirect: false });
          window.location.href = "/login?error=SessionExpired&message=Сессия+истекла";
        }
      } catch (error) {
        console.error("[SessionChecker] Error checking session:", error);
      }
    };

    checkSession();
    intervalRef.current = setInterval(checkSession, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, onUserActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("beforeunload", onBeforeUnload);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      mountedRef.current = false;
    };
  }, [authenticated, user, onUserActivity, sendOfflineBeacon]);

  return null;
}

