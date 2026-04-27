"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RefreshCw,
  Calculator,
  Plus,
  X,
  CalendarDays,
  Trash2,
  Info,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isValid } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalendarEntry {
  date: string;       // "YYYY-MM-DD"
  type: string;       // "HOLIDAY" | "TRANSFERRED_WORKING" | "CUSTOM" | "WEEKEND"
  title: string;
  isNonWorking: boolean;
}

interface CalendarDaysData {
  year: number;
  nonWorkingDays: string[];
  transferredWorkingDays: string[];
}

interface RecalculateResult {
  total: number;
  updated: number;
  unchanged: number;
  errors: number;
}

interface SyncResult {
  success: boolean;
  year: number;
  holidays: number;
  transferredWorking: number;
  total: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const YEARS = [2025, 2026, 2027, 2028] as const;

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const DAY_HEADERS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const GENITIVE_MONTH_NAMES = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Convert Monday-first JS getDay() (0=Mon...6=Sun) index. */
function getMondayBasedDay(date: Date): number {
  const d = getDay(date); // 0=Sun, 1=Mon ... 6=Sat
  return d === 0 ? 6 : d - 1; // 0=Mon, 1=Tue ... 6=Sun
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format "YYYY-MM-DD" as "d MMMM yyyy" in Russian. */
function formatDateRu(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (!isValid(d)) return dateStr;
  return format(d, "d MMMM yyyy", { locale: ru });
}

/** Get short day-of-week name for a date string in Russian. */
function getDayOfWeekRu(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (!isValid(d)) return "";
  return format(d, "EEEEEE", { locale: ru }); // "пн", "вт", etc.
}

/** Count total working days in a year considering holidays and transferred days. */
function countWorkingDays(
  year: number,
  nonWorkingDays: Set<string>,
  transferredWorkingDays: Set<string>,
): number {
  let count = 0;
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));

