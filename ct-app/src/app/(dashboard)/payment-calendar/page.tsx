"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermissions, Entities } from "@/hooks/use-permissions";
import {
  Search, AlertTriangle, Clock, CheckCircle2,
  GripHorizontal, GripVertical, Settings2, Plus, Minus,
  ChevronUp, ChevronDown, Filter, Pencil, Check,
  FileText, Send, ShieldCheck, X, Save, RotateCcw, CalendarDays, Loader2, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { countRussianWorkingDays, isRussianWorkingDay } from "@/lib/russian-calendar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

// --- Types ---

interface PaymentOrder {
  id: string;
  orderNumber: string | null;
  containerNumber: string | null;
  containerType: { id: string; name: string } | null;
  cargoWeight: number | null;
  cargoName: string | null;
  loadingCity: string | null;
  loadingAddress: string | null;
  loadingDatetime: string | null;
  unloadingCity: string | null;
  unloadingAddress: string | null;
  unloadingDatetime: string | null;
  clientRate: number | null;
  clientRateVat: string | null;
  carrierRate: number | null;
  carrierRateVat: string | null;
  carrierPaymentDays: number | null;
  carrierActualPaymentDays: number | null;
  carrierPrepayment: number | null;
  carrierPrepaymentDate: string | null;
  carrierOffset: number | null;
  carrierOffsetAmount: number | null;
  carrierExpectedPaymentDate: string | null;
  carrierActualPaymentDate: string | null;
  clientExpectedPaymentDate: string | null;
  clientActualPaymentDate: string | null;
  documentSubmissionDate: string | null;
  emptyContainerReturnDate: string | null;
  createdAt: string;
  notes: string | null;
  paymentIssueType: string | null;
  paymentIssueStatus: string | null;
  paymentIssueComment: string | null;
  paymentIssueResolution: string | null;
  routePoints: { id: string; pointType: string; pointOrder: number; city: string | null; datetime: string | null; address: string | null }[];
  carrier: { id: string; name: string; isBlocked?: boolean } | null;
  client: { id: string; name: string } | null;
  assignedManager: { id: string; name: string } | null;
  driver: { id: string; fullName: string } | null;
  truck: { id: string; vehicleNumber: string } | null;
  branch: { id: string; name: string; documentGraceDays: number | null } | null;
  expenses: { id: string; contractorId: string | null; expenseType: string; amount: number }[];
}

interface ColumnDef {
  key: string;
  label: string;
  align: "left" | "right" | "center";
  width: number;
}

interface GlobalSettings {
  id: string;
  cardsHeight: number;
  tableHeight: number;
  headerHeight: number;
  rowHeight: number;
  visibleKeys: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  columnLabels: Record<string, string>;
  updatedAt: string;
  updatedById: string | null;
}

// --- Constants ---

const DEFAULT_CARDS_HEIGHT = 100;
const DEFAULT_TABLE_HEIGHT = 400;
const DEFAULT_HEADER_HEIGHT = 44;
const DEFAULT_ROW_HEIGHT = 44;

const ALL_COLUMNS: ColumnDef[] = [
  { key: "select", label: "Выбор", align: "center", width: 44 },
  { key: "status", label: "Статус", align: "left", width: 150 },
  { key: "paymentStatus", label: "Статус оплаты", align: "left", width: 180 },
  { key: "orderNumber", label: "Заявка", align: "left", width: 120 },
  { key: "containerNumber", label: "Контейнер", align: "left", width: 120 },
  { key: "containerType", label: "Тип конт.", align: "left", width: 100 },
  { key: "cargoName", label: "Груз", align: "left", width: 140 },
  { key: "cargoWeight", label: "Вес (тн)", align: "right", width: 80 },
  { key: "route", label: "Маршрут", align: "left", width: 220 },
  { key: "loadingDatetime", label: "Дата погрузки", align: "left", width: 120 },
  { key: "unloadingDatetime", label: "Дата выгрузки", align: "left", width: 120 },
  { key: "carrier", label: "Перевозчик", align: "left", width: 180 },
  { key: "driver", label: "Водитель", align: "left", width: 140 },
  { key: "truck", label: "Тягач", align: "left", width: 100 },
  { key: "client", label: "Заказчик", align: "left", width: 180 },
  { key: "manager", label: "Менеджер", align: "left", width: 140 },
  { key: "carrierRate", label: "Ставка перевозчика", align: "right", width: 150 },
  { key: "clientRate", label: "Ставка заказчика", align: "right", width: 150 },
  { key: "carrierPrepayment", label: "Сумма предоплаты", align: "right", width: 140 },
  { key: "carrierPrepaymentDate", label: "Дата аванса", align: "left", width: 120 },
  { key: "carrierOffsetAmount", label: "Сумма взаимозачёта", align: "right", width: 150 },
  { key: "totalToPay", label: "Итого к оплате", align: "right", width: 140 },
  { key: "paymentDays", label: "Срок оплаты начальный", align: "right", width: 130 },
  { key: "actualPaymentDays", label: "Срок оплаты фактический", align: "right", width: 140 },
  { key: "paymentDate", label: "Планируемая дата оплаты", align: "left", width: 150 },
  { key: "carrierActualPaymentDate", label: "Фактическая дата оплаты", align: "left", width: 150 },
  { key: "clientExpectedPaymentDate", label: "Дата оплаты клиентом", align: "left", width: 150 },
  { key: "documentSubmissionDate", label: "Сдача документов", align: "left", width: 130 },
  { key: "emptyContainerReturnDate", label: "Возврат контейнера", align: "left", width: 140 },
  { key: "branch", label: "Филиал", align: "left", width: 140 },
  { key: "createdAt", label: "Создана", align: "left", width: 110 },
  { key: "notes", label: "Примечание", align: "left", width: 200 },
  { key: "link", label: "", align: "center", width: 44 },
];

// Столбцы по умолчанию (видимые)
const DEFAULT_VISIBLE_KEYS = new Set([
  "select", "status", "paymentStatus", "paymentDate", "orderNumber", "containerNumber",
  "carrier", "client", "manager", "carrierRate", "paymentDays", "link",
]);

// Статусы решения проблемы
const RESOLUTION_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  PENDING_REVIEW: { label: "На проверке", badgeClass: "bg-blue-100 text-blue-700" },
  SENT_BACK: { label: "На доработке", badgeClass: "bg-orange-100 text-orange-700" },
};

// Константы для статусов проблемы с документами
const PAYMENT_ISSUE_STATUSES = [
  { value: "STOP", label: "СТОП" },
  { value: "NO_ACTS", label: "НЕТ АКТОВ" },
  { value: "NO_RECEIPTS", label: "НЕТ ПОСТУПЛЕНИЙ" },
  { value: "NO_DSN", label: "НЕТ ДСН" },
  { value: "PROBLEM", label: "ПРОБЛЕМА" },
  { value: "CLAIM", label: "ПРЕТЕНЗИЯ" },
];

// Функция для получения отображаемого текста статуса
function getPaymentIssueDisplayLabel(order: PaymentOrder): string {
  if (order.paymentIssueType === "OFFSET") return "Взаимозачёт";
  if (order.paymentIssueType === "DOCUMENT_ISSUE") {
    const status = PAYMENT_ISSUE_STATUSES.find(s => s.value === order.paymentIssueStatus);
    return status?.label || "Проблема";
  }
  return "Без проблем";
}

// Функция для получения комбинированного значения
function getPaymentIssueValue(order: PaymentOrder): string {
  if (order.paymentIssueType === "DOCUMENT_ISSUE") {
    return `DOCUMENT_ISSUE:${order.paymentIssueStatus || "STOP"}`;
  }
  return order.paymentIssueType || "NONE";
}

// --- Helpers ---

// Расчёт суммы к оплате по заявке
// РП = ставка перевозчика + доп.расходы по перевозчику (где contractorId совпадает с carrierId заявки)
// К оплате = РП - взаимозачёт - предоплата
function calcTotalToPay(order: PaymentOrder): number {
  const carrierRate = order.carrierRate || 0;
  const carrierId = order.carrier?.id;

  // Сумма доп. расходов по перевозчику (где contractorId = carrierId заявки)
  const additionalCarrierExpenses = (order.expenses || []).reduce((sum, exp) => {
    if (exp.contractorId && carrierId && exp.contractorId === carrierId) {
      return sum + exp.amount;
    }
    return sum;
  }, 0);

  const rp = carrierRate + additionalCarrierExpenses;
  const prepay = order.carrierPrepayment || 0;
  const offset = order.carrierOffsetAmount || 0;

  return rp - prepay - offset;
}

