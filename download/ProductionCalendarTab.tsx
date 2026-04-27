"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, Download, RefreshCw, Loader2,
  Plus, Trash2, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// --- Types ---

interface CalendarEntry {
  id: string;
  date: string;
  type: string;
  title: string;
  isNonWorking: boolean;
  year: number;
  createdAt: string;
  updatedAt: string;
}

interface FetchResult {
  success: boolean;
  summary: {
    year: number;
    deleted: number;
    inserted: number;
    holidays: number;
    transferredWorking: number;
    source: string;
  };
}

// Russian month names
const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const MONTH_NAMES_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// Known Russian holidays with their dates (month-day)
const KNOWN_HOLIDAYS: Record<string, string> = {
  "01-01": "Новый год",
  "01-02": "Новогодние каникулы",
  "01-03": "Новогодние каникулы",
  "01-04": "Новогодние каникулы",
  "01-05": "Новогодние каникулы",
  "01-06": "Новогодние каникулы",
  "01-07": "Рождество Христово",
  "01-08": "Новогодние каникулы",
  "02-23": "День защитника Отечества",
  "03-08": "Международный женский день",
  "05-01": "Праздник Весны и Труда",
  "05-09": "День Победы",
  "06-12": "День России",
  "11-04": "День народного единства",
};

// --- Component ---