  const current = new Date(start);
  while (current <= end) {
    const dateStr = format(current, "yyyy-MM-dd");
    const dayOfWeek = getDay(current); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (transferredWorkingDays.has(dateStr)) {
      count++;
    } else if (isWeekend) {
      // skip
    } else if (nonWorkingDays.has(dateStr)) {
      // skip
    } else {
      count++;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

/** Convert a Date object to "YYYY-MM-DD" string. */
function toDateString(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** A single day cell inside a mini month calendar. */
function DayCell({
  day,
  dateStr,
  isCurrentMonth,
  isWeekend,
  isHoliday,
  isTransferred,
  hasEntry,
  entryTitle,
  onClick,
}: {
  day: number;
  dateStr: string;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  isTransferred: boolean;
  hasEntry: boolean;
  entryTitle: string;
  onClick: (dateStr: string) => void;
}) {
  const cellClasses = cn(
    "relative h-7 w-7 flex items-center justify-center text-xs rounded cursor-pointer transition-colors",
    "hover:ring-2 hover:ring-primary/30 hover:z-10",
    !isCurrentMonth && "opacity-30 cursor-default hover:ring-0",
    isCurrentMonth && isHoliday && !isTransferred && "bg-red-100 text-red-700 font-semibold",
    isCurrentMonth && isTransferred && "bg-green-100 text-green-700 font-semibold",
    isCurrentMonth && isWeekend && !isHoliday && !isTransferred && "bg-gray-100 text-gray-500",
    isCurrentMonth && !isWeekend && !isHoliday && !isTransferred && "text-gray-800",
  );

  const content = (
    <div
      className={cellClasses}
      onClick={() => isCurrentMonth && onClick(dateStr)}
      role="button"
      tabIndex={isCurrentMonth ? 0 : undefined}
      onKeyDown={(e) => {
        if (isCurrentMonth && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(dateStr);
        }
      }}
    >
      {day}
      {(isHoliday || isTransferred) && (
        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-current" />
      )}
    </div>
  );

  if (hasEntry && entryTitle && isCurrentMonth) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-center">
          <p className="font-medium">{entryTitle}</p>
          <p className="text-xs text-muted-foreground">{formatDateRu(dateStr)}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

/** A single month mini-calendar block. */
function MonthCalendar({
  year,
  monthIndex,
  entriesMap,
  nonWorkingDays,
  transferredWorkingDays,
  onDayClick,
}: {
  year: number;
  monthIndex: number;
  entriesMap: Map<string, CalendarEntry>;
  nonWorkingDays: Set<string>;
  transferredWorkingDays: Set<string>;
  onDayClick: (dateStr: string) => void;
}) {
  const monthDate = new Date(year, monthIndex, 1);
  const startDate = startOfMonth(monthDate);
  const endDate = endOfMonth(monthDate);

  // Build the grid: Monday-first, with leading/trailing days from adjacent months
  const startDayOfWeek = getMondayBasedDay(startDate); // 0=Mon
  const daysInMonth = endDate.getDate();

  // Leading days from previous month
  const prevMonth = subMonths(monthDate, 1);
  const prevMonthEnd = endOfMonth(prevMonth);
  const leadingDays: Array<{ day: number; date: Date; isCurrentMonth: boolean }> = [];
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(prevMonthEnd);
    d.setDate(d.getDate() - i);
    leadingDays.push({ day: d.getDate(), date: d, isCurrentMonth: false });
  }

  // Current month days
  const currentDays: Array<{ day: number; date: Date; isCurrentMonth: boolean }> = [];
  for (let d = 1; d <= daysInMonth; d++) {
    currentDays.push({ day: d, date: new Date(year, monthIndex, d), isCurrentMonth: true });
  }

  // Trailing days to fill remaining cells (total cells should be a multiple of 7)
  const totalCells = leadingDays.length + currentDays.length;
  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const trailingDays: Array<{ day: number; date: Date; isCurrentMonth: boolean }> = [];
  for (let d = 1; d <= remainingCells; d++) {
    const nextMonthDate = addMonths(monthDate, 1);
    trailingDays.push({ day: d, date: new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), d), isCurrentMonth: false });
  }

  const allCells = [...leadingDays, ...currentDays, ...trailingDays];

  // Split into rows of 7
  const rows: typeof allCells[] = [];
  for (let i = 0; i < allCells.length; i += 7) {
    rows.push(allCells.slice(i, i + 7));
  }

  return (
    <div className="border rounded-lg p-3 bg-white">
      <h3 className="text-sm font-semibold text-gray-900 mb-2 text-center">
        {MONTH_NAMES[monthIndex]}
      </h3>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAY_HEADERS.map((header) => (
          <div
            key={header}
            className="h-6 flex items-center justify-center text-[10px] font-medium text-gray-400 uppercase"
          >
            {header}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {allCells.map((cell, idx) => {
          const dateStr = toDateString(cell.date);
          const dayOfWeek = getDay(cell.date); // 0=Sun, 6=Sat
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const isHoliday = cell.isCurrentMonth && nonWorkingDays.has(dateStr);
          const isTransferred = cell.isCurrentMonth && transferredWorkingDays.has(dateStr);
          const entry = entriesMap.get(dateStr);
          const hasEntry = !!entry;
          const entryTitle = entry?.title || "";

          return (
            <DayCell
              key={idx}
              day={cell.day}
              dateStr={dateStr}
              isCurrentMonth={cell.isCurrentMonth}
              isWeekend={isWeekend}
              isHoliday={isHoliday}
              isTransferred={isTransferred}
              hasEntry={hasEntry}
              entryTitle={entryTitle}
              onClick={onDayClick}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Grouped holiday list for the sidebar. */
function HolidayList({
  entries,
  onAddHoliday,
  onDelete,
}: {
  entries: CalendarEntry[];
  onAddHoliday: () => void;
  onDelete: (date: string) => void;
}) {
  // Group by month
  const groupedByMonth = useMemo(() => {
    const groups: Record<number, CalendarEntry[]> = {};
    for (const entry of entries) {
      const month = parseInt(entry.date.split("-")[1], 10);
      if (!groups[month]) groups[month] = [];
      groups[month].push(entry);
    }
    return groups;
  }, [entries]);

  const sortedMonths = useMemo(
    () => Object.keys(groupedByMonth).map(Number).sort((a, b) => a - b),
    [groupedByMonth],
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <CalendarDays className="h-10 w-10 mb-2" />
        <p className="text-sm">Нет записей</p>
        <p className="text-xs">Нажмите &laquo;Обновить из интернета&raquo; или добавьте вручную</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onAddHoliday}
      >
        <Plus className="h-4 w-4 mr-1" />
        Добавить праздник
      </Button>

      {/* Month groups */}
      <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
        {sortedMonths.map((month) => (
          <div key={month}>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {MONTH_NAMES[month - 1]}
            </h4>
            <div className="space-y-1">
              {groupedByMonth[month].map((entry) => {
                const isTransferred = entry.type === "TRANSFERRED_WORKING";
                const dayStr = entry.date.split("-")[2];
                const dayOfWeekStr = getDayOfWeekRu(entry.date);

                return (
                  <div
                    key={entry.date}
                    className="flex items-center gap-2 p-2 rounded-md bg-gray-50 hover:bg-gray-100 group transition-colors"
                  >
                    {/* Date badge */}
                    <span
                      className={cn(
                        "shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-xs font-bold",
                        isTransferred
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700",
                      )}
                    >
                      {dayStr}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {entry.title || (isTransferred ? "Перенесённый рабочий день" : "Выходной")}
                      </p>
                      <p className="text-xs text-gray-400">
                        {dayOfWeekStr}
                      </p>
                    </div>

                    {/* Type badge */}
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 text-[10px] px-1.5 py-0",
                        isTransferred
                          ? "bg-green-100 text-green-700 hover:bg-green-100"
                          : "bg-red-100 text-red-700 hover:bg-red-100",
                      )}
                    >
                      {isTransferred ? "Рабочий" : "Праздник"}
                    </Badge>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(entry.date);
                      }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                      title="Удалить"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ProductionCalendarTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── State ──
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(
    YEARS.includes(currentYear as any) ? currentYear : 2025,
  );

  // Dialog: edit a single day
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editType, setEditType] = useState<"HOLIDAY" | "TRANSFERRED_WORKING">("HOLIDAY");

  // Dialog: add holiday via calendar picker
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addPickerDate, setAddPickerDate] = useState<Date | undefined>(undefined);
  const [addTitle, setAddTitle] = useState<string>("");
  const [addType, setAddType] = useState<"HOLIDAY" | "TRANSFERRED_WORKING">("HOLIDAY");

  // Dialog: recalculate result
  const [recalcDialogOpen, setRecalcDialogOpen] = useState(false);
  const [recalcResult, setRecalcResult] = useState<RecalculateResult | null>(null);

  // Loading states
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Data fetching ──

  const { data: calendarData, isLoading: isCalendarLoading } = useQuery<{
    entries: CalendarEntry[];
  }>({
    queryKey: ["productionCalendar", year],
    queryFn: async () => {
      const response = await fetch(`/api/production-calendar?year=${year}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch calendar entries");
      return response.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: daysData } = useQuery<CalendarDaysData>({
    queryKey: ["productionCalendarDays", year],
    queryFn: async () => {
      const response = await fetch(`/api/production-calendar/days?year=${year}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch calendar days");
      return response.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const entries = useMemo(() => calendarData?.entries || [], [calendarData]);
  const entriesMap = useMemo(() => {
    const map = new Map<string, CalendarEntry>();
    for (const entry of entries) {
      const dateStr = entry.date.split("T")[0];
      if (dateStr) map.set(dateStr, entry);
    }
    return map;
  }, [entries]);

  const nonWorkingDays = useMemo(() => {
    const set = new Set<string>();
    if (daysData?.nonWorkingDays) {
      for (const d of daysData.nonWorkingDays) set.add(d);
    }
    // Also build from entries as fallback
    for (const entry of entries) {
      if (entry.isNonWorking && entry.type !== "TRANSFERRED_WORKING") {
        const dateStr = entry.date.split("T")[0];
        if (dateStr) set.add(dateStr);
      }
    }
    return set;
  }, [daysData, entries]);

  const transferredWorkingDays = useMemo(() => {
    const set = new Set<string>();
    if (daysData?.transferredWorkingDays) {
      for (const d of daysData.transferredWorkingDays) set.add(d);
    }
    // Also build from entries as fallback
    for (const entry of entries) {
      if (entry.type === "TRANSFERRED_WORKING" || !entry.isNonWorking) {
        const dateStr = entry.date.split("T")[0];
        if (dateStr) set.add(dateStr);
      }
    }
    return set;
  }, [daysData, entries]);

  // Stats
  const stats = useMemo(() => {
    const workingDays = countWorkingDays(year, nonWorkingDays, transferredWorkingDays);
    // Count only non-weekend holidays (entries where isNonWorking = true and not a weekend)
    const holidayEntries = entries.filter((e) => {
      if (!e.isNonWorking) return false;
      const d = new Date(e.date + "T00:00:00");
      const dayOfWeek = getDay(d);
      return dayOfWeek !== 0 && dayOfWeek !== 6; // exclude weekends (computed automatically)
    });
    const transferredEntries = entries.filter((e) => e.type === "TRANSFERRED_WORKING");

    return {
      workingDays,
      holidaysCount: holidayEntries.length,
      transferredCount: transferredEntries.length,
    };
  }, [year, nonWorkingDays, transferredWorkingDays, entries]);

  // ── Handlers ──

  const handleYearChange = useCallback((value: string) => {
    setYear(parseInt(value, 10));
  }, []);

  /** Open the edit dialog for a specific date. */
  const handleDayClick = useCallback(
    (dateStr: string) => {
      const existingEntry = entriesMap.get(dateStr);
      setEditDate(dateStr);

      if (existingEntry) {
        setEditTitle(existingEntry.title || "");
        setEditType(
          existingEntry.type === "TRANSFERRED_WORKING"
            ? "TRANSFERRED_WORKING"
            : "HOLIDAY",
        );
      } else {
        // Check if it's a weekend
        const d = new Date(dateStr + "T00:00:00");
        const dayOfWeek = getDay(d);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isWeekend) {
          setEditType("TRANSFERRED_WORKING");
          setEditTitle("Перенесённый рабочий день");
        } else {
          setEditType("HOLIDAY");
          setEditTitle("");
        }
      }

      setEditDialogOpen(true);
    },
    [entriesMap],
  );

  /** Save the day entry (create or update). */
  const handleSaveDay = useCallback(async () => {
    if (!editDate) return;

    setIsSaving(true);
    try {
      const isNonWorking = editType === "HOLIDAY";
      const response = await fetch("/api/production-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: editDate,
          type: editType,
          title: editTitle.trim(),
          isNonWorking,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save");
      }

      toast({
        title: "Сохранено",
        description: `${formatDateRu(editDate)} — ${editType === "HOLIDAY" ? "выходной" : "рабочий день"}`,
      });

      queryClient.invalidateQueries({ queryKey: ["productionCalendar", year] });
      queryClient.invalidateQueries({ queryKey: ["productionCalendarDays", year] });
      setEditDialogOpen(false);
      setEditDate(null);
    } catch (err: any) {
      console.error("Failed to save calendar entry:", err);
      toast({
        title: "Ошибка",
        description: err.message || "Не удалось сохранить",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [editDate, editType, editTitle, year, queryClient, toast]);

  /** Remove the custom setting for a day (delete the entry). */
  const handleRemoveDay = useCallback(async () => {
    if (!editDate) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/production-calendar?date=${editDate}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to delete");
      }

      toast({
        title: "Удалено",
        description: `${formatDateRu(editDate)} — сброшено к значению по умолчанию`,
      });

      queryClient.invalidateQueries({ queryKey: ["productionCalendar", year] });
      queryClient.invalidateQueries({ queryKey: ["productionCalendarDays", year] });
      setEditDialogOpen(false);
      setEditDate(null);
    } catch (err: any) {
      console.error("Failed to remove calendar entry:", err);
      toast({
        title: "Ошибка",
        description: err.message || "Не удалось удалить",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [editDate, year, queryClient, toast]);

  /** Delete a holiday entry from the list. */
  const handleDeleteEntry = useCallback(
    async (date: string) => {
      setIsDeleting(true);
      try {
        const response = await fetch(
          `/api/production-calendar?date=${date}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Failed to delete");
        }

        toast({
          title: "Удалено",
          description: `${formatDateRu(date)} — запись удалена`,
        });

        queryClient.invalidateQueries({ queryKey: ["productionCalendar", year] });
        queryClient.invalidateQueries({ queryKey: ["productionCalendarDays", year] });
      } catch (err: any) {
        console.error("Failed to delete entry:", err);
        toast({
          title: "Ошибка",
          description: err.message || "Не удалось удалить",
          variant: "destructive",
        });
      } finally {
        setIsDeleting(false);
      }
    },
    [year, queryClient, toast],
  );

  /** Sync calendar from the online isdayoff.ru API. */
  const handleSyncOnline = useCallback(async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/production-calendar/sync-online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ year }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Sync failed");
      }

      const result: SyncResult = await response.json();

      toast({
        title: "Календарь обновлён",
        description: `Загружено: ${result.holidays} праздников, ${result.transferredWorking} перенесённых рабочих дней`,
      });

      queryClient.invalidateQueries({ queryKey: ["productionCalendar", year] });
      queryClient.invalidateQueries({ queryKey: ["productionCalendarDays", year] });
    } catch (err: any) {
      console.error("Failed to sync online:", err);
      toast({
        title: "Ошибка синхронизации",
        description: err.message || "Не удалось обновить календарь из интернета",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [year, queryClient, toast]);

  /** Recalculate payment dates across all orders. */
  const handleRecalculate = useCallback(async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch("/api/production-calendar/recalculate", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Recalculation failed");
      }

      const result: RecalculateResult = await response.json();
      setRecalcResult(result);
      setRecalcDialogOpen(true);
    } catch (err: any) {
      console.error("Failed to recalculate:", err);
      toast({
        title: "Ошибка пересчёта",
        description: err.message || "Не удалось пересчитать даты оплаты",
        variant: "destructive",
      });
    } finally {
      setIsRecalculating(false);
    }
  }, [toast]);

  /** Save a new holiday from the add dialog. */
  const handleAddHoliday = useCallback(async () => {
    if (!addPickerDate) return;

    setIsSaving(true);
    try {
      const dateStr = toDateString(addPickerDate);
      const isNonWorking = addType === "HOLIDAY";

      const response = await fetch("/api/production-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: dateStr,
          type: addType,
          title: addTitle.trim() || (isNonWorking ? "Выходной день" : "Перенесённый рабочий день"),
          isNonWorking,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to add");
      }

      toast({
        title: "Добавлено",
        description: `${formatDateRu(dateStr)} — ${isNonWorking ? "выходной" : "рабочий день"}`,
      });

      queryClient.invalidateQueries({ queryKey: ["productionCalendar", year] });
      queryClient.invalidateQueries({ queryKey: ["productionCalendarDays", year] });
      setAddDialogOpen(false);
      setAddPickerDate(undefined);
      setAddTitle("");
    } catch (err: any) {
      console.error("Failed to add holiday:", err);
      toast({
        title: "Ошибка",
        description: err.message || "Не удалось добавить",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [addPickerDate, addTitle, addType, year, queryClient, toast]);

  /** Open add dialog and navigate to the correct year if needed. */
  const handleOpenAddDialog = useCallback(() => {
    setAddPickerDate(new Date(year, 0, 1));
    setAddTitle("");
    setAddType("HOLIDAY");
    setAddDialogOpen(true);
  }, [year]);

  // ── Render ──

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Left: Year selector + Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={String(year)}
            onValueChange={handleYearChange}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Год" />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} год
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stats badges */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50">
              <CalendarDays className="h-3 w-3 mr-1" />
              {stats.workingDays} рабочих дней
            </Badge>
            <Badge variant="secondary" className="bg-red-50 text-red-700 hover:bg-red-50">
              {stats.holidaysCount} праздников
            </Badge>
            <Badge variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-50">
              {stats.transferredCount} перенесённых
            </Badge>
          </div>
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncOnline}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Обновить из интернета
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={isRecalculating}
          >
            {isRecalculating ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4 mr-1.5" />
            )}
            Пересчитать даты оплаты
          </Button>
        </div>
      </div>

      {/* ── Main Content: Calendar Grid + Holiday List ── */}
      {isCalendarLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-500">Загрузка календаря...</span>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Calendar Grid */}
          <div className="flex-1 min-w-0">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mb-3 px-1">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="h-3.5 w-3.5 rounded bg-white border border-gray-200" />
                Рабочий день
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="h-3.5 w-3.5 rounded bg-gray-100" />
                Выходной (Сб/Вс)
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="h-3.5 w-3.5 rounded bg-red-100" />
                Праздник
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="h-3.5 w-3.5 rounded bg-green-100" />
                Перенесённый рабочий
              </div>
            </div>

            {/* 12-month grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 12 }, (_, i) => (
                <MonthCalendar
                  key={`${year}-${i}`}
                  year={year}
                  monthIndex={i}
                  entriesMap={entriesMap}
                  nonWorkingDays={nonWorkingDays}
                  transferredWorkingDays={transferredWorkingDays}
                  onDayClick={handleDayClick}
                />
              ))}
            </div>
          </div>

          {/* Holiday List Sidebar */}
          <div className="w-full lg:w-80 shrink-0">
            <div className="border rounded-lg p-4 bg-white sticky top-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-4 w-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">
                  Особые дни {year} года
                </h2>
              </div>
              <HolidayList
                entries={entries}
                onAddHoliday={handleOpenAddDialog}
                onDelete={handleDeleteEntry}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: Edit Day ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {editDate ? formatDateRu(editDate) : "Настройка дня"}
            </DialogTitle>
            <DialogDescription>
              {editDate
                ? `${getDayOfWeekRu(editDate)}, выберите тип дня`
                : "Выберите дату в календаре"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Тип дня</label>
              <Select
                value={editType}
                onValueChange={(v) => setEditType(v as "HOLIDAY" | "TRANSFERRED_WORKING")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOLIDAY">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                      Праздник / выходной
                    </span>
                  </SelectItem>
                  <SelectItem value="TRANSFERRED_WORKING">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                      Рабочий день (перенос)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Title input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Название</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={
                  editType === "HOLIDAY"
                    ? "Например: Новый год"
                    : "Например: Перенесённый рабочий день"
                }
              />
            </div>

            {/* Current state indicator */}
            {editDate && entriesMap.has(editDate) && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 text-amber-700 text-xs">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Запись уже существует. Выберите &laquo;Удалить&raquo; для сброса к значению по умолчанию.
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {/* Remove / Reset button (only if entry exists) */}
            {editDate && entriesMap.has(editDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveDay}
                disabled={isSaving}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Удалить
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditDialogOpen(false)}
              disabled={isSaving}
            >
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={handleSaveDay}
              disabled={isSaving || !editTitle.trim()}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Add Holiday ── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Добавить особый день</DialogTitle>
            <DialogDescription>
              Выберите дату и укажите тип
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Дата</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (addPickerDate) {
                      setAddPickerDate(
                        new Date(addPickerDate.getFullYear(), addPickerDate.getMonth() - 1, 1),
                      );
                    }
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[120px] text-center">
                  {addPickerDate
                    ? format(addPickerDate, "LLLL yyyy", { locale: ru })
                    : "Выберите дату"}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (addPickerDate) {
                      setAddPickerDate(
                        new Date(addPickerDate.getFullYear(), addPickerDate.getMonth() + 1, 1),
                      );
                    }
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {addPickerDate && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {format(addPickerDate, "d MMMM yyyy", { locale: ru })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={addPickerDate}
                      onSelect={setAddPickerDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Type selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Тип дня</label>
              <Select
                value={addType}
                onValueChange={(v) => setAddType(v as "HOLIDAY" | "TRANSFERRED_WORKING")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOLIDAY">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                      Праздник / выходной
                    </span>
                  </SelectItem>
                  <SelectItem value="TRANSFERRED_WORKING">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                      Рабочий день (перенос)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Title input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Название</label>
              <Input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder={
                  addType === "HOLIDAY"
                    ? "Например: Новый год"
                    : "Например: Перенесённый рабочий день"
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddDialogOpen(false)}
              disabled={isSaving}
            >
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={handleAddHoliday}
              disabled={isSaving || !addPickerDate}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Recalculate Result ── */}
      <Dialog open={recalcDialogOpen} onOpenChange={setRecalcDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Результат пересчёта</DialogTitle>
            <DialogDescription>
              Даты оплаты во всех заявках обновлены согласно производственному календарю
            </DialogDescription>
          </DialogHeader>

          {recalcResult && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {recalcResult.updated}
                  </p>
                  <p className="text-xs text-green-600">Обновлено</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-600">
                    {recalcResult.unchanged}
                  </p>
                  <p className="text-xs text-gray-500">Без изменений</p>
                </div>
              </div>

              {recalcResult.errors > 0 && (
                <div className="rounded-lg bg-red-50 p-3 text-center">
                  <p className="text-lg font-bold text-red-700">
                    {recalcResult.errors}
                  </p>
                  <p className="text-xs text-red-600">Ошибок</p>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">
                Всего обработано заявок: {recalcResult.total}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button size="sm" onClick={() => setRecalcDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
