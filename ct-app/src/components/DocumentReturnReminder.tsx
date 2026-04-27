"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { X, AlertTriangle, ChevronDown, FileText } from "lucide-react";

// 60 minutes between checks
const CHECK_INTERVAL = 60 * 60 * 1000;
// 45 seconds after mount for first check
const INITIAL_DELAY = 45_000;

type OverdueOrder = {
  id: string;
  orderNumber: string | null;
  containerNumber: string | null;
  clientName: string | null;
  loadingCity: string | null;
  unloadingCity: string | null;
  emptyContainerReturnDate: string | null;
  overdueDays: number;
};

type ReminderState = "hidden" | "visible" | "collapsed";

export function DocumentReturnReminder() {
  const session = useSession();
  const router = useRouter();
  const [state, setState] = useState<ReminderState>("hidden");
  const [orders, setOrders] = useState<OverdueOrder[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const checkOverdue = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const response = await fetch("/api/orders/document-return-check", { credentials: "include" });
      if (!response.ok || !mountedRef.current) return;
      const data = await response.json();
      if (data.count > 0 && data.orders?.length > 0 && mountedRef.current) {
        setOrders(data.orders);
        setState("visible");
      }
    } catch {
      // ignore
    }
  }, []);

  // Setup timer - only depends on session role, not on state
  useEffect(() => {
    if (session.loading || session.user?.role === "ADMIN") return;
    mountedRef.current = true;

    // Initial check after delay
    initialTimerRef.current = setTimeout(checkOverdue, INITIAL_DELAY);

    // Periodic check
    timerRef.current = setInterval(checkOverdue, CHECK_INTERVAL);

    // Escape key handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (state === "visible") {
          setState("hidden");
        } else if (state === "collapsed") {
          setState("hidden");
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      mountedRef.current = false;
      if (initialTimerRef.current) clearTimeout(initialTimerRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [session.loading, session.user?.role, checkOverdue]);

  const handleClose = () => {
    // X button - close notification, reappear after 60 minutes via interval
    setState("hidden");
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClose();
  };

  const handleOrderClick = (orderId: string) => {
    // Navigate to specific order, collapse notification to corner
    router.push(`/orders?edit=${orderId}`);
    setState("collapsed");
  };

  const handleCollapsedClick = () => {
    // Expand collapsed notification back to full view
    setState("visible");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const countText = orders.length === 1
    ? "1 заявка"
    : orders.length < 5
      ? `${orders.length} заявки`
      : `${orders.length} заявок`;

  // Hidden - render nothing
  if (state === "hidden") return null;

  // Collapsed - small badge in bottom-right corner
  if (state === "collapsed") {
    return createPortal(
      <button
        type="button"
        onClick={handleCollapsedClick}
        className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full cursor-pointer
          bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl transition-all duration-200
          animate-bounce hover:animate-none"
        style={{ boxShadow: "0 4px 20px rgba(220, 38, 38, 0.5)", pointerEvents: "auto" }}
        title="Есть заявки с несданными документами"
      >
        <AlertTriangle className="w-5 h-5 text-yellow-300 flex-shrink-0" />
        <span className="font-bold text-sm whitespace-nowrap">
          {countText} — документы не сданы
        </span>
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-xs font-bold">
          {orders.length}
        </span>
      </button>,
      document.body
    );
  }

  // Visible - full notification with order list (rendered via Portal to avoid Dialog pointer-events interference)
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.4)", pointerEvents: "auto" }}
      onClick={handleClose}
    >
      <div
        className="relative flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: "90vw",
          maxWidth: "600px",
          maxHeight: "80vh",
          boxShadow: "0 25px 50px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - red gradient */}
        <div
          className="relative flex items-center gap-3 px-6 py-4"
          style={{
            background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 50%, #991b1b 100%)",
          }}
        >
          <AlertTriangle className="w-7 h-7 text-yellow-300 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-white text-lg" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
              ВНИМАНИЕ!
            </p>
            <p className="text-white/90 text-sm">
              {countText}, по которым не сданы документы
            </p>
          </div>
          {/* Close button */}
          <button
            type="button"
            onClick={handleCloseClick}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 transition-colors cursor-pointer flex-shrink-0"
            style={{ pointerEvents: "auto" }}
            title="Закрыть (появится через 60 минут)"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-auto px-4 py-3" style={{ maxHeight: "calc(80vh - 130px)" }}>
          {orders.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Загрузка...</p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => handleOrderClick(order.id)}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-red-300
                    hover:bg-red-50 transition-all duration-150 cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-gray-900 text-sm group-hover:text-red-700 transition-colors">
                      {order.orderNumber || "(без номера)"}
                    </span>
                    <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                      {order.overdueDays} дн. просрочки
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {order.containerNumber && (
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {order.containerNumber}
                      </span>
                    )}
                    {order.loadingCity && order.unloadingCity && (
                      <span>
                        {order.loadingCity} → {order.unloadingCity}
                      </span>
                    )}
                    {order.emptyContainerReturnDate && (
                      <span className="text-gray-400">
                        Сдача: {formatDate(order.emptyContainerReturnDate)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            Нажмите на заявку для перехода. Закрыть — Esc или ✕
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