export default function ProductionCalendarTab() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingExternal, setFetchingExternal] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("HOLIDAY");

  // Load entries for selected year
  const loadEntries = async (year: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/production-calendar?year=${year}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setEntries(data.entries || []);
    } catch (err) {
      console.error("Failed to load entries:", err);
      toast({ title: "Ошибка", description: "Не удалось загрузить производственный календарь", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Initial load + year change
  useState(() => {
    loadEntries(currentYear);
  });

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    loadEntries(year);
  };

  // Fetch from external source (isDayOff.ru)
  const handleFetchExternal = async () => {
    setFetchingExternal(true);
    try {
      const response = await fetch("/api/production-calendar/fetch-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ year: selectedYear }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch");
      }
      const result: FetchResult = await response.json();
      toast({
        title: "Календарь обновлён",
        description: `Обновлён из ${result.summary.source}: удалено ${result.summary.deleted} записей, добавлено ${result.summary.inserted} (${result.summary.holidays} праздников, ${result.summary.transferredWorking} переносов)`
      });
      loadEntries(selectedYear);
    } catch (err: any) {
      console.error("Failed to fetch external:", err);
      toast({ title: "Ошибка обновления", description: err.message || "Не удалось получить данные из интернета", variant: "destructive" });
    } finally {
      setFetchingExternal(false);
    }
  };

  // Recalculate all payment dates
  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const response = await fetch("/api/production-calendar/recalculate", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to recalculate");
      const result = await response.json();
      toast({
        title: "Даты пересчитаны",
        description: `Всего: ${result.total} заявок, обновлено: ${result.updated}, без изменений: ${result.unchanged}`
      });
    } catch (err: any) {
      console.error("Failed to recalculate:", err);
      toast({ title: "Ошибка", description: "Не удалось пересчитать даты оплат", variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  // Add new entry
  const handleAddEntry = async () => {
    if (!newDate) return;

    try {
      const isNonWorking = newType !== "TRANSFERRED_WORKING";
      const response = await fetch("/api/production-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: newDate,
          type: newType,
          title: newTitle,
          isNonWorking,
        }),
      });
      if (!response.ok) throw new Error("Failed to add entry");
      toast({ title: "Запись добавлена", description: `${newDate} — ${newTitle || newType}` });
      setAddDialogOpen(false);
      setNewDate("");
      setNewTitle("");
      setNewType("HOLIDAY");
      loadEntries(selectedYear);
    } catch (err: any) {
      console.error("Failed to add entry:", err);
      toast({ title: "Ошибка", description: err.message || "Не удалось добавить запись", variant: "destructive" });
    }
  };

  // Delete entry
  const handleDelete = async (date: string) => {
    try {
      const response = await fetch(`/api/production-calendar?date=${encodeURIComponent(date)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete");
      toast({ title: "Запись удалена", description: date });
      loadEntries(selectedYear);
    } catch (err: any) {
      console.error("Failed to delete:", err);
      toast({ title: "Ошибка", description: "Не удалось удалить запись", variant: "destructive" });
    }
  };

  // Build calendar data structure
  const calendarData = useMemo(() => {
    const entryMap = new Map<string, CalendarEntry>();
    for (const entry of entries) {
      const dateStr = entry.date.split("T")[0];
      entryMap.set(dateStr, entry);
    }

    const months: Array<{
      month: number;
      weeks: Array<Array<{
        day: number;
        dateStr: string;
        isWeekend: boolean;
        isHoliday: boolean;
        isTransferredWorking: boolean;
        isNonWorking: boolean;
        entry: CalendarEntry | undefined;
      }>>;
    }> = [];

    for (let month = 0; month < 12; month++) {
      const weeks: typeof months[0]["weeks"] = [];
      const firstDay = new Date(selectedYear, month, 1);
      const lastDay = new Date(selectedYear, month + 1, 0);
      const daysInMonth = lastDay.getDate();

      // Day of week for the 1st (0=Sun, adjust to 0=Mon)
      let startDow = firstDay.getDay() - 1;
      if (startDow < 0) startDow = 6;

      // Build all days in month
      const days: typeof weeks[0][0][] = [];
      for (let i = 0; i < startDow; i++) {
        days.push(null as any); // empty cell
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(selectedYear, month, d);
        const dow = dateObj.getDay(); // 0=Sun, 6=Sat
        const isWeekend = dow === 0 || dow === 6;
        const dateStr = `${selectedYear}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const entry = entryMap.get(dateStr);

        days.push({
          day: d,
          dateStr,
          isWeekend,
          isHoliday: entry?.type === "HOLIDAY" || (!isWeekend && entry?.isNonWorking),
          isTransferredWorking: entry?.type === "TRANSFERRED_WORKING",
          isNonWorking: entry?.isNonWorking ?? false,
          entry,
        });
      }

      // Split into weeks
      for (let i = 0; i < days.length; i += 7) {
        const week = days.slice(i, i + 7);
        while (week.length < 7) week.push(null as any);
        weeks.push(week);
      }

      months.push({ month, weeks });
    }

    return months;
  }, [entries, selectedYear]);

  // Statistics
  const stats = useMemo(() => {
    const holidays = entries.filter(e => e.type === "HOLIDAY").length;
    const transferredWorking = entries.filter(e => e.type === "TRANSFERRED_WORKING").length;
    const custom = entries.filter(e => e.type === "CUSTOM").length;

    // Count total non-working days (holidays + regular weekends)
    let totalWeekends = 0;
    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(selectedYear, month + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(selectedYear, month, d).getDay();
        if (dow === 0 || dow === 6) totalWeekends++;
      }
    }

    return {
      holidays,
      transferredWorking,
      custom,
      totalWeekends,
      totalNonWorking: totalWeekends + holidays,
      workingDays: 365 + (isLeapYear(selectedYear) ? 1 : 0) - totalWeekends - holidays + transferredWorking,
    };
  }, [entries, selectedYear]);

  function isLeapYear(y: number): boolean {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function formatRussianDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()} ${MONTH_NAMES_GENITIVE[d.getMonth()]} ${d.getFullYear()}`;
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Производственный календарь</h2>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => handleYearChange(parseInt(v))}
          >
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027, 2028].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleFetchExternal}
            disabled={fetchingExternal}
            className="gap-1.5 text-xs"
          >
            {fetchingExternal ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Обновить из интернета
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="gap-1.5 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
          >
            {recalculating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Пересчитать даты оплат
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="overflow-hidden">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-500">Рабочих дней в году</p>
            <p className="text-xl font-bold text-blue-600">{stats.workingDays}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-500">Праздничных дней</p>
            <p className="text-xl font-bold text-red-600">{stats.holidays}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-500">Выходных (перенос рабочих)</p>
            <p className="text-xl font-bold text-green-600">{stats.transferredWorking}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-500">Обычных выходных</p>
            <p className="text-xl font-bold text-gray-600">{stats.totalWeekends}</p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar grid - show all 12 months */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-400">Загрузка...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {calendarData.map(({ month, weeks }) => (
            <Card key={month} className="overflow-hidden">
              <CardContent className="p-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{MONTH_NAMES[month]}</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {DAY_NAMES.map(dn => (
                        <th
                          key={dn}
                          className={cn(
                            "text-center text-xs font-medium py-1",
                            (dn === "Сб" || dn === "Вс") ? "text-red-400" : "text-gray-500"
                          )}
                        >
                          {dn}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((week, wi) => (
                      <tr key={wi}>
                        {week.map((day, di) => {
                          if (!day) {
                            return <td key={di} className="p-0.5" />;
                          }
                          const title = day.entry?.title || KNOWN_HOLIDAYS[day.dateStr.slice(5)] || "";
                          return (
                            <td
                              key={di}
                              className={cn(
                                "text-center text-xs py-0.5 px-0.5 relative cursor-default group",
                                day.isTransferredWorking && "bg-green-100 text-green-800 font-medium",
                                day.isHoliday && !day.isWeekend && "bg-red-100 text-red-800 font-medium",
                                day.isWeekend && !day.isTransferredWorking && !day.isHoliday && "text-red-400",
                                !day.isWeekend && !day.isHoliday && !day.isTransferredWorking && "text-gray-700"
                              )}
                              title={title || undefined}
                            >
                              {day.day}
                              {/* Tooltip */}
                              {title && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50 pointer-events-none">
                                  <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                                    {title}
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* List of holidays and transferred days */}
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Праздничные и переносные дни</h3>
          {entries.length === 0 ? (
            <p className="text-xs text-gray-400">Нет записей за {selectedYear} год</p>
          ) : (
            <div className="max-h-[400px] overflow-auto space-y-1">
              {entries
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(entry => {
                  const dateStr = entry.date.split("T")[0];
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                        entry.type === "TRANSFERRED_WORKING" && "bg-green-50",
                        entry.type === "HOLIDAY" && "bg-red-50",
                        entry.type === "CUSTOM" && "bg-yellow-50",
                      )}
                    >
                      <span className="font-mono text-xs w-[100px] shrink-0">{dateStr}</span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap",
                        entry.type === "TRANSFERRED_WORKING" && "bg-green-200 text-green-800",
                        entry.type === "HOLIDAY" && "bg-red-200 text-red-800",
                        entry.type === "CUSTOM" && "bg-yellow-200 text-yellow-800",
                      )}>
                        {entry.type === "TRANSFERRED_WORKING" ? "Рабочий" : entry.type === "HOLIDAY" ? "Праздник" : entry.type}
                      </span>
                      <span className="flex-1 text-gray-700 truncate">{entry.title || formatRussianDate(dateStr)}</span>
                      <button
                        onClick={() => handleDelete(dateStr)}
                        className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 transition-colors shrink-0"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 px-1 pb-6">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          <span>Праздник</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          <span>Перенос рабоч. дня</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" />
          <span>Доп. нерабочий</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-400">Сб Вс</span>
          <span>Выходной</span>
        </div>
      </div>

      {/* Add entry dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Добавить запись</DialogTitle>
            <DialogDescription>
              Добавьте нерабочий день или перенос рабочего дня в производственный календарь
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Дата</label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Тип</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOLIDAY">Праздник / нерабочий день</SelectItem>
                  <SelectItem value="TRANSFERRED_WORKING">Перенос рабочего дня (выходной → рабочий)</SelectItem>
                  <SelectItem value="CUSTOM">Дополнительный нерабочий</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Название</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Например: Корпоратив"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleAddEntry} disabled={!newDate}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
