"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Download, CalendarIcon, Settings2, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

// Список основных городов России и Беларуси
const CITIES = [
  // Россия
  "Москва", "Московская область", "Санкт-Петербург", "Новосибирск", "Екатеринбург",
  "Казань", "Нижний Новгород", "Челябинск", "Самара", "Омск", "Ростов-на-Дону",
  "Уфа", "Красноярск", "Воронеж", "Пермь", "Волгоград", "Краснодар", "Саратов",
  "Тюмень", "Тольятти", "Ижевск", "Барнаул", "Иркутск", "Ульяновск", "Хабаровск",
  "Владивосток", "Ярославль", "Махачкала", "Томск", "Оренбург", "Кемерово",
  "Новокузнецк", "Рязань", "Астрахань", "Набережные Челны", "Пенза", "Липецк",
  "Киров", "Тула", "Чебоксары", "Калининград", "Брянск", "Курск", "Севастополь",
  "Улан-Удэ", "Ставрополь", "Сочи", "Иваново", "Белгород", "Архангельск",
  "Владимир", "Смоленск", "Калуга", "Чита", "Великий Новгород", "Псков",
  "Вологда", "Сургут", "Петрозаводск", "Нарьян-Мар", "Сыктывкар", "Йошкар-Ола",
  "Саранск", "Нальчик", "Владикавказ", "Грозный", "Магас", "Майкоп", "Черкесск",
  "Элиста", "Абакан", "Горно-Алтайск", "Кызыл", "Ханты-Мансийск", "Салехард",
  "Анадырь", "Петропавловск-Камчатский", "Магадан", "Благовещенск", "Биробиджан",
  "Южно-Сахалинск", "Якутск", "Нижневартовск", "Стерлитамак", "Орск", "Старый Оскол",
  "Волжский", "Череповец", "Кострома", "Воркута", "Мурманск", "Новороссийск",
  // Беларусь
  "Минск", "Брест", "Витебск", "Гомель", "Гродно", "Могилёв", "Бобруйск",
  "Барановичи", "Борисов", "Пинск", "Орша", "Мозырь", "Солигорск", "Лида",
  "Новополоцк", "Молодечно", "Полоцк", "Жлобин", "Светлогорск", "Речица",
  "Жодино", "Слуцк", "Кобрин", "Сморгонь", "Волковыск", "Калинковичи",
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  NEW: { label: "Новая", variant: "default" },
  IN_PROGRESS: { label: "В работе", variant: "secondary" },
  DELIVERED: { label: "Доставлена", variant: "outline" },
  CANCELLED: { label: "Отменена", variant: "destructive" },
};

const vatOptions = {
  client: [
    { value: "NO_VAT", label: "без НДС" },
    { value: "VAT_0", label: "НДС 0%" },
    { value: "VAT_22", label: "НДС 22%" },
  ],
  carrier: [
    { value: "NO_VAT", label: "без НДС" },
    { value: "VAT_0", label: "НДС 0%" },
    { value: "VAT_5", label: "НДС 5%" },
    { value: "VAT_7", label: "НДС 7%" },
    { value: "VAT_10", label: "НДС 10%" },
    { value: "VAT_22", label: "НДС 22%" },
  ],
};

// Определение столбцов таблицы
const ALL_COLUMNS = [
  { id: "client", label: "Клиент", defaultWidth: 150 },
  { id: "port", label: "Порт", defaultWidth: 100 },
  { id: "containerNumber", label: "Номер контейнера", defaultWidth: 140 },
  { id: "containerType", label: "Тип контейнера", defaultWidth: 130 },
  { id: "cargoWeight", label: "Вес, кг", defaultWidth: 80 },
  { id: "loadingDatetime", label: "Дата погрузки", defaultWidth: 140 },
  { id: "status", label: "Статус", defaultWidth: 100 },
  { id: "notes", label: "Примечания", defaultWidth: 200 },
  { id: "orderNumber", label: "Заявка", defaultWidth: 130 },
  { id: "route", label: "Маршрут", defaultWidth: 180 },
  { id: "driver", label: "Водитель", defaultWidth: 150 },
  { id: "driverPhone", label: "Телефон", defaultWidth: 120 },
  { id: "carrier", label: "Перевозчик", defaultWidth: 150 },
  { id: "clientRate", label: "Ставка клиента", defaultWidth: 140 },
  { id: "carrierRate", label: "Ставка перевозчика", defaultWidth: 150 },
  { id: "carrierPaymentDays", label: "Срок оплаты", defaultWidth: 100 },
  { id: "emptyContainerReturnDate", label: "Сдача порожнего", defaultWidth: 130 },
  { id: "documentSubmissionDate", label: "Сдача документов", defaultWidth: 130 },
] as const;