function getPaymentStatus(dateStr: string | null) {
  if (!dateStr) return { label: "Без даты", color: "bg-slate-100 text-slate-600", type: "none" };
  const payDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  payDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((payDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `Просрочено на ${Math.abs(diffDays)} дн.`, color: "bg-red-100 text-red-700", type: "overdue" };
  if (diffDays === 0) return { label: "Сегодня", color: "bg-amber-100 text-amber-700", type: "today" };
  if (diffDays <= 3) return { label: `Через ${diffDays} дн.`, color: "bg-yellow-100 text-yellow-700", type: "soon" };
  return { label: `Через ${diffDays} дн.`, color: "bg-green-100 text-green-700", type: "later" };
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
}

function formatTextDate(text: string | null) {
  if (!text) return "—";
  // Убираем часть с временем (через пробел, T, или после запятой)
  const cleaned = text.replace(/[T,].*$/, "").trim();
  // Пробуем распарсить как ISO (yyyy-mm-dd)
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  // Если уже в формате dd.mm.yyyy — возвращаем как есть
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(cleaned)) return cleaned;
  // Пробуем через Date
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
  }
  return cleaned || "—";
}

function formatCurrency(amount: number | null) {
  if (amount == null) return "—";
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

function formatWeight(kg: number | null) {
  if (kg == null) return "—";
  const tons = kg / 1000;
  return `${tons.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

// --- ResizableHeader component (admin column width drag) ---

function ResizableHeader({
  col,
  label,
  width,
  isAdmin,
  isDragSource,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onWidthChange,
  isFirstColumn,
  headerContent,
}: {
  col: ColumnDef;
  label: string;
  width: number;
  isAdmin: boolean;
  isDragSource: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onWidthChange: (w: number) => void;
  isFirstColumn?: boolean;
  headerContent?: React.ReactNode;
}) {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(50, Math.min(500, startWidth + diff));
      onWidthChange(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <th
      draggable={isAdmin && col.key !== "link"}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={cn(
        "px-4 text-xs font-medium text-gray-500 uppercase tracking-wider relative select-none",
        col.align === "left" && "text-left",
        col.align === "right" && "text-right",
        col.align === "center" && "text-center",
        isAdmin && col.key !== "link" && "cursor-grab active:cursor-grabbing",
        isDropTarget && "bg-blue-50",
        isDragSource && "opacity-40",
        isFirstColumn && "sticky left-0 z-20 bg-gray-50 border-r border-gray-200"
      )}
      style={{ width }}
    >
      <div className="flex items-center gap-1 overflow-hidden">
        {isAdmin && col.key !== "link" && col.key !== "select" && <GripVertical className="w-3 h-3 text-gray-300 shrink-0" />}
        {headerContent || <span className="truncate">{label}</span>}
      </div>
      {isAdmin && col.key !== "link" && col.key !== "select" && (
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors z-20",
            isResizing ? "bg-blue-500" : "hover:bg-blue-400 bg-transparent"
          )}
          onMouseDown={handleMouseDown}
        />
      )}
    </th>
  );
}

// --- Component ---

export default function PaymentCalendarPage() {
  const router = useRouter();
  const session = useSession();
  const uid = session.user?.id || "";
  const { canView, canEdit, isAdmin, isLoading: permLoading } = usePermissions();
  const canViewOrders = canView(Entities.ORDERS);
  const canEditActualPaymentDate = isAdmin || canEdit(Entities.ORDERS);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState<string>("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [paymentDate, setPaymentDate] = useState<string>("");
  const [dateType, setDateType] = useState<string>("expected"); // expected или actual
  const [carrierFilter, setCarrierFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cardsHeight, setCardsHeight] = useState<number>(DEFAULT_CARDS_HEIGHT);
  const [tableHeight, setTableHeight] = useState<number>(DEFAULT_TABLE_HEIGHT);
  const [headerHeight, setHeaderHeight] = useState<number>(DEFAULT_HEADER_HEIGHT);
  const [rowHeight, setRowHeight] = useState<number>(DEFAULT_ROW_HEIGHT);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(DEFAULT_VISIBLE_KEYS);
  const [columnOrder, setColumnOrder] = useState<string[]>(ALL_COLUMNS.map(c => c.key));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    ALL_COLUMNS.forEach(c => { w[c.key] = c.width; });
    return w;
  });
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);
  const [dropColIdx, setDropColIdx] = useState<number | null>(null);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<Partial<GlobalSettings> | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [openDatePopoverId, setOpenDatePopoverId] = useState<string | null>(null);
  const [openDocDatePopoverId, setOpenDocDatePopoverId] = useState<string | null>(null);
  const [openReturnDatePopoverId, setOpenReturnDatePopoverId] = useState<string | null>(null);

  // Обработка URL параметра approval для автоматической установки галочек администратору
  const [approvalRequestId, setApprovalRequestId] = useState<string | null>(null);
  const [approvalLoaded, setApprovalLoaded] = useState(false);

  // Автообнаружение заявок на согласование для администратора
  const [pendingApprovalInfo, setPendingApprovalInfo] = useState<{
    requestId: string;
    requestedByName: string;
    itemCount: number;
    totalAmount: number;
  } | null>(null);
  const [pendingApprovalChecked, setPendingApprovalChecked] = useState(false);

  // Читаем параметр approval из URL при монтировании и при изменении
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    const approval = params.get('approval');
    
    console.log('[PaymentCalendar] URL approval param:', approval);
    
    if (approval) {
      // Если это новый ID или ещё не загружали
      if (approval !== approvalRequestId) {
        console.log('[PaymentCalendar] Setting approvalRequestId:', approval);
        setApprovalRequestId(approval);
        setApprovalLoaded(false);
      }
    }
  }, []); // Только при монтировании

  // Дополнительно слушаем изменения URL (для навигации внутри приложения)
  useEffect(() => {
    const checkUrl = () => {
      if (typeof window === 'undefined') return;
      
      const params = new URLSearchParams(window.location.search);
      const approval = params.get('approval');
      
      if (approval && approval !== approvalRequestId) {
        console.log('[PaymentCalendar] URL changed, new approval:', approval);
        setApprovalRequestId(approval);
        setApprovalLoaded(false);
      }
    };
    
    // Проверяем сразу
    checkUrl();
    
    // И периодически (для router.push)
    const interval = setInterval(checkUrl, 300);
    
    return () => clearInterval(interval);
  }, [approvalRequestId]);

  // Автоматическая проверка заявок на согласование для администратора
  // Если нет URL-параметра approval — проверяем pending запросы
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAdmin) return;
    if (permLoading) return;
    if (approvalRequestId) return; // уже есть из URL
    if (pendingApprovalChecked) return; // уже проверяли

    setPendingApprovalChecked(true);

    fetch('/api/payment-approval?status=PENDING', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (!data.requests || data.requests.length === 0) return;

        // Берём самый последний pending запрос (не старше 2 часов)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const recentRequests = data.requests.filter((r: any) =>
          new Date(r.createdAt) >= twoHoursAgo
        );
        if (recentRequests.length === 0) return;

        const latest = recentRequests[0];
        if (!latest.items || latest.items.length === 0) return;

        // Проверяем что заявки ещё в WAITING_PAYMENT и item ещё PENDING
        const validItems = latest.items.filter((item: any) =>
          item.order && item.itemStatus === 'PENDING' && item.order.status === 'WAITING_PAYMENT'
        );
        if (validItems.length === 0) return;

        const ids = validItems.map((item: any) => item.orderId);
        const totalAmt = validItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

        // Устанавливаем галочки
        setSelectedIds(new Set(ids));

        // Показываем баннер с информацией
        setPendingApprovalInfo({
          requestId: latest.id,
          requestedByName: latest.requestedBy?.name || 'Менеджер',
          itemCount: validItems.length,
          totalAmount: totalAmt,
        });
      })
      .catch(() => {});
  }, [isAdmin, permLoading, approvalRequestId, pendingApprovalChecked]);

  // Вычисляемые: активные столбцы в правильном порядке
  const activeColumns = columnOrder
    .filter(key => visibleKeys.has(key))
    .map(key => ALL_COLUMNS.find(c => c.key === key)!)
    .filter(Boolean);

  // Доступные для добавления (невидимые)
  const hiddenColumns = ALL_COLUMNS.filter(c => !visibleKeys.has(c.key));

  // --- Загрузка глобальных настроек ---
  const { data: globalSettingsData } = useQuery<{ settings: GlobalSettings }>({
    queryKey: ["paymentCalendarSettings"],
    queryFn: async () => {
      const response = await fetch("/api/payment-calendar-settings", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch settings");
      return response.json();
    },
    enabled: canViewOrders,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Применяем глобальные настройки при загрузке
  useEffect(() => {
    if (globalSettingsData?.settings) {
      const s = globalSettingsData.settings;
      setCardsHeight(s.cardsHeight);
      setTableHeight(s.tableHeight);
      setHeaderHeight(s.headerHeight);
      setRowHeight(s.rowHeight);
      setVisibleKeys(new Set(s.visibleKeys));
      
      // Ensure all keys are in columnOrder
      const allKeys = ALL_COLUMNS.map(c => c.key);
      const missingKeys = allKeys.filter(k => !s.columnOrder.includes(k));
      if (missingKeys.length > 0) {
        setColumnOrder([...missingKeys, ...s.columnOrder]);
      } else {
        setColumnOrder(s.columnOrder);
      }
      
      setColumnWidths(prev => {
        const merged = { ...prev };
        for (const [k, v] of Object.entries(s.columnWidths)) {
          if (k in merged && typeof v === "number" && v >= 50 && v <= 500) merged[k] = v;
        }
        return merged;
      });
      setColumnLabels(s.columnLabels);
    }
  }, [globalSettingsData]);

  // --- Сохранение глобальных настроек (только для админа) ---
  const saveGlobalSettings = useCallback(async (settings: Partial<GlobalSettings>) => {
    if (!isAdmin) return;
    
    try {
      const response = await fetch("/api/payment-calendar-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error("Failed to save settings");
      
      await queryClient.invalidateQueries({ queryKey: ["paymentCalendarSettings"] });
      setHasUnsavedChanges(false);
      setPendingSettings(null);
      
      toast({ title: "Настройки сохранены", description: "Изменения применены для всех пользователей" });
    } catch (err) {
      console.error("Failed to save global settings:", err);
      toast({ title: "Ошибка", description: "Не удалось сохранить настройки", variant: "destructive" });
    }
  }, [isAdmin, queryClient, toast]);

  // Отслеживание несохраненных изменений (для админа)
  useEffect(() => {
    if (isAdmin && (cardsHeight !== DEFAULT_CARDS_HEIGHT || tableHeight !== DEFAULT_TABLE_HEIGHT)) {
      setHasUnsavedChanges(true);
    }
  }, [cardsHeight, tableHeight, headerHeight, rowHeight, visibleKeys, columnOrder, columnWidths, columnLabels, isAdmin]);

  // --- Column width update ---
  const updateColumnWidth = useCallback((key: string, width: number) => {
    setColumnWidths(prev => ({ ...prev, [key]: width }));
  }, []);

  // --- Column label helpers ---
  const getColumnLabel = useCallback((col: ColumnDef) => columnLabels[col.key] || col.label, [columnLabels]);
  const saveColumnLabel = useCallback((key: string, newLabel: string) => {
    setColumnLabels(prev => {
      if (!newLabel.trim()) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: newLabel.trim() };
    });
    setEditingLabelKey(null);
  }, []);

  // --- Vertical resize ---
  const verticalResize = useRef({ active: false, startY: 0, startVal: 0, min: 24, setter: (v: number) => {} });

  const startVerticalResize = useCallback((e: React.MouseEvent, currentVal: number, min: number, setter: (v: number) => void) => {
    e.preventDefault();
    verticalResize.current = { active: true, startY: e.clientY, startVal: currentVal, min, setter };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = verticalResize.current;
      if (!r.active) return;
      const max = r.min === 120 ? 2000 : (r.min === 40 ? 500 : 120);
      r.setter(Math.max(r.min, Math.min(max, r.startVal + (e.clientY - r.startY))));
    };
    const onUp = () => {
      if (!verticalResize.current.active) return;
      verticalResize.current.active = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // --- Column drag & drop (in table header) ---
  const handleColDragStart = useCallback((idx: number) => setDragColIdx(idx), []);
  const handleColDragEnter = useCallback((idx: number) => {
    if (dragColIdx !== null && dragColIdx !== idx) setDropColIdx(idx);
  }, [dragColIdx]);
  const handleColDragEnd = useCallback(() => {
    if (dragColIdx !== null && dropColIdx !== null && dragColIdx !== dropColIdx) {
      const keys = activeColumns.map(c => c.key);
      const [moved] = keys.splice(dragColIdx, 1);
      keys.splice(dropColIdx, 0, moved);
      // Обновляем columnOrder: новые ключи идут в начале, остальные сохраняют порядок
      const rest = columnOrder.filter(k => !keys.includes(k));
      setColumnOrder([...keys, ...rest]);
    }
    setDragColIdx(null);
    setDropColIdx(null);
  }, [dragColIdx, dropColIdx, activeColumns, columnOrder]);

  // --- Column add/remove (dialog) ---
  const addColumn = useCallback((key: string) => {
    setVisibleKeys(prev => new Set([...prev, key]));
    // Добавляем в columnOrder если ещё нет
    setColumnOrder(prev => prev.includes(key) ? prev : [...prev, key]);
  }, []);

  const removeColumn = useCallback((key: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const moveColumnInDialog = useCallback((keys: string[], fromIdx: number, toIdx: number) => {
    const arr = [...keys];
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    setColumnOrder(arr);
  }, []);

  // --- Загрузка филиалов (для фильтра админа) ---
  const { data: branches } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["branchesForFilter"],
    queryFn: async () => {
      const response = await fetch("/api/branches", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch branches");
      const data = await response.json();
      return data.branches || data;
    },
    enabled: isAdmin,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // --- Загрузка перевозчиков (для фильтра) ---
  const { data: carriers } = useQuery<{ id: string; name: string; isBlocked?: boolean }[]>({
    queryKey: ["carriersForFilter"],
    queryFn: async () => {
      const response = await fetch("/api/carriers?includeBlocked=true", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch carriers");
      const data = await response.json();
      return data.carriers || data;
    },
    enabled: canViewOrders,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // --- Fetch data (filtered for table) ---
  const { data, isLoading, refetch } = useQuery<{ orders: PaymentOrder[] }>({
    queryKey: ["paymentCalendar", search, branchFilter, paymentDate, dateType, carrierFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (isAdmin && branchFilter && branchFilter !== "all") params.set("branchId", branchFilter);
      if (paymentDate) params.set("paymentDate", paymentDate);
      if (dateType) params.set("dateType", dateType);
      if (carrierFilter && carrierFilter !== "all") params.set("carrierId", carrierFilter);
      const response = await fetch(`/api/orders/payment-calendar?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch payment calendar");
      return response.json();
    },
    enabled: canViewOrders,
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
  });

  // --- Fetch ALL orders for cards (no filters) ---
  const { data: allData } = useQuery<{ orders: PaymentOrder[] }>({
    queryKey: ["paymentCalendarAll"],
    queryFn: async () => {
      const response = await fetch('/api/orders/payment-calendar', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch all orders');
      return response.json();
    },
    enabled: canViewOrders,
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
  });

  const orders = data?.orders || [];
  const allOrders = allData?.orders || [];

  // --- Расчёты для карточек (по ВСЕМ заказам, без фильтров, без проблемных документов) ---
  const ordersForCards = allOrders.filter(o => o.paymentIssueType !== "DOCUMENT_ISSUE");

  const todayLocal = new Date();
  todayLocal.setHours(0, 0, 0, 0);
  // Следующий платежный (рабочий) день — если завтра выходной/праздник, берём ближайший рабочий
  const nextPaymentDay = new Date(todayLocal);
  do {
    nextPaymentDay.setDate(nextPaymentDay.getDate() + 1);
  } while (!isRussianWorkingDay(nextPaymentDay));

  const overdueOrders = ordersForCards.filter(o => getPaymentStatus(o.carrierExpectedPaymentDate).type === "overdue");
  const todayOrders = ordersForCards.filter(o => getPaymentStatus(o.carrierExpectedPaymentDate).type === "today");
  const tomorrowOrders = ordersForCards.filter(o => {
    if (!o.carrierExpectedPaymentDate) return false;
    const d = new Date(o.carrierExpectedPaymentDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === nextPaymentDay.getTime();
  });
  const overdueAmount = overdueOrders.reduce((sum, o) => sum + calcTotalToPay(o), 0);
  const todayAmount = todayOrders.reduce((sum, o) => sum + calcTotalToPay(o), 0);
  const tomorrowAmount = tomorrowOrders.reduce((sum, o) => sum + calcTotalToPay(o), 0);

  // По фактической дате оплаты (локальные даты, без UTC)
  const todayActualOrders = ordersForCards.filter(o => {
    if (!o.carrierActualPaymentDate) return false;
    const d = new Date(o.carrierActualPaymentDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === todayLocal.getTime();
  });
  const tomorrowActualOrders = ordersForCards.filter(o => {
    if (!o.carrierActualPaymentDate) return false;
    const d = new Date(o.carrierActualPaymentDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === nextPaymentDay.getTime();
  });
  const todayActualAmount = todayActualOrders.reduce((sum, o) => sum + calcTotalToPay(o), 0);
  const tomorrowActualAmount = tomorrowActualOrders.reduce((sum, o) => sum + calcTotalToPay(o), 0);

  // Загрузка и установка галочек при переходе из уведомления
  useEffect(() => {
    console.log('[PaymentCalendar] Selection useEffect:', {
      approvalRequestId,
      approvalLoaded,
      permLoading,
      isAdmin,
      ordersCount: orders.length,
      isLoading
    });
    
    // Условия для загрузки
    if (!approvalRequestId) {
      console.log('[PaymentCalendar] No approvalRequestId, skip');
      return;
    }
    
    if (approvalLoaded) {
      console.log('[PaymentCalendar] Already loaded, skip');
      return;
    }
    
    if (permLoading) {
      console.log('[PaymentCalendar] Permissions loading, wait');
      return;
    }
    
    if (isLoading) {
      console.log('[PaymentCalendar] Orders loading, wait');
      return;
    }
    
    if (!isAdmin) {
      console.log('[PaymentCalendar] Not admin, skip');
      setApprovalLoaded(true);
      return;
    }
    
    // Все условия выполнены - загружаем
    console.log('[PaymentCalendar] Fetching approval request:', approvalRequestId);
    
    fetch(`/api/payment-approval/${approvalRequestId}`, { credentials: "include" })
      .then(res => {
        console.log('[PaymentCalendar] API response:', res.status);
        return res.json().then(data => ({ ok: res.ok, data }));
      })
      .then(({ ok, data }) => {
        if (!ok) {
          console.error('[PaymentCalendar] API error:', data);
          toast({ 
            title: "Ошибка", 
            description: data.error || "Не удалось загрузить заявку", 
            variant: "destructive" 
          });
          setApprovalLoaded(true);
          return;
        }
        
        console.log('[PaymentCalendar] Approval data:', data);
        
        if (data.request?.items?.length > 0) {
          const ids = data.request.items.map((item: any) => item.orderId);
          console.log('[PaymentCalendar] Setting selection:', ids);
          setSelectedIds(new Set(ids));
          toast({ 
            title: "Заявки выбраны", 
            description: `Выбрано ${ids.length} заявок для согласования` 
          });
        } else {
          console.log('[PaymentCalendar] No items in response');
        }
        setApprovalLoaded(true);
      })
      .catch(err => {
        console.error('[PaymentCalendar] Fetch error:', err);
        toast({ 
          title: "Ошибка", 
          description: "Не удалось загрузить заявку на согласование", 
          variant: "destructive" 
        });
        setApprovalLoaded(true);
      });
  }, [approvalRequestId, approvalLoaded, permLoading, isAdmin, isLoading, orders.length]);

  // --- Выбор заявок ---
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === orders.length) return new Set();
      return new Set(orders.map(o => o.id));
    });
  }, [orders]);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setPendingApprovalInfo(null);
  }, []);
  const selectedOrders = useMemo(() => orders.filter(o => selectedIds.has(o.id)), [orders, selectedIds]);
  const selectedTotal = useMemo(() => {
    return selectedOrders.reduce((s, o) => s + calcTotalToPay(o), 0);
  }, [selectedOrders]);
  const allSelected = orders.length > 0 && selectedIds.size === orders.length;

  // --- Открытие заявки для редактирования ---
  const openOrder = useCallback((id: string) => {
    router.push(`/orders?edit=${id}&from=payment-calendar`);
  }, [router]);

  // --- Сохранение фактической даты оплаты напрямую ---
  const savePaymentDateDirect = useCallback(async (orderId: string, date: Date) => {
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const response = await fetch("/api/orders/payment-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: orderId,
          carrierActualPaymentDate: dateStr,
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      refetch();
      toast({ title: "Дата сохранена", description: "Фактическая дата оплаты обновлена" });
    } catch (err) {
      console.error("Failed to save payment date:", err);
      toast({ title: "Ошибка", description: "Не удалось сохранить дату", variant: "destructive" });
    }
  }, [refetch, toast]);

  // --- Сохранение даты сдачи документов (только для админа) ---
  const saveDocumentDate = useCallback(async (orderId: string, date: Date) => {
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const response = await fetch("/api/orders/payment-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: orderId,
          documentSubmissionDate: dateStr,
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      setOpenDocDatePopoverId(null);
      refetch();
      toast({ title: "Дата сохранена", description: "Дата сдачи документов обновлена" });
    } catch (err) {
      console.error("Failed to save document date:", err);
      toast({ title: "Ошибка", description: "Не удалось сохранить дату", variant: "destructive" });
    }
  }, [refetch, toast]);

  // --- Сохранение даты сдачи порожнего (только для админа) ---
  const saveReturnDate = useCallback(async (orderId: string, date: Date) => {
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const response = await fetch("/api/orders/payment-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: orderId,
          emptyContainerReturnDate: dateStr,
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      setOpenReturnDatePopoverId(null);
      refetch();
      toast({ title: "Дата сохранена", description: "Дата возврата контейнера обновлена" });
    } catch (err) {
      console.error("Failed to save return date:", err);
      toast({ title: "Ошибка", description: "Не удалось сохранить дату", variant: "destructive" });
    }
  }, [refetch, toast]);

  // --- Сохранение срока оплаты (только для админа) ---
  const [editingPaymentDaysId, setEditingPaymentDaysId] = useState<string | null>(null);
  const [editingPaymentDaysValue, setEditingPaymentDaysValue] = useState<string>("");

  const startEditingPaymentDays = useCallback((orderId: string, currentValue: number | null) => {
    setEditingPaymentDaysId(orderId);
    setEditingPaymentDaysValue(currentValue?.toString() || "");
  }, []);

  const savePaymentDays = useCallback(async (orderId: string) => {
    const val = editingPaymentDaysValue.trim();
    const numVal = val ? parseInt(val) : null;
    try {
      const response = await fetch("/api/orders/payment-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId,
          carrierPaymentDays: numVal,
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      setEditingPaymentDaysId(null);
      refetch();
      toast({ title: "Срок оплаты сохранён", description: `Срок оплаты изменён на ${numVal ?? "—"} дней` });
    } catch (err) {
      console.error("Failed to save payment days:", err);
      toast({ title: "Ошибка", description: "Не удалось сохранить срок оплаты", variant: "destructive" });
    }
  }, [editingPaymentDaysValue, refetch, toast]);

  // --- Утверждение оплат (только для админа) ---
  const [isApproving, setIsApproving] = useState(false);
  
  const approveSelectedOrders = useCallback(async () => {
    if (selectedIds.size === 0) return;
    
    setIsApproving(true);
    try {
      const response = await fetch("/api/orders/payment-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to approve");
      }
      
      const result = await response.json();
      
      toast({ 
        title: "Оплаты утверждены", 
        description: `Статус ${result.updatedCount} заявок изменён на "Оплачено"` 
      });
      
      setSelectedIds(new Set());
      setPendingApprovalInfo(null);
      
      // Обновляем статус запроса на согласование если он есть
      if (pendingApprovalInfo?.requestId) {
        fetch(`/api/payment-approval/${pendingApprovalInfo.requestId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'approve' }),
        }).catch(() => {});
      }
      
      refetch();
    } catch (err: any) {
      console.error("Failed to approve orders:", err);
      toast({ 
        title: "Ошибка", 
        description: err.message || "Не удалось утвердить оплаты", 
        variant: "destructive" 
      });
    } finally {
      setIsApproving(false);
    }
  }, [selectedIds, refetch, toast, pendingApprovalInfo]);

  // --- Отклонение заявок на согласование (для администратора) ---
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  const rejectSelectedOrders = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsRejecting(true);
    try {
      // Обновляем статус запроса на согласование
      if (pendingApprovalInfo?.requestId) {
        const res = await fetch(`/api/payment-approval/${pendingApprovalInfo.requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "reject", note: rejectComment || undefined }),
        });
        if (!res.ok) throw new Error("Не удалось отклонить");
      }

      toast({
        title: "Заявки отклонены",
        description: `${selectedIds.size} заявок отклонены. Менеджер получит уведомление.`
      });

      setSelectedIds(new Set());
      setPendingApprovalInfo(null);
      setRejectComment("");
      setRejectDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message || "Не удалось отклонить", variant: "destructive" });
    } finally {
      setIsRejecting(false);
    }
  }, [selectedIds, refetch, toast, pendingApprovalInfo, rejectComment]);

  // --- Отправка на согласование (для менеджеров) ---
  const [isSendingForApproval, setIsSendingForApproval] = useState(false);
  
  const sendForApproval = useCallback(async () => {
    if (selectedIds.size === 0) return;
    
    setIsSendingForApproval(true);
    try {
      const response = await fetch("/api/payment-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send for approval");
      }
      
      toast({ 
        title: "Отправлено на согласование", 
        description: `${selectedIds.size} заявок отправлены на согласование администратору` 
      });
      
      // Отправляем событие для обновления уведомлений у других пользователей
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notifications-update'));
      }
      
      // Не очищаем галочки - менеджер должен видеть что отправил
      refetch();
    } catch (err: any) {
      console.error("Failed to send for approval:", err);
      toast({ 
        title: "Ошибка", 
        description: err.message || "Не удалось отправить на согласование", 
        variant: "destructive" 
      });
    } finally {
      setIsSendingForApproval(false);
    }
  }, [selectedIds, refetch, toast]);

  // --- Сохранение статуса проблемы ---
  const [issueCommentDialog, setIssueCommentDialog] = useState<{ orderId: string; issueStatus: string; comment: string } | null>(null);

  // Диалог отправки на доработку (для админа)
  const [sendBackDialog, setSendBackDialog] = useState<{ orderId: string; orderNumber: string | null } | null>(null);
  const [sendBackComment, setSendBackComment] = useState<string>("");

  const savePaymentIssue = useCallback(async (orderId: string, issueType: string, issueStatus?: string, comment?: string, resolution?: string) => {
    // Если ПРОБЛЕМА или ПРЕТЕНЗИЯ - нужен комментарий
    if (issueType === "DOCUMENT_ISSUE" && (issueStatus === "PROBLEM" || issueStatus === "CLAIM") && !comment) {
      setIssueCommentDialog({ orderId, issueStatus: issueStatus!, comment: "" });
      return;
    }
    
    try {
      const patchBody: any = {
        orderId,
        paymentIssueType: issueType || null,
        paymentIssueStatus: issueStatus || null,
        paymentIssueComment: comment || null,
      };

      // Если передан resolution — отправляем его отдельно
      if (resolution) {
        patchBody.paymentIssueResolution = resolution;
      }

      const response = await fetch("/api/orders/payment-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patchBody),
      });
      
      if (!response.ok) throw new Error("Failed to update");
      
      refetch();
      
      // Если Взаимозачёт - автоматически выбираем заявку для утверждения
      if (issueType === "OFFSET") {
        setSelectedIds(prev => new Set([...prev, orderId]));
        toast({ title: "Взаимозачёт", description: "Дата оплаты установлена, заявка готова к утверждению" });
      } else if (resolution === "RESOLVED") {
        toast({ title: "Проблема исправлена", description: "Статус в платёжном календаре: Без проблем" });
      } else if (issueType === "DOCUMENT_ISSUE") {
        toast({ title: "Проблема с документами", description: "Статус проблемы установлен" });
      } else {
        toast({ title: "Статус сброшен", description: "Проблема с документами снята" });
      }
    } catch (err) {
      console.error("Failed to save payment issue:", err);
      toast({ title: "Ошибка", description: "Не удалось сохранить статус", variant: "destructive" });
    }
  }, [refetch, toast]);

  const saveIssueWithComment = useCallback(async () => {
    if (!issueCommentDialog) return;
    
    try {
      const response = await fetch("/api/orders/payment-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: issueCommentDialog.orderId,
          paymentIssueType: "DOCUMENT_ISSUE",
          paymentIssueStatus: issueCommentDialog.issueStatus,
          paymentIssueComment: issueCommentDialog.comment || null,
        }),
      });
      
      if (!response.ok) throw new Error("Failed to update");
      
      setIssueCommentDialog(null);
      refetch();
      toast({ title: "Проблема с документами", description: "Статус проблемы установлен" });
    } catch (err) {
      console.error("Failed to save payment issue:", err);
      toast({ title: "Ошибка", description: "Не удалось сохранить статус", variant: "destructive" });
    }
  }, [issueCommentDialog, refetch, toast]);

  // Отправка на доработку (для админа)
  const handleSendBack = useCallback(async () => {
    if (!sendBackDialog) return;

    try {
      const response = await fetch("/api/orders/payment-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: sendBackDialog.orderId,
          paymentIssueResolution: "SENT_BACK",
          resolutionComment: sendBackComment || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to send back");

      setSendBackDialog(null);
      setSendBackComment("");
      refetch();
      toast({ title: "Отправлено на доработку", description: "Заявка возвращена менеджеру" });
    } catch (err) {
      console.error("Failed to send back:", err);
      toast({ title: "Ошибка", description: "Не удалось отправить на доработку", variant: "destructive" });
    }
  }, [sendBackDialog, sendBackComment, refetch, toast]);

  // --- Render cell ---
  const renderCell = (order: PaymentOrder, col: ColumnDef) => {
    switch (col.key) {
      case "status": {
        // Если проблема с документами
        if (order.paymentIssueType === "DOCUMENT_ISSUE") {
          const resConf = order.paymentIssueResolution && RESOLUTION_CONFIG[order.paymentIssueResolution];
          if (resConf) {
            return (
              <div className="flex flex-col gap-1">
                <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap bg-red-100 text-red-700">Проблема с документами</span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", resConf.badgeClass)}>{resConf.label}</span>
              </div>
            );
          }
          return <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap bg-red-100 text-red-700">Проблема с документами</span>;
        }
        const st = getPaymentStatus(order.carrierExpectedPaymentDate);
        return <span className={cn("text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap", st.color)}>{st.label}</span>;
      }
      case "paymentStatus": {
        // Только админ может менять статус
        if (!isAdmin) {
          // Только отображение для не-админов
          if (order.paymentIssueType === "OFFSET") {
            return <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap bg-purple-100 text-purple-700">Взаимозачёт</span>;
          }
          if (order.paymentIssueType === "DOCUMENT_ISSUE") {
            const status = PAYMENT_ISSUE_STATUSES.find(s => s.value === order.paymentIssueStatus);
            const resConf = order.paymentIssueResolution && RESOLUTION_CONFIG[order.paymentIssueResolution];
            return (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap bg-red-100 text-red-700">
                  {status?.label || "Проблема"}
                </span>
                {resConf && (
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", resConf.badgeClass)}>
                    {resConf.label}
                  </span>
                )}
              </div>
            );
          }
          return <span className="text-xs text-gray-400">—</span>;
        }
        
        // Для админа - dropdown с группами
        // Если заявка на проверке (PENDING_REVIEW) — показываем кнопки принятия/возврата
        if (order.paymentIssueResolution === "PENDING_REVIEW") {
          return (
            <div className="flex items-center gap-1">
              <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap bg-blue-100 text-blue-700 mr-1">На проверке</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 px-2"
                onClick={() => savePaymentIssue(order.id, "DOCUMENT_ISSUE", order.paymentIssueStatus || undefined, order.paymentIssueComment || undefined, "RESOLVED")}
              >
                <CheckCircle2 className="w-3 h-3 mr-0.5" />
                Исправлено
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-orange-700 border-orange-300 hover:bg-orange-50 px-2"
                onClick={() => {
                  setSendBackDialog({ orderId: order.id, orderNumber: order.orderNumber });
                }}
              >
                <RotateCcw className="w-3 h-3 mr-0.5" />
                На доработку
              </Button>
            </div>
          );
        }

        return (
          <Select
            value={getPaymentIssueValue(order)}
            onValueChange={(value) => {
              if (value === "NONE") {
                savePaymentIssue(order.id, "");
              } else if (value === "OFFSET") {
                savePaymentIssue(order.id, "OFFSET");
              } else if (value.startsWith("DOCUMENT_ISSUE:")) {
                const issueStatus = value.split(":")[1];
                savePaymentIssue(order.id, "DOCUMENT_ISSUE", issueStatus);
              }
            }}
          >
            <SelectTrigger className={cn(
              "h-7 text-xs w-[130px]",
              order.paymentIssueType === "DOCUMENT_ISSUE" && "border-red-300 bg-red-50",
              order.paymentIssueType === "OFFSET" && "border-purple-300 bg-purple-50"
            )}>
              <SelectValue>{getPaymentIssueDisplayLabel(order)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="NONE">Без проблем</SelectItem>
              <SelectGroup>
                <SelectLabel className="text-xs text-gray-500 px-2">Проблемные документы</SelectLabel>
                {PAYMENT_ISSUE_STATUSES.map(s => (
                  <SelectItem key={s.value} value={`DOCUMENT_ISSUE:${s.value}`}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectItem value="OFFSET">Взаимозачёт</SelectItem>
            </SelectContent>
          </Select>
        );
      }
      case "paymentDate":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{formatDate(order.carrierExpectedPaymentDate)}</span>;
      case "orderNumber":
        return <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{order.orderNumber || "—"}</span>;
      case "containerNumber":
        return <span className="text-sm text-gray-900 font-medium whitespace-nowrap">{order.containerNumber || "—"}</span>;
      case "containerType":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{order.containerType?.name || "—"}</span>;
      case "cargoName":
        return <span className="text-sm text-gray-600 whitespace-nowrap max-w-[150px] truncate block">{order.cargoName || "—"}</span>;
      case "cargoWeight":
        return <span className="text-sm text-gray-900 whitespace-nowrap">{formatWeight(order.cargoWeight)}</span>;
      case "carrier":
        return (
          <span className={cn(
            "text-sm whitespace-nowrap max-w-[180px] truncate block",
            order.carrier?.isBlocked ? "text-red-600" : "text-gray-600"
          )}>
            {order.carrier?.name || "—"}
            {order.carrier?.isBlocked && <span className="ml-1 text-xs">(заблокирован)</span>}
          </span>
        );
      case "driver":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{order.driver?.fullName || "—"}</span>;
      case "truck":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{order.truck?.vehicleNumber || "—"}</span>;
      case "client":
        return <span className="text-sm text-gray-600 whitespace-nowrap max-w-[180px] truncate block">{order.client?.name || "—"}</span>;
      case "manager":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{order.assignedManager?.name || "—"}</span>;
      case "route": {
        if (order.routePoints && order.routePoints.length > 0) {
          const sorted = [...order.routePoints].sort((a, b) => a.pointOrder - b.pointOrder);
          const cities: string[] = [];
          for (const p of sorted) {
            if (p.city && (cities.length === 0 || cities[cities.length - 1] !== p.city)) {
              cities.push(p.city);
            }
          }
          if (cities.length === 1) return <span className="text-sm text-gray-600 whitespace-nowrap">{cities[0] || "—"}</span>;
          return <span className="text-sm text-gray-600 whitespace-nowrap">{cities.join(" → ") || "—"}</span>;
        }
        return <span className="text-sm text-gray-600 whitespace-nowrap">{[order.loadingCity, order.unloadingCity].filter(Boolean).join(" → ") || "—"}</span>;
      }
      case "loadingDatetime":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{formatTextDate(order.loadingDatetime)}</span>;
      case "unloadingDatetime":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{formatTextDate(order.unloadingDatetime)}</span>;
      case "carrierRate":
        return <span className="text-sm text-gray-900 font-medium whitespace-nowrap">{formatCurrency(order.carrierRate)}</span>;
      case "clientRate":
        return <span className="text-sm text-gray-900 font-medium whitespace-nowrap">{formatCurrency(order.clientRate)}</span>;
      case "carrierPrepayment":
        return <span className="text-sm text-gray-900 whitespace-nowrap">{formatCurrency(order.carrierPrepayment)}</span>;
      case "carrierPrepaymentDate":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{formatDate(order.carrierPrepaymentDate)}</span>;
      case "carrierOffsetAmount":
        return <span className="text-sm text-gray-900 whitespace-nowrap">{formatCurrency(order.carrierOffsetAmount)}</span>;
      case "totalToPay": {
        return <span className="text-sm text-gray-900 font-bold whitespace-nowrap">{formatCurrency(calcTotalToPay(order))}</span>;
      }
      case "clientExpectedPaymentDate":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{formatDate(order.clientExpectedPaymentDate)}</span>;
      case "carrierActualPaymentDate":
        // Popover с календарём для выбора даты
        return (
          <Popover open={openDatePopoverId === order.id} onOpenChange={(open) => setOpenDatePopoverId(open ? order.id : null)}>
            <PopoverTrigger asChild>
              <button
                disabled={!canEditActualPaymentDate}
                className={cn(
                  "flex items-center gap-1 text-sm whitespace-nowrap rounded px-1 py-0.5 transition-colors",
                  canEditActualPaymentDate && "hover:bg-gray-100 cursor-pointer",
                  !canEditActualPaymentDate && "cursor-default"
                )}
              >
                <span className={order.carrierActualPaymentDate ? "text-gray-600" : "text-gray-400"}>
                  {formatDate(order.carrierActualPaymentDate)}
                </span>
                {canEditActualPaymentDate && (
                  <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                )}
              </button>
            </PopoverTrigger>
            {canEditActualPaymentDate && (
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={order.carrierActualPaymentDate ? new Date(order.carrierActualPaymentDate) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      // Сохраняем дату и закрываем popover
                      savePaymentDateDirect(order.id, date);
                      setOpenDatePopoverId(null);
                    }
                  }}
                  locale={ru}
                  initialFocus
                />
              </PopoverContent>
            )}
          </Popover>
        );
      case "documentSubmissionDate":
        if (isAdmin) {
          return (
            <Popover open={openDocDatePopoverId === order.id} onOpenChange={(open) => setOpenDocDatePopoverId(open ? order.id : null)}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 text-sm whitespace-nowrap rounded px-1 py-0.5 hover:bg-gray-100 cursor-pointer transition-colors">
                  <span className={order.documentSubmissionDate ? "text-gray-600" : "text-gray-400"}>
                    {formatDate(order.documentSubmissionDate)}
                  </span>
                  <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={order.documentSubmissionDate ? new Date(order.documentSubmissionDate) : undefined}
                  onSelect={(date) => {
                    if (date) saveDocumentDate(order.id, date);
                  }}
                  locale={ru}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          );
        }
        return <span className="text-sm text-gray-600 whitespace-nowrap">{formatDate(order.documentSubmissionDate)}</span>;
      case "emptyContainerReturnDate":
        if (isAdmin) {
          return (
            <Popover open={openReturnDatePopoverId === order.id} onOpenChange={(open) => setOpenReturnDatePopoverId(open ? order.id : null)}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 text-sm whitespace-nowrap rounded px-1 py-0.5 hover:bg-gray-100 cursor-pointer transition-colors">
                  <span className={order.emptyContainerReturnDate ? "text-gray-600" : "text-gray-400"}>
                    {formatDate(order.emptyContainerReturnDate)}
                  </span>
                  <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={order.emptyContainerReturnDate ? new Date(order.emptyContainerReturnDate) : undefined}
                  onSelect={(date) => {
                    if (date) saveReturnDate(order.id, date);
                  }}
                  locale={ru}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          );
        }
        return <span className="text-sm text-gray-600 whitespace-nowrap">{formatDate(order.emptyContainerReturnDate)}</span>;
      case "paymentDays":
        if (isAdmin && editingPaymentDaysId === order.id) {
          return (
            <Popover open={true} onOpenChange={(open) => { if (!open) setEditingPaymentDaysId(null); }}>
              <PopoverTrigger asChild>
                <span
                  className="text-sm text-blue-600 cursor-pointer underline"
                >
                  {editingPaymentDaysValue || "—"}
                </span>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="start" side="bottom">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Срок оплаты (рабочих дней)</label>
                    <Input
                      type="number"
                      value={editingPaymentDaysValue}
                      onChange={(e) => setEditingPaymentDaysValue(e.target.value)}
                      className="h-10 w-full text-base text-right px-3"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") savePaymentDays(order.id);
                        if (e.key === "Escape") setEditingPaymentDaysId(null);
                      }}
                      autoFocus
                      min={0}
                      placeholder="Кол-во дней"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setEditingPaymentDaysId(null)}>
                      Отмена
                    </Button>
                    <Button size="sm" className="h-8" onClick={() => savePaymentDays(order.id)}>
                      Сохранить
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          );
        }
        return (
          <span
            className={cn("text-sm", isAdmin ? "text-gray-500 cursor-pointer hover:text-blue-600 hover:underline" : "text-gray-500")}
            onClick={() => isAdmin && startEditingPaymentDays(order.id, order.carrierPaymentDays)}
            title={isAdmin ? "Нажмите для редактирования" : undefined}
          >
            {order.carrierPaymentDays ?? "—"}
          </span>
        );
      case "actualPaymentDays": {
        const baseDays = order.carrierPaymentDays;
        const returnDate = order.emptyContainerReturnDate;
        const docDate = order.documentSubmissionDate;
        if (!baseDays || !returnDate || !docDate) {
          return <span className="text-sm text-gray-500">{baseDays ?? "—"}</span>;
        }
        const graceDays = order.branch?.documentGraceDays;
        if (graceDays === null || graceDays === undefined) {
          return <span className="text-sm text-gray-500">{baseDays}</span>;
        }
        const workingDaysBetween = countRussianWorkingDays(new Date(returnDate), new Date(docDate));
        const extraDays = Math.max(0, workingDaysBetween - graceDays);
        const actual = baseDays + extraDays;
        return <span className={cn("text-sm font-medium", actual > baseDays ? "text-orange-600" : "text-gray-500")}>{actual}</span>;
      }
      case "branch":
        return <span className="text-sm text-gray-600 whitespace-nowrap">{order.branch?.name || "—"}</span>;
      case "createdAt":
        return <span className="text-sm text-gray-500 whitespace-nowrap">{formatDate(order.createdAt)}</span>;
      case "notes":
        return <span className="text-sm text-gray-500 max-w-[200px] truncate block">{order.notes || "—"}</span>;
      case "select":
        return (
          <Checkbox
            checked={selectedIds.has(order.id)}
            onCheckedChange={() => toggleSelect(order.id)}
            className="mt-0.5"
          />
        );
      case "link":
        return (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openOrder(order.id)} title="Открыть заявку">
            <FileText className="w-4 h-4 text-blue-500" />
          </Button>
        );
      default:
        return null;
    }
  };

  // --- Loading / No access ---
  if (permLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Платежный календарь" />
        <main className="flex-1 flex items-center justify-center"><p className="text-gray-400">Загрузка...</p></main>
      </div>
    );
  }
  if (!canViewOrders) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Платежный календарь" />
        <main className="flex-1 flex items-center justify-center"><p className="text-gray-400">У вас нет доступа к этой странице.</p></main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Платежный календарь" />

      <main className="flex-1 overflow-auto flex flex-col p-6 pb-0">
        {/* Закреплённая панель с карточками */}
        <div className="sticky top-0 z-20 shrink-0" style={{ height: cardsHeight }}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 h-full">
            <Card className="overflow-hidden">
              <CardContent className="pt-4 pb-4 h-full flex items-center">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-100 shrink-0"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-red-600">{overdueOrders.length}</p>
                    <p className="text-xs text-red-500 font-medium">{formatCurrency(overdueAmount)}</p>
                    <p className="text-xs text-gray-500">Просрочено</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4 pb-4 h-full flex items-center">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 shrink-0"><CheckCircle2 className="w-5 h-5 text-amber-600" /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 mb-1">Сегодня к оплате</p>
                    <p className="text-xs text-gray-400">По плану: <span className="font-semibold text-amber-700">{todayOrders.length}</span> / {formatCurrency(todayAmount)}</p>
                    <p className="text-xs text-gray-400">По факту: <span className="font-semibold text-amber-700">{todayActualOrders.length}</span> / {formatCurrency(todayActualAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4 pb-4 h-full flex items-center">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 shrink-0"><span className="text-lg font-bold text-blue-600">₽</span></div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 mb-1">Завтра к оплате</p>
                    <p className="text-xs text-gray-400">По плану: <span className="font-semibold text-blue-700">{tomorrowOrders.length}</span> / {formatCurrency(tomorrowAmount)}</p>
                    <p className="text-xs text-gray-400">По факту: <span className="font-semibold text-blue-700">{tomorrowActualOrders.length}</span> / {formatCurrency(tomorrowActualAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Ручка ресайза карточек */}
        {isAdmin && (
          <div
            onMouseDown={(e) => startVerticalResize(e, cardsHeight, 40, setCardsHeight)}
            className="shrink-0 flex items-center justify-center h-4 cursor-row-resize group hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-1 text-gray-300 group-hover:text-gray-400 transition-colors">
              <GripHorizontal className="w-5 h-3" /><GripHorizontal className="w-5 h-3 -ml-2" />
            </div>
          </div>
        )}

        {/* Баннер: есть заявки на согласование */}
        {isAdmin && pendingApprovalInfo && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 shrink-0">
              <Send className="w-4.5 h-4.5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                Есть заявки на согласование в оплату
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {pendingApprovalInfo.requestedByName} отправил {pendingApprovalInfo.itemCount} заявк{pendingApprovalInfo.itemCount === 1 ? 'у' : pendingApprovalInfo.itemCount < 5 ? 'и' : 'ок'} на сумму {formatCurrency(pendingApprovalInfo.totalAmount)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                className="text-xs gap-1 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => setPendingApprovalInfo(null)}
              >
                Понятно
              </Button>
            </div>
          </div>
        )}

        {/* Таблица */}
        <Card className="shrink-0 mb-6">
          <CardContent className="pt-3 pb-3">
            {/* Поиск + фильтры + кнопка настроек столбцов */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Поиск по номеру заявки, контейнеру, перевозчику..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-8"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                    title="Сбросить поиск"
                  >
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Select value={dateType} onValueChange={setDateType}>
                  <SelectTrigger className="w-auto min-w-[140px] h-8 text-xs gap-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expected">Планируемая</SelectItem>
                    <SelectItem value="actual">Фактическая</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-[140px] h-8 text-xs bg-white"
                  placeholder="Дата оплаты"
                />
                {paymentDate && (
                  <button onClick={() => setPaymentDate("")} className="p-1 hover:bg-gray-100 rounded" title="Сбросить">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
              </div>
              {carriers && carriers.length > 0 && (
                <Select value={carrierFilter} onValueChange={setCarrierFilter}>
                  <SelectTrigger className="w-auto min-w-[180px] h-8 gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <SelectValue placeholder="Все перевозчики" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все перевозчики</SelectItem>
                    {carriers.slice(0, 100).map((c) => (
                      <SelectItem 
                        key={c.id} 
                        value={c.id}
                        className={c.isBlocked ? "text-red-600" : ""}
                      >
                        {c.name}
                        {c.isBlocked && " (заблокирован)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isAdmin && branches && branches.length > 0 && (
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger className="w-auto min-w-[180px] h-8 gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <SelectValue placeholder="Все филиалы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все филиалы</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setColumnDialogOpen(true)}
                    className="shrink-0 gap-1.5"
                  >
                    <Settings2 className="w-4 h-4" />
                    Столбцы
                    <span className="text-xs bg-gray-200 rounded-full px-1.5 py-0.5 text-gray-600">
                      {activeColumns.filter(c => c.key !== "link").length}
                    </span>
                  </Button>
                  <Button
                    variant={hasUnsavedChanges ? "default" : "outline"}
                    size="sm"
                    onClick={() => saveGlobalSettings({
                      cardsHeight,
                      tableHeight,
                      headerHeight,
                      rowHeight,
                      visibleKeys: Array.from(visibleKeys),
                      columnOrder,
                      columnWidths,
                      columnLabels,
                    })}
                    className={cn("shrink-0 gap-1.5", hasUnsavedChanges && "bg-green-600 hover:bg-green-700")}
                  >
                    <Save className="w-4 h-4" />
                    Сохранить
                  </Button>
                </>
              )}
            </div>

            {/* Таблица */}
            <div className="border rounded-lg overflow-auto" style={{ height: tableHeight }}>
              <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  {activeColumns.map((col) => (
                    <col key={col.key} style={{ width: columnWidths[col.key] || col.width }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr style={{ height: headerHeight }}>
                    {activeColumns.map((col, idx) => (
                      <ResizableHeader
                        key={col.key}
                        col={col}
                        label={getColumnLabel(col)}
                        width={columnWidths[col.key] || col.width}
                        isAdmin={!!isAdmin}
                        isDragSource={dragColIdx === idx}
                        isDropTarget={dropColIdx === idx}
                        onDragStart={() => isAdmin && handleColDragStart(idx)}
                        onDragOver={(e) => { e.preventDefault(); if (isAdmin) handleColDragEnter(idx); }}
                        onDragEnd={() => isAdmin && handleColDragEnd()}
                        onWidthChange={(w) => updateColumnWidth(col.key, w)}
                        isFirstColumn={idx === 0}
                        headerContent={col.key === "select" ? (
                          <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} className="mt-0.5" />
                        ) : undefined}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr><td colSpan={activeColumns.length} className="text-center text-gray-400" style={{ height: rowHeight }}>Загрузка...</td></tr>
                  ) : orders.length === 0 ? (
                    <tr><td colSpan={activeColumns.length} className="text-center text-gray-400 py-12">Нет заявок со статусом «Ожидает оплату»</td></tr>
                  ) : (
                    orders.map((order) => {
                      const status = getPaymentStatus(order.carrierExpectedPaymentDate);
                      const isSelected = selectedIds.has(order.id);
                      const hasDocumentIssue = order.paymentIssueType === "DOCUMENT_ISSUE";
                      return (
                        <tr
                          key={order.id}
                          style={{ height: rowHeight }}
                          className={cn(
                            "hover:bg-gray-50 transition-colors",
                            isSelected && "bg-blue-50/60",
                            hasDocumentIssue && !isSelected && "bg-red-100",
                            !hasDocumentIssue && status.type === "overdue" && !isSelected && "bg-red-50/50",
                            !hasDocumentIssue && status.type === "today" && !isSelected && "bg-amber-50/50"
                          )}
                        >
                          {activeColumns.map((col, idx) => (
                            <td
                              key={col.key}
                              className={cn(
                                "px-4 overflow-hidden",
                                col.align === "left" && "text-left",
                                col.align === "right" && "text-right",
                                col.align === "center" && "text-center",
                                idx === 0 && "sticky left-0 z-10 bg-white border-r border-slate-200"
                              )}
                            >
                              {renderCell(order, col)}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Панель выбранных заявок */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-700">Выбрано: {selectedIds.size}</span>
                  <span className="text-blue-500">({formatCurrency(selectedTotal)})</span>
                </div>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={clearSelection} className="text-xs gap-1">
                  <X className="w-3.5 h-3.5" /> Очистить
                </Button>
                {isAdmin && (
                  <>
                    <Button
                      size="sm"
                      className="text-xs gap-1 bg-green-600 hover:bg-green-700"
                      onClick={approveSelectedOrders}
                      disabled={isApproving || selectedIds.size === 0}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isApproving ? "Утверждение..." : "Утвердить оплату"}
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs gap-1 bg-red-500 hover:bg-red-600"
                      onClick={() => setRejectDialogOpen(true)}
                      disabled={isRejecting || selectedIds.size === 0}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Отклонить
                    </Button>
                  </>
                )}
                {!isAdmin && (
                  <Button 
                    size="sm" 
                    className="text-xs gap-1 bg-blue-600 hover:bg-blue-700"
                    onClick={sendForApproval}
                    disabled={isSendingForApproval || selectedIds.size === 0}
                  >
                    <Send className="w-3.5 h-3.5" /> 
                    {isSendingForApproval ? "Отправка..." : "Отправить на согласование"}
                  </Button>
                )}
              </div>
            )}

            {/* Админ-настройки */}
            {isAdmin && (
              <>
                {/* Ручка высоты заголовка */}
                <div
                  onMouseDown={(e) => startVerticalResize(e, headerHeight, 24, setHeaderHeight)}
                  className="flex items-center justify-center h-3 cursor-row-resize group hover:bg-blue-50 transition-colors relative -mt-1"
                  title="Высота заголовка"
                >
                  <div className="absolute left-4 right-4 h-px bg-gray-200 group-hover:bg-blue-300 transition-colors" />
                  <div className="relative bg-gray-200 group-hover:bg-blue-300 px-1 rounded transition-colors">
                    <GripHorizontal className="w-4 h-2 text-gray-300 group-hover:text-blue-400" />
                  </div>
                </div>

                {/* Ручка высоты таблицы */}
                <div
                  onMouseDown={(e) => startVerticalResize(e, tableHeight, 120, setTableHeight)}
                  className="flex items-center justify-center h-4 cursor-row-resize group hover:bg-gray-100 transition-colors"
                  title="Высота таблицы"
                >
                  <div className="flex items-center gap-1 text-gray-300 group-hover:text-gray-400 transition-colors">
                    <GripHorizontal className="w-5 h-3" /><GripHorizontal className="w-5 h-3 -ml-2" />
                  </div>
                </div>

                {/* Высота строк */}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>Высота строки:</span>
                  <input type="range" min={24} max={80} value={rowHeight} onChange={(e) => setRowHeight(Number(e.target.value))} className="w-24 h-1 accent-blue-500 cursor-pointer" />
                  <span className="w-8 text-right font-mono">{rowHeight}px</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* === Диалог управления столбцами === */}
      <Dialog open={columnDialogOpen} onOpenChange={setColumnDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Управление столбцами</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto -mx-6 px-6">
            <p className="text-sm text-gray-500 mb-3">Активные столбцы (перетаскивайте для изменения порядка, × для удаления, ✎ для переименования):</p>
            <div className="space-y-1 mb-4">
              {activeColumns.filter(c => c.key !== "link").map((col, idx) => (
                <div
                  key={col.key}
                  draggable={editingLabelKey !== col.key}
                  onDragStart={() => editingLabelKey !== col.key && handleColDragStart(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() => editingLabelKey !== col.key && handleColDragEnter(idx)}
                  onDragEnd={() => {
                    if (dragColIdx !== null && dropColIdx !== null && dragColIdx !== dropColIdx) {
                      const keys = activeColumns.filter(c => c.key !== "link").map(c => c.key);
                      const [moved] = keys.splice(dragColIdx, 1);
                      keys.splice(dropColIdx, 0, moved);
                      const rest = columnOrder.filter(k => !keys.includes(k) && k !== "link");
                      setColumnOrder([...keys, "link", ...rest]);
                    }
                    setDragColIdx(null);
                    setDropColIdx(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md border text-sm",
                    editingLabelKey !== col.key && "cursor-grab active:cursor-grabbing",
                    dragColIdx === idx && "opacity-40",
                    dropColIdx === idx && "bg-blue-50 border-blue-300"
                  )}
                >
                  <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                  {editingLabelKey === col.key ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        autoFocus
                        type="text"
                        defaultValue={getColumnLabel(col)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveColumnLabel(col.key, (e.target as HTMLInputElement).value);
                          if (e.key === "Escape") setEditingLabelKey(null);
                        }}
                        onBlur={(e) => saveColumnLabel(col.key, (e.target as HTMLInputElement).value)}
                        className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button onClick={() => setEditingLabelKey(null)} className="p-0.5 hover:bg-green-100 rounded text-green-500 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 truncate">{getColumnLabel(col)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingLabelKey(col.key); }}
                        className="p-0.5 hover:bg-blue-100 rounded text-gray-400 hover:text-blue-500 transition-colors shrink-0"
                        title="Переименовать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button onClick={() => removeColumn(col.key)} className="p-0.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-500 transition-colors shrink-0">
                    <Minus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {hiddenColumns.length > 0 && (
              <>
                <p className="text-sm text-gray-500 mb-3">Доступные столбцы (нажмите + для добавления):</p>
                <div className="space-y-1">
                  {hiddenColumns.map((col) => (
                    <div key={col.key} className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-gray-300 text-sm">
                      <span className="flex-1 text-gray-500">{getColumnLabel(col)}</span>
                      <button onClick={() => addColumn(col.key)} className="p-0.5 hover:bg-green-100 rounded text-gray-400 hover:text-green-600 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setColumnDialogOpen(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог для ввода комментария при ПРОБЛЕМА/ПРЕТЕНЗИЯ */}
      <Dialog open={!!issueCommentDialog} onOpenChange={() => setIssueCommentDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {issueCommentDialog?.issueStatus === "PROBLEM" ? "Описание проблемы" : "Описание претензии"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <textarea
              value={issueCommentDialog?.comment || ""}
              onChange={(e) => setIssueCommentDialog(prev => prev ? { ...prev, comment: e.target.value } : null)}
              placeholder={issueCommentDialog?.issueStatus === "PROBLEM" ? "Опишите проблему..." : "Опишите претензию..."}
              className="w-full h-32 p-3 border rounded-md text-sm resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueCommentDialog(null)}>Отмена</Button>
            <Button onClick={saveIssueWithComment}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог: отправить на доработку (админ) */}
      <Dialog open={!!sendBackDialog} onOpenChange={(open) => !open && setSendBackDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Отправить на доработку</DialogTitle>
            <DialogDescription>
              Укажите причину возврата для менеджера (заявка {sendBackDialog?.orderNumber || ""})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={sendBackComment}
              onChange={(e) => setSendBackComment(e.target.value)}
              placeholder="Опишите, что нужно исправить..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendBackDialog(null); setSendBackComment(""); }}>Отмена</Button>
            <Button onClick={handleSendBack} className="bg-orange-600 text-white hover:bg-orange-700">Отправить на доработку</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог: отклонить заявки на согласование (админ) */}
      <Dialog open={rejectDialogOpen} onOpenChange={(open) => { if (!open) { setRejectDialogOpen(false); setRejectComment(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Отклонить заявки на оплату</DialogTitle>
            <DialogDescription>
              Вы отклоняете {selectedIds.size} заяв{selectedIds.size === 1 ? 'у' : selectedIds.size < 5 ? 'и' : 'ок'} на согласование. Менеджер получит уведомление.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Укажите причину отклонения (необязательно)..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectComment(""); }}>Отмена</Button>
            <Button
              onClick={rejectSelectedOrders}
              className="bg-red-500 text-white hover:bg-red-600"
              disabled={isRejecting}
            >
              {isRejecting ? "Отклонение..." : "Отклонить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