interface Order {
  id: string;
  orderNumber: string;
  client: { id: string; name: string } | null;
  port: { id: string; name: string } | null;
  loadingDatetime: string;
  loadingCity: string;
  loadingAddress: string;
  unloadingDatetime: string | null;
  unloadingCity: string;
  unloadingAddress: string;
  containerNumber: string;
  containerType: { id: string; name: string };
  cargoWeight: number;
  status: string;
  driver: { id: string; fullName: string; phone: string | null } | null;
  vehicle: { id: string; vehicleNumber: string; trailerNumber: string | null } | null;
  carrier: string | null;
  clientRate: number | null;
  clientRateVat: string | null;
  carrierRate: number | null;
  carrierRateVat: string | null;
  carrierPaymentDays: number | null;
  emptyContainerReturnDate: string | null;
  documentSubmissionDate: string | null;
  notes: string | null;
}

// Компонент автоподбора города
function CityAutocomplete({ 
  value, 
  onChange, 
  placeholder 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  const filteredCities = useMemo(() => {
    if (!inputValue || inputValue.length < 1) return [];
    return CITIES
      .filter(city => city.toLowerCase().startsWith(inputValue.toLowerCase()))
      .slice(0, 10);
  }, [inputValue]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  return (
    <div className="relative">
      <Input
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        placeholder={placeholder}
      />
      {isOpen && filteredCities.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredCities.map((city) => (
            <div
              key={city}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100"
              onClick={() => {
                setInputValue(city);
                onChange(city);
                setIsOpen(false);
              }}
            >
              {city}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  // Состояние видимости столбцов
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ordersVisibleColumns");
      if (saved) return JSON.parse(saved);
    }
    return ALL_COLUMNS.map(c => c.id);
  });

  useEffect(() => {
    localStorage.setItem("ordersVisibleColumns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    ALL_COLUMNS.forEach(c => widths[c.id] = c.defaultWidth);
    return widths;
  });

  // Form state - упрощенная форма для новой заявки
  const [formData, setFormData] = useState({
    clientId: "",
    portId: "",
    loadingDatetime: "",
    loadingCity: "",
    loadingAddress: "",
    unloadingDatetime: "",
    unloadingCity: "",
    unloadingAddress: "",
    containerNumber: "",
    containerTypeId: "",
    cargoWeight: "",
    // Поля только для редактирования
    status: "NEW",
    driverId: "",
    vehicleId: "",
    carrier: "",
    clientRate: "",
    clientRateVat: "NO_VAT",
    carrierRate: "",
    carrierRateVat: "NO_VAT",
    carrierPaymentDays: "",
    emptyContainerReturnDate: "",
    documentSubmissionDate: "",
    notes: "",
  });

  // Fetch orders
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["orders", search, statusFilter, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
      if (dateTo) params.set("dateTo", dateTo.toISOString());
      params.set("page", page.toString());

      const response = await fetch(`/api/orders?${params}`);
      if (!response.ok) throw new Error("Failed to fetch orders");
      return response.json();
    },
  });

  // Fetch clients
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const response = await fetch("/api/clients");
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
  });

  // Fetch ports
  const { data: ports } = useQuery({
    queryKey: ["ports"],
    queryFn: async () => {
      const response = await fetch("/api/ports");
      if (!response.ok) throw new Error("Failed to fetch ports");
      return response.json();
    },
  });

  // Fetch drivers
  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const response = await fetch("/api/drivers");
      if (!response.ok) throw new Error("Failed to fetch drivers");
      return response.json();
    },
  });

  // Fetch vehicles
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const response = await fetch("/api/vehicles");
      if (!response.ok) throw new Error("Failed to fetch vehicles");
      return response.json();
    },
  });

  // Fetch container types
  const { data: containerTypes } = useQuery({
    queryKey: ["containerTypes"],
    queryFn: async () => {
      const response = await fetch("/api/container-types");
      if (!response.ok) throw new Error("Failed to fetch container types");
      return response.json();
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingOrder ? `/api/orders/${editingOrder.id}` : "/api/orders";
      const method = editingOrder ? "PUT" : "POST";

      const body: any = {
        clientId: data.clientId || null,
        portId: data.portId || null,
        loadingDatetime: data.loadingDatetime,
        loadingCity: data.loadingCity,
        loadingAddress: data.loadingAddress,
        unloadingDatetime: data.unloadingDatetime || null,
        unloadingCity: data.unloadingCity,
        unloadingAddress: data.unloadingAddress,
        containerNumber: data.containerNumber,
        containerTypeId: data.containerTypeId,
        cargoWeight: parseFloat(data.cargoWeight) || 0,
        clientRate: data.clientRate ? parseFloat(data.clientRate) : null,
        clientRateVat: data.clientRateVat || "NO_VAT",
        notes: data.notes || null,
      };

      // Дополнительные поля только при редактировании
      if (editingOrder) {
        body.status = data.status || "NEW";
        body.driverId = data.driverId || null;
        body.vehicleId = data.vehicleId || null;
        body.carrier = data.carrier || null;
        body.carrierRate = data.carrierRate ? parseFloat(data.carrierRate) : null;
        body.carrierRateVat = data.carrierRateVat || "NO_VAT";
        body.carrierPaymentDays = data.carrierPaymentDays ? parseInt(data.carrierPaymentDays) : null;
        body.emptyContainerReturnDate = data.emptyContainerReturnDate || null;
        body.documentSubmissionDate = data.documentSubmissionDate || null;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.detail || "Failed to save order");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: editingOrder ? "Заявка обновлена" : "Заявка создана",
        description: editingOrder
          ? "Изменения успешно сохранены"
          : "Новая заявка успешно создана",
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete order");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Заявка удалена" });
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Export to CSV
  const exportMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      params.set("export", "csv");
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
      if (dateTo) params.set("dateTo", dateTo.toISOString());

      const response = await fetch(`/api/orders?${params}`);
      if (!response.ok) throw new Error("Failed to export");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Экспорт завершен", description: "Файл загружен" });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Ошибка экспорта",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      clientId: "",
      portId: "",
      loadingDatetime: "",
      loadingCity: "",
      loadingAddress: "",
      unloadingDatetime: "",
      unloadingCity: "",
      unloadingAddress: "",
      containerNumber: "",
      containerTypeId: "",
      cargoWeight: "",
      status: "NEW",
      driverId: "",
      vehicleId: "",
      carrier: "",
      clientRate: "",
      clientRateVat: "NO_VAT",
      carrierRate: "",
      carrierRateVat: "NO_VAT",
      carrierPaymentDays: "",
      emptyContainerReturnDate: "",
      documentSubmissionDate: "",
      notes: "",
    });
    setEditingOrder(null);
  };

  const openEditDialog = (order: Order) => {
    setEditingOrder(order);
    setFormData({
      clientId: order.client?.id || "",
      portId: order.port?.id || "",
      loadingDatetime: new Date(order.loadingDatetime).toISOString().slice(0, 16),
      loadingCity: order.loadingCity,
      loadingAddress: order.loadingAddress,
      unloadingDatetime: order.unloadingDatetime ? new Date(order.unloadingDatetime).toISOString().slice(0, 16) : "",
      unloadingCity: order.unloadingCity,
      unloadingAddress: order.unloadingAddress,
      containerNumber: order.containerNumber,
      containerTypeId: order.containerType.id,
      cargoWeight: order.cargoWeight.toString(),
      status: order.status,
      driverId: order.driver?.id || "",
      vehicleId: order.vehicle?.id || "",
      carrier: order.carrier || "",
      clientRate: order.clientRate?.toString() || "",
      clientRateVat: order.clientRateVat || "NO_VAT",
      carrierRate: order.carrierRate?.toString() || "",
      carrierRateVat: order.carrierRateVat || "NO_VAT",
      carrierPaymentDays: order.carrierPaymentDays?.toString() || "",
      emptyContainerReturnDate: order.emptyContainerReturnDate ? order.emptyContainerReturnDate.slice(0, 10) : "",
      documentSubmissionDate: order.documentSubmissionDate ? order.documentSubmissionDate.slice(0, 10) : "",
      notes: order.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const isAdmin = session?.user?.role === "ADMIN";

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd.MM.yyyy", { locale: ru });
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: ru });
  };

  const getVatLabel = (vat: string | null) => {
    const item = [...vatOptions.client, ...vatOptions.carrier].find(v => v.value === vat);
    return item?.label || "";
  };

  const toggleColumn = (columnId: string) => {
    setVisibleColumns(prev => 
      prev.includes(columnId)
        ? prev.filter(id => id !== columnId)
        : [...prev, columnId]
    );
  };

  const getCellValue = (order: Order, columnId: string) => {
    switch (columnId) {
      case "client": return order.client?.name || "-";
      case "port": return order.port?.name || "-";
      case "containerNumber": return order.containerNumber;
      case "containerType": return order.containerType?.name || "-";
      case "cargoWeight": return order.cargoWeight;
      case "loadingDatetime": return formatDateTime(order.loadingDatetime);
      case "status": return <Badge variant={statusMap[order.status]?.variant || "default"}>{statusMap[order.status]?.label || order.status}</Badge>;
      case "notes": return order.notes || "-";
      case "orderNumber": return order.orderNumber;
      case "route": return `${order.loadingCity} → ${order.unloadingCity}`;
      case "driver": return order.driver?.fullName || "-";
      case "driverPhone": return order.driver?.phone || "-";
      case "carrier": return order.carrier || "-";
      case "clientRate": return order.clientRate ? `${order.clientRate} ₽ ${getVatLabel(order.clientRateVat)}` : "-";
      case "carrierRate": return order.carrierRate ? `${order.carrierRate} ₽ ${getVatLabel(order.carrierRateVat)}` : "-";
      case "carrierPaymentDays": return order.carrierPaymentDays ? `${order.carrierPaymentDays} дн.` : "-";
      case "emptyContainerReturnDate": return formatDate(order.emptyContainerReturnDate);
      case "documentSubmissionDate": return formatDate(order.documentSubmissionDate);
      default: return "-";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Заявки" />
      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Список заявок</CardTitle>
                <CardDescription>
                  Управление заявками на перевозку
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings2 className="w-4 h-4 mr-2" />
                      Столбцы
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {ALL_COLUMNS.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={visibleColumns.includes(column.id)}
                        onCheckedChange={() => toggleColumn(column.id)}
                      >
                        {column.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Экспорт
                </Button>
                <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Новая заявка
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Поиск по номеру, контейнеру, городу..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Все статусы</SelectItem>
                  <SelectItem value="NEW">Новые</SelectItem>
                  <SelectItem value="IN_PROGRESS">В работе</SelectItem>
                  <SelectItem value="DELIVERED">Доставлены</SelectItem>
                  <SelectItem value="CANCELLED">Отменены</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {dateFrom || dateTo
                      ? `${dateFrom ? format(dateFrom, "dd.MM.yyyy", { locale: ru }) : "..."} - ${dateTo ? format(dateTo, "dd.MM.yyyy", { locale: ru }) : "..."}`
                      : "Период"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <div className="p-4 space-y-4">
                    <div>
                      <Label className="text-xs">От</Label>
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">До</Label>
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setDateFrom(undefined);
                        setDateTo(undefined);
                      }}
                    >
                      Сбросить
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {ALL_COLUMNS.filter(c => visibleColumns.includes(c.id)).map((column) => (
                      <th
                        key={column.id}
                        className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                        style={{ width: columnWidths[column.id], minWidth: columnWidths[column.id] }}
                      >
                        {column.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20 sticky right-0 bg-gray-50">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="text-center py-8">
                        Загрузка...
                      </td>
                    </tr>
                  ) : ordersData?.orders?.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="text-center py-8">
                        Заявки не найдены
                      </td>
                    </tr>
                  ) : (
                    ordersData?.orders?.map((order: Order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        {ALL_COLUMNS.filter(c => visibleColumns.includes(c.id)).map((column) => (
                          <td
                            key={column.id}
                            className="px-3 py-3 text-sm whitespace-nowrap"
                            style={{ width: columnWidths[column.id], maxWidth: columnWidths[column.id] * 2 }}
                          >
                            <div className="truncate" title={String(getCellValue(order, column.id))}>
                              {getCellValue(order, column.id)}
                            </div>
                          </td>
                        ))}
                        <td className="px-3 py-3 sticky right-0 bg-white">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(order)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600"
                                onClick={() => {
                                  setOrderToDelete(order);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {ordersData?.pagination && ordersData.pagination.totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="flex items-center px-3 text-sm">
                  {page} / {ordersData.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === ordersData.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingOrder ? "Редактировать заявку" : "Новая заявка"}
              </DialogTitle>
              <DialogDescription>
                {editingOrder ? "Измените данные заявки" : "Заполните информацию о заявке на перевозку"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                {/* Клиент и Порт */}
                <div>
                  <Label>Клиент</Label>
                  <Select
                    value={formData.clientId}
                    onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите клиента" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Порт</Label>
                  <Select
                    value={formData.portId}
                    onValueChange={(value) => setFormData({ ...formData, portId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите порт" />
                    </SelectTrigger>
                    <SelectContent>
                      {ports?.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Дата и время загрузки */}
                <div className="md:col-span-2">
                  <Label>Дата и время загрузки *</Label>
                  <Input
                    type="datetime-local"
                    value={formData.loadingDatetime}
                    onChange={(e) => setFormData({ ...formData, loadingDatetime: e.target.value })}
                    required
                  />
                </div>

                {/* Место загрузки */}
                <div>
                  <Label>Город загрузки *</Label>
                  <CityAutocomplete
                    value={formData.loadingCity}
                    onChange={(value) => setFormData({ ...formData, loadingCity: value })}
                    placeholder="Начните вводить город..."
                  />
                </div>
                <div>
                  <Label>Адрес загрузки *</Label>
                  <Input
                    value={formData.loadingAddress}
                    onChange={(e) => setFormData({ ...formData, loadingAddress: e.target.value })}
                    placeholder="Адрес или ТТН"
                    required
                  />
                </div>

                {/* Дата выгрузки */}
                <div className="md:col-span-2">
                  <Label>Дата и время выгрузки</Label>
                  <Input
                    type="datetime-local"
                    value={formData.unloadingDatetime}
                    onChange={(e) => setFormData({ ...formData, unloadingDatetime: e.target.value })}
                  />
                </div>

                {/* Место выгрузки */}
                <div>
                  <Label>Город выгрузки *</Label>
                  <CityAutocomplete
                    value={formData.unloadingCity}
                    onChange={(value) => setFormData({ ...formData, unloadingCity: value })}
                    placeholder="Начните вводить город..."
                  />
                </div>
                <div>
                  <Label>Адрес выгрузки *</Label>
                  <Input
                    value={formData.unloadingAddress}
                    onChange={(e) => setFormData({ ...formData, unloadingAddress: e.target.value })}
                    placeholder="Адрес или ТТН"
                    required
                  />
                </div>

                {/* Контейнер */}
                <div>
                  <Label>Номер контейнера *</Label>
                  <Input
                    value={formData.containerNumber}
                    onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Тип контейнера *</Label>
                  <Select
                    value={formData.containerTypeId}
                    onValueChange={(value) => setFormData({ ...formData, containerTypeId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      {containerTypes?.map((ct: any) => (
                        <SelectItem key={ct.id} value={ct.id}>
                          {ct.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Вес груза (кг) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.cargoWeight}
                    onChange={(e) => setFormData({ ...formData, cargoWeight: e.target.value })}
                    required
                  />
                </div>

                {/* Ставка клиента */}
                <div>
                  <Label>Ставка клиента (₽)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.clientRate}
                    onChange={(e) => setFormData({ ...formData, clientRate: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>НДС клиента</Label>
                  <Select
                    value={formData.clientRateVat}
                    onValueChange={(value) => setFormData({ ...formData, clientRateVat: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vatOptions.client.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Примечания */}
                <div className="md:col-span-2">
                  <Label>Примечания</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                  />
                </div>

                {/* === ПОЛЯ ТОЛЬКО ДЛЯ РЕДАКТИРОВАНИЯ === */}
                {editingOrder && (
                  <>
                    <div className="md:col-span-2 border-t pt-4 mt-2">
                      <h4 className="font-medium text-sm text-gray-500 mb-4">Данные для обработки заявки</h4>
                    </div>

                    {/* Статус */}
                    <div>
                      <Label>Статус</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NEW">Новая</SelectItem>
                          <SelectItem value="IN_PROGRESS">В работе</SelectItem>
                          <SelectItem value="DELIVERED">Доставлена</SelectItem>
                          <SelectItem value="CANCELLED">Отменена</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Водитель */}
                    <div>
                      <Label>Водитель</Label>
                      <Select
                        value={formData.driverId}
                        onValueChange={(value) => setFormData({ ...formData, driverId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите водителя" />
                        </SelectTrigger>
                        <SelectContent>
                          {drivers?.map((d: any) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Транспорт */}
                    <div>
                      <Label>Транспорт</Label>
                      <Select
                        value={formData.vehicleId}
                        onValueChange={(value) => setFormData({ ...formData, vehicleId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите транспорт" />
                        </SelectTrigger>
                        <SelectContent>
                          {vehicles?.map((v: any) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.vehicleNumber} {v.trailerNumber ? `/ ${v.trailerNumber}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Перевозчик */}
                    <div className="md:col-span-2">
                      <Label>Перевозчик</Label>
                      <Input
                        value={formData.carrier}
                        onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                        placeholder="Наименование перевозчика"
                      />
                    </div>

                    {/* Ставка перевозчика */}
                    <div>
                      <Label>Ставка перевозчика (₽)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.carrierRate}
                        onChange={(e) => setFormData({ ...formData, carrierRate: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label>НДС перевозчика</Label>
                      <Select
                        value={formData.carrierRateVat}
                        onValueChange={(value) => setFormData({ ...formData, carrierRateVat: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {vatOptions.carrier.map((v) => (
                            <SelectItem key={v.value} value={v.value}>
                              {v.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Срок оплаты */}
                    <div>
                      <Label>Срок оплаты перевозчику (банковских дней)</Label>
                      <Input
                        type="number"
                        value={formData.carrierPaymentDays}
                        onChange={(e) => setFormData({ ...formData, carrierPaymentDays: e.target.value })}
                        placeholder="Количество дней"
                      />
                    </div>

                    {/* Даты */}
                    <div>
                      <Label>Дата сдачи порожнего контейнера</Label>
                      <Input
                        type="date"
                        value={formData.emptyContainerReturnDate}
                        onChange={(e) => setFormData({ ...formData, emptyContainerReturnDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Дата сдачи документов</Label>
                      <Input
                        type="date"
                        value={formData.documentSubmissionDate}
                        onChange={(e) => setFormData({ ...formData, documentSubmissionDate: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Отмена
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Удалить заявку?</DialogTitle>
              <DialogDescription>
                Вы уверены, что хотите удалить заявку {orderToDelete?.orderNumber}?
                Это действие нельзя отменить.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => orderToDelete && deleteMutation.mutate(orderToDelete.id)}
                disabled={deleteMutation.isPending}
              >
                Удалить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
