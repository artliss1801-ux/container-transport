"use client";

import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, Suspense } from "react";
import { useSession } from "@/components/SessionProvider";
import { usePermissions } from "@/hooks/use-permissions";
import { getUserItem, setUserItem, cleanLegacyKeys } from "@/lib/user-storage";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  Plus, Search, Edit, Trash2, Settings2,
  UserCheck, CheckCircle, Building2, Truck, MapPin, Package, DollarSign,
  Eye, FileText, GripVertical, Move, ArrowUp, ArrowDown, X, Clock, ExternalLink, RotateCcw,
  Funnel, ArrowUpDown, Check, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, TrendingUp, TrendingDown, Calculator, Percent, History,
  Save, Upload, Printer, ArrowLeft, FileOutput, UserCog, Loader2, CalendarDays, Lock, Unlock, ChevronDown
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { CitySelect } from "@/components/CitySelect";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { countRussianWorkingDays, addRussianWorkingDays } from "@/lib/russian-calendar";
import { cn } from "@/lib/utils";
import { PrintTab } from "@/components/print/PrintTab";
import { CounterpartyEditDialog } from "@/components/CounterpartyEditDialog";
import { TTNPreviewDialog } from "@/components/print/TTNPreviewDialog";
import { TitlePagePreviewDialog } from "@/components/print/TitlePagePreviewDialog";

// Статусы заявок
const statusConfig = {
  NEW: { label: "Новый", color: "bg-blue-500 text-white" },
  WAITING_RELEASE: { label: "Ждем выпуск", color: "bg-cyan-500 text-white" },
  WAITING_RELAY: { label: "Ждем релиз", color: "bg-teal-500 text-white" },
  IN_PORT: { label: "В порту", color: "bg-indigo-500 text-white" },
  IN_TRANSIT: { label: "В пути", color: "bg-amber-500 text-white" },
  AT_CUSTOMS: { label: "На таможне", color: "bg-orange-500 text-white" },
  AT_UNLOADING: { label: "На выгрузке", color: "bg-purple-500 text-white" },
  AT_LOADING: { label: "На загрузке", color: "bg-violet-500 text-white" },
  ON_RETURN: { label: "На возврате", color: "bg-pink-500 text-white" },
  PROBLEM: { label: "Проблема", color: "bg-red-500 text-white" },
  FOR_REVIEW: { label: "На проверке", color: "bg-sky-500 text-white" },
  COMPLETED: { label: "Сдан", color: "bg-green-500 text-white" },
  WAITING_PAYMENT: { label: "Ожидание оплаты", color: "bg-yellow-500 text-white" },
  PAID: { label: "Оплачено перевозчику", color: "bg-emerald-500 text-white" },
};

// Столбцы таблицы
const DEFAULT_COLUMNS = [
  { id: "orderNumber", label: "Заявка", width: 120 },
  { id: "status", label: "Статус", width: 130 },
  { id: "client", label: "Клиент", width: 160 },
  { id: "containerNumber", label: "Контейнер", width: 130 },
  { id: "route", label: "Маршрут", width: 220 },
  { id: "loadingDate", label: "Дата загрузки", width: 150 },
  { id: "carrier", label: "Перевозчик", width: 160 },
  { id: "driver", label: "Водитель", width: 150 },
  { id: "vehicle", label: "Тягач", width: 130 },
  { id: "clientRate", label: "Ставка клиента", width: 140 },
  { id: "carrierRate", label: "Ставка перевозчика", width: 150 },
  { id: "assignedManager", label: "Менеджер", width: 150 },
  { id: "port", label: "Порт", width: 130 },
  { id: "containerType", label: "Тип контейнера", width: 120 },
  { id: "cargoWeight", label: "Вес груза", width: 100 },
  { id: "driverPhone", label: "Телефон водителя", width: 140 },
  { id: "totalClientExpenses", label: "РЗ", width: 100 },
  { id: "totalCarrierExpenses", label: "РП", width: 100 },
  { id: "notes", label: "Примечания", width: 200 },
];

// Столбцы, видимые по умолчанию (новые столбцы скрыты, доступны через кнопку «Столбцы»)
const DEFAULT_VISIBLE_COLUMN_IDS = [
  "orderNumber", "status", "client", "containerNumber", "route", "loadingDate",
  "carrier", "driver", "vehicle", "clientRate", "carrierRate", "assignedManager", "notes",
];

// Столбцы и видимые столбцы для роли Заказчик (read-only, ограниченный набор)
const CLIENT_COLUMNS = [
  { id: "client", label: "Клиент", width: 160 },
  { id: "port", label: "Порт", width: 130 },
  { id: "containerNumber", label: "Контейнер", width: 130 },
  { id: "containerType", label: "Тип контейнера", width: 120 },
  { id: "cargoWeight", label: "Вес груза", width: 100 },
  { id: "loadingDate", label: "Дата загрузки", width: 150 },
  { id: "route", label: "Маршрут", width: 220 },
  { id: "driver", label: "Водитель", width: 150 },
  { id: "vehicle", label: "Тягач", width: 130 },
  { id: "trailer", label: "Прицеп", width: 130 },
  { id: "driverPhone", label: "Телефон водителя", width: 140 },
  { id: "clientRate", label: "Ставка клиента", width: 140 },
  { id: "cargoNotes", label: "Примечания к грузу", width: 200 },
  { id: "emptyContainerReturnDate", label: "Дата сдачи порожнего", width: 150 },
  { id: "emptyContainerReturnLocation", label: "Куда сдали порожний", width: 160 },
  { id: "unloadingDate", label: "Дата доставки", width: 150 },
];
const CLIENT_VISIBLE_COLUMN_IDS = [
  "client", "port", "containerNumber", "containerType", "cargoWeight", "loadingDate",
  "route", "driver", "vehicle", "trailer", "driverPhone", "clientRate",
];

// --- Для ТТН ---
const TTN_COLUMNS: { id: string; label: string; width: number; type?: string }[] = [
  { id: "tareWeight", label: "Вес тары", width: 100, type: "number" },
  { id: "sealNumber", label: "Номер пломбы", width: 140 },
  { id: "declarationNumber", label: "Номер декларации", width: 160 },
  { id: "packageCount", label: "Кол-во мест", width: 100, type: "number" },
  { id: "cargoName", label: "Наименование груза", width: 180 },
  { id: "shipper", label: "Грузоотправитель", width: 180 },
  { id: "consignee", label: "Грузополучатель", width: 180 },
];
const TTN_COLUMN_IDS = new Set(TTN_COLUMNS.map(c => c.id));

// Опции НДС
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
    { value: "VAT_20", label: "НДС 20%" },
    { value: "VAT_22", label: "НДС 22%" },
  ],
};

// Режимы перевозки
const transportModes = [
  { value: "GTD", label: "ГТД" },
  { value: "VTT", label: "ВТТ" },
  { value: "EXPORT_FORWARD", label: "Экспорт пр.под" },
  { value: "RETURN", label: "Обратка" },
];

// Уровни опасности
const dangerLevels = [
  { value: "NOT_DANGEROUS", label: "Не опасный" },
  { value: "DANGEROUS", label: "Опасный" },
  { value: "DANGEROUS_DIRECT", label: "Опасный прямой вариант" },
];

// Типы прицепа
const trailerTypes = [
  { value: "CONTAINER_CARRIER", label: "Контейнеровоз" },
  { value: "TENT", label: "Тент" },
  { value: "REFRIGERATOR", label: "Рефрижератор" },
  { value: "LOWBOY", label: "Трал" },
];

// Типы точек маршрута
const pointTypes = [
  { value: "LOADING", label: "Загрузка" },
  { value: "UNLOADING", label: "Выгрузка" },
  { value: "TRANSIT", label: "Транзит" },
];

// Этапы перевозки для мониторинга
const transportStagesList = [
  { value: "LOADED", label: "Загрузился" },
  { value: "LEFT_PORT", label: "Выехал из порта" },
  { value: "ARRIVED_CUSTOMS", label: "Прибыл на таможню" },
  { value: "LEFT_CUSTOMS", label: "Убыл с таможни" },
  { value: "ARRIVED_UNLOADING", label: "Прибыл на выгрузку" },
  { value: "LEFT_UNLOADING", label: "Убыл с выгрузки" },
  { value: "RETURNED_EMPTY", label: "Сдал порожний" },
  { value: "SUBMITTED_DOCS", label: "Сдал документы" },
  { value: "PAID", label: "Оплачен" },
  { value: "PROBLEM", label: "Проблема" },
];

interface Order {
  id: string;
  orderNumber: string;
  client: { id: string; name: string; inn?: string | null; kpp?: string | null; address?: string | null; phone?: string | null } | null;
  clientContractId?: string | null;
  clientContract?: { id: string; contractNumber: string; contractDate: string } | null;
  port: { id: string; name: string } | null;
  loadingDatetime: string;
  loadingCity: string;
  loadingAddress: string;
  unloadingDatetime: string | null;
  unloadingCity: string;
  unloadingAddress: string;
  containerNumber: string;
  containerType: { id: string; name: string } | null;
  cargoWeight: number;
  status: string;
  transportMode?: string | null;
  kpi?: number | null;
  driver: {
    id: string;
    fullName: string;
    phone: string | null;
    licenseNumber?: string | null;
    passportSeries?: string | null;
    passportNumber?: string | null;
    passportIssuedBy?: string | null;
  } | null;
  truck: { id: string; vehicleNumber: string; brand: string | null; model: string | null } | null;
  trailer: { id: string; vehicleNumber: string; brand: string | null } | null;
  carrier: {
    id: string;
    name: string;
    inn?: string | null;
    kpp?: string | null;
    ogrn?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
  carrierId?: string | null;
  carrierContractId?: string | null;
  clientRate: number | null;
  clientRateVat: string | null;
  carrierRate: number | null;
  carrierRateVat: string | null;
  carrierPaymentDays: number | null;
  emptyContainerReturnDate: string | null;
  emptyContainerReturnLocation: string | null;
  documentSubmissionDate: string | null;
  notes: string | null;
  carrierNotes: string | null;
  assignedManager: { id: string; name: string; managerColor?: string | null } | null;
  isCompleted: boolean;
  routePoints?: RoutePoint[];
  expenses?: OrderExpense[];
  statusHistory?: StatusHistory[];
  shipper?: string | null;
  consignee?: string | null;
  cargoName?: string | null;
  cargoNotes?: string | null;
  packageCount?: number | null;
  sealNumber?: string | null;
  tareWeight?: number | null;
  declarationNumber?: string | null;
}

interface RoutePoint {
  id: string;
  pointType: string;
  pointOrder: number;
  datetime: string | null;
  city: string | null;
  cityFiasId: string | null;
  cityRegion: string | null;
  cityCountry: string | null;
  address: string | null;
  notes?: string | null;
  actualArrival?: string | null;
  actualDeparture?: string | null;
}

interface OrderExpense {
  id: string;
  contractorId: string | null;
  contractor?: { id: string; name: string } | null;
  expenseType: string;
  description: string | null;
  amount: number;
  vatType: string;
  _deleted?: boolean; // Флаг для пометки удалённых расходов
}

interface StatusHistory {
  id: string;
  status: string;
  changedAt: string;
  changedBy: string | null;
  changedByUser?: { id: string; name: string } | null;
  notes?: string | null;
}

interface ChangeHistoryItem {
  id: string;
  fieldName: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedBy: string | null;
  changedByUser?: { id: string; name: string } | null;
}

interface TransportStage {
  id: string;
  stageType: string;
  stageDatetime: string | null;  // Строка в ISO формате
  recordedAt: string;
  recordedBy: string | null;
  recordedByUser?: { id: string; name: string } | null;
  editedAt: string | null;
  editedBy: string | null;
  editedByUser?: { id: string; name: string } | null;
  description: string | null;
}


// Типы для фильтров колонок
type ColumnFilterValue = string | string[];

interface ColumnFilterState {
  [columnId: string]: ColumnFilterValue;
}

interface ColumnSortState {
  columnId: string | null;
  direction: 'asc' | 'desc' | null;
}

// Сохранённая конфигурация фильтров
interface SavedFilterConfig {
  id: string;
  name: string;
  config: {
    statusFilter: string[];
    clientFilter: string[];
    carrierFilter: string[];
    managerFilter: string[];
    branchFilter: string[];
    search: string;
    dateFrom: string;
    dateTo: string;
    dateField: string;
    sortBy: string;
    sortOrder: string;
    enabledFilters: string[];
    filterSearches: Record<string, string>;
    columnFilters: Record<string, string[]>;
    columnSort: { columnId: string | null; direction: 'asc' | 'desc' | null };
  };
  createdAt: string;
}

// Компонент многосрочного выпадающего списка фильтра
function FilterDropdown({
  title,
  searchValue,
  onSearchChange,
  selected,
  onToggle,
  options,
}: {
  title: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  selected: string[];
  onToggle: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const filteredOptions = useMemo(() => {
    if (!searchValue.trim()) return options;
    const q = searchValue.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, searchValue]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{title}</span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => selected.forEach(v => onToggle(v))}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Очистить ({selected.length})
          </button>
        )}
      </div>
      <Input
        placeholder={`Поиск по ${title.toLowerCase()}...`}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-8 text-xs"
      />
      <ScrollArea className="h-48">
        <div className="space-y-1">
          {filteredOptions.map(option => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(option.value)}
                onCheckedChange={() => onToggle(option.value)}
              />
              <span className="text-sm text-slate-700 truncate">{option.label}</span>
            </label>
          ))}
          {filteredOptions.length === 0 && (
            <p className="text-xs text-slate-400 py-2 text-center">Ничего не найдено</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Компонент Resizable Column Header
function ResizableHeader({ 
  column, 
  width, 
  onWidthChange, 
  onDragStart,
  onDragEnd,
  isDragging,
  children,
  onDrop,
  isFirstColumn,
}: { 
  column: { id: string; label: string };
  width: number;
  onWidthChange: (width: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  children: React.ReactNode;
  onDrop?: () => void;
  isFirstColumn?: boolean;
}) {
  const resizeRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(80, Math.min(400, startWidth + diff));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <th
      className={cn(
        "relative px-4 pt-1 pb-1 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider whitespace-nowrap bg-gradient-to-b from-slate-100 to-slate-50 border-b border-slate-200",
        isFirstColumn && "sticky left-0 z-20 border-r border-slate-200"
      )}
      style={{ width, minWidth: width }}
    >
      <div className="flex items-center gap-1">
        <div 
          className="flex items-center gap-2 cursor-grab active:cursor-grabbing flex-1"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {isDragging ? (
            <Move className="w-3 h-3 text-blue-500 flex-shrink-0" />
          ) : (
            <GripVertical className="w-3 h-3 text-slate-400 hover:text-slate-600 flex-shrink-0" />
          )}
          <span 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onDrop?.(); }}
            className="flex-1"
          >
            {children}
          </span>
        </div>
      </div>
      
      <div
        ref={resizeRef}
        className={cn("absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors", isResizing ? "bg-blue-500" : "hover:bg-blue-400 bg-transparent")}
        onMouseDown={handleMouseDown}
      />
    </th>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="text-gray-500">Загрузка...</div></div>}>
      <OrdersPageContent />
    </Suspense>
  );
}

function OrdersPageContent() {
  const session = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const uid = session.user?.id || "";

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [carrierFilter, setCarrierFilter] = useState<string[]>([]);
  const [managerFilter, setManagerFilter] = useState<string[]>([]);
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [dateField, setDateField] = useState<string>("createdAt");
  const [noOrderNumber, setNoOrderNumber] = useState<boolean>(false);
  const [noLoadingDate, setNoLoadingDate] = useState<boolean>(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  // Which filter panels are expanded in the popover
  const [enabledFilters, setEnabledFilters] = useState<Set<string>>(new Set());
  // Local search strings for each filter dropdown
  const [filterSearches, setFilterSearches] = useState<Record<string, string>>({});
  
  // Состояние сортировки
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<string>("desc");

  // Состояние пагинации
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState(100);

  const [dialogOpen, setDialogOpen] = useState(false);
  const saveAndCloseRef = useRef(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [carrierCardOpen, setCarrierCardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("client");
  const [editFromLink, setEditFromLink] = useState(false); // true when opened via ?edit=ID link
  const [ttnPrintOrderId, setTtnPrintOrderId] = useState<string | null>(null);
  const [titlePrintOrderId, setTitlePrintOrderId] = useState<string | null>(null);

  // Hydrate filter/sort/pagination state from server (UserPagePreference) on mount
  const hydratedRef = useRef(false);
  const serverHydratedRef = useRef(false);

  // Try loading from localStorage first (instant, for UI while server loads)
  useEffect(() => {
    if (!uid || hydratedRef.current) return;
    hydratedRef.current = true;
    const s = getUserItem<string>(uid, "ordersSearch");
    if (s) setSearch(s);
    const sf = getUserItem<string[]>(uid, "ordersStatusFilter");
    if (sf?.length) setStatusFilter(sf);
    const cf = getUserItem<string[]>(uid, "ordersClientFilter");
    if (cf?.length) setClientFilter(cf);
    const caf = getUserItem<string[]>(uid, "ordersCarrierFilter");
    if (caf?.length) setCarrierFilter(caf);
    const mf = getUserItem<string[]>(uid, "ordersManagerFilter");
    if (mf?.length) setManagerFilter(mf);
    const bf = getUserItem<string[]>(uid, "ordersBranchFilter");
    if (bf?.length) setBranchFilter(bf);
    const df = getUserItem<string>(uid, "ordersDateFrom");
    if (df) setDateFrom(df);
    const dt = getUserItem<string>(uid, "ordersDateTo");
    if (dt) setDateTo(dt);
    const dfi = getUserItem<string>(uid, "ordersDateField");
    if (dfi) setDateField(dfi);
    const ef = getUserItem<string[]>(uid, "ordersEnabledFilters");
    if (ef) setEnabledFilters(new Set(ef));
    const fs = getUserItem<Record<string, string>>(uid, "ordersFilterSearches");
    if (fs) setFilterSearches(fs);
    const sb = getUserItem<string>(uid, "ordersSortBy");
    if (sb) setSortBy(sb);
    const so = getUserItem<string>(uid, "ordersSortOrder");
    if (so) setSortOrder(so);
    const cp = getUserItem<number>(uid, "ordersCurrentPage");
    if (cp) setCurrentPage(cp);
  }, [uid]);

  // Load from server and apply (overrides localStorage values)
  useEffect(() => {
    if (!uid || serverHydratedRef.current) return;
    serverHydratedRef.current = true;
    fetch(`/api/user-page-preferences?page=orders`)
      .then(res => res.json())
      .then(data => {
        if (!data.config) return;
        try {
          const c = JSON.parse(data.config);
          if (c.search !== undefined) setSearch(c.search);
          if (c.statusFilter) setStatusFilter(c.statusFilter);
          if (c.clientFilter) setClientFilter(c.clientFilter);
          if (c.carrierFilter) setCarrierFilter(c.carrierFilter);
          if (c.managerFilter) setManagerFilter(c.managerFilter);
          if (c.branchFilter) setBranchFilter(c.branchFilter);
          if (c.dateFrom !== undefined) setDateFrom(c.dateFrom);
          if (c.dateTo !== undefined) setDateTo(c.dateTo);
          if (c.dateField) setDateField(c.dateField);
          if (c.enabledFilters) setEnabledFilters(new Set(c.enabledFilters));
          if (c.filterSearches) setFilterSearches(c.filterSearches);
          if (c.sortBy) setSortBy(c.sortBy);
          if (c.sortOrder) setSortOrder(c.sortOrder);
          if (c.currentPage) setCurrentPage(c.currentPage);
          if (c.columns && !isClient) {
            // Merge TTN columns if applicable
            const serverCols = c.columns;
            if (canViewTtnColumns) {
              const ttnMap = new Map(TTN_COLUMNS.map(tc => [tc.id, tc]));
              const merged = serverCols.map((col: any) => {
                const ttnDef = ttnMap.get(col.id);
                return ttnDef ? { ...col, ...ttnDef } : col;
              });
              const serverIds = new Set(serverCols.map((col: any) => col.id));
              for (const tc of TTN_COLUMNS) {
                if (!serverIds.has(tc.id)) {
                  merged.push(tc);
                }
              }
              setColumns(merged);
            } else {
              setColumns(serverCols.filter((col: any) => !TTN_COLUMN_IDS.has(col.id)));
            }
          }
          if (c.visibleColumns && !isClient) {
            if (canViewTtnColumns) {
              const withTtn = [...c.visibleColumns];
              for (const tc of TTN_COLUMNS) {
                if (!withTtn.includes(tc.id)) {
                  withTtn.push(tc.id);
                }
              }
              setVisibleColumns(withTtn);
            } else {
              setVisibleColumns(c.visibleColumns.filter((id: string) => !TTN_COLUMN_IDS.has(id)));
            }
          }
          if (c.columnFilters) setColumnFilters(c.columnFilters);
          if (c.columnSort) setColumnSort(c.columnSort);
        } catch (e) {
          console.error("[orders] Failed to parse server preferences:", e);
        }
      })
      .catch(err => console.error("[orders] Failed to load preferences from server:", err));
  }, [uid]);

  // Build a preferences object and save to server with debounce
  const savePrefsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePreferencesToServer = useCallback((prefs: Record<string, unknown>) => {
    if (savePrefsTimeoutRef.current) clearTimeout(savePrefsTimeoutRef.current);
    savePrefsTimeoutRef.current = setTimeout(() => {
      if (!uid) return;
      fetch("/api/user-page-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: "orders", config: JSON.stringify(prefs) }),
      }).catch(err => console.error("[orders] Failed to save preferences:", err));
    }, 1000);
  }, [uid]);

  // Состояние столбцов (user-scoped)
  const isClient = session.user?.role === "CLIENT";
  const canViewTtnColumns = !isClient && (session.user?.role === "ADMIN" || session.user?.role === "LOGISTICS_MANAGER");
  const [columns, setColumns] = useState<{ id: string; label: string; width: number; type?: string }[]>(() =>
    canViewTtnColumns ? [...DEFAULT_COLUMNS, ...TTN_COLUMNS] : [...DEFAULT_COLUMNS]
  );
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    canViewTtnColumns ? [...DEFAULT_VISIBLE_COLUMN_IDS, ...TTN_COLUMNS.map(c => c.id)] : [...DEFAULT_VISIBLE_COLUMN_IDS]
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState>({});
  const [columnSort, setColumnSort] = useState<ColumnSortState>({ columnId: null, direction: null });

  useEffect(() => {
    if (!uid) return;
    if (!isClient) {
      const savedCols = getUserItem(uid, "ordersColumns");
      if (savedCols) {
        // Merge: add missing columns AND update label for existing ones (keep user's width)
        const allDefaults = canViewTtnColumns ? [...DEFAULT_COLUMNS, ...TTN_COLUMNS] : [...DEFAULT_COLUMNS];
        const defaultMap = new Map(allDefaults.map(c => [c.id, c]));
        const merged = savedCols.map((c: any) => {
          const def = defaultMap.get(c.id);
          return def ? { ...c, label: def.label } : c;
        });
        const savedIds = new Set(savedCols.map((c: any) => c.id));
        for (const dc of allDefaults) {
          if (!savedIds.has(dc.id)) {
            merged.push(dc);
          }
        }
        setColumns(merged);
      }
      const v = getUserItem<string[]>(uid, "ordersVisibleColumns");
      if (v) {
        if (canViewTtnColumns) {
          // Add TTN column IDs that user hasn't explicitly hidden
          const withTtn = [...v];
          for (const tc of TTN_COLUMNS) {
            if (!withTtn.includes(tc.id)) {
              withTtn.push(tc.id);
            }
          }
          setVisibleColumns(withTtn);
        } else {
          // Filter out TTN columns
          setVisibleColumns(v.filter(id => !TTN_COLUMN_IDS.has(id)));
        }
      }
    }
    const f = getUserItem<ColumnFilterState>(uid, "ordersFilterState");
    if (f) setColumnFilters(f);
    const s = getUserItem<ColumnSortState>(uid, "ordersSortState");
    if (s) setColumnSort(s);
    cleanLegacyKeys(["ordersColumns", "ordersVisibleColumns", "ordersFilterState", "ordersSortState"]);
  }, [uid, isClient, canViewTtnColumns]);

  // Для роли Заказчик — принудительно устанавливаем ограниченный набор столбцов
  useEffect(() => {
    if (isClient) {
      setColumns(CLIENT_COLUMNS);
      // If admin configured specific visible columns, use those; otherwise use defaults
      const adminColumns = session.user?.clientVisibleColumns;
      if (adminColumns && adminColumns.length > 0) {
        setVisibleColumns(adminColumns);
      } else {
        setVisibleColumns(CLIENT_VISIBLE_COLUMN_IDS);
      }
      setSortBy("loadingDate");
      setDateField("loadingDate");
    }
  }, [isClient, session.user?.clientVisibleColumns]);

  // Persist ALL filter/sort/column state to localStorage + server (single effect, debounced server save)
  useEffect(() => {
    if (!uid) return;
    // localStorage (immediate)
    setUserItem(uid, "ordersSearch", search);
    setUserItem(uid, "ordersStatusFilter", statusFilter);
    setUserItem(uid, "ordersClientFilter", clientFilter);
    setUserItem(uid, "ordersCarrierFilter", carrierFilter);
    setUserItem(uid, "ordersManagerFilter", managerFilter);
    setUserItem(uid, "ordersBranchFilter", branchFilter);
    setUserItem(uid, "ordersDateFrom", dateFrom);
    setUserItem(uid, "ordersDateTo", dateTo);
    setUserItem(uid, "ordersDateField", dateField);
    setUserItem(uid, "ordersEnabledFilters", [...enabledFilters]);
    setUserItem(uid, "ordersFilterSearches", filterSearches);
    setUserItem(uid, "ordersSortBy", sortBy);
    setUserItem(uid, "ordersSortOrder", sortOrder);
    setUserItem(uid, "ordersCurrentPage", currentPage);
    if (!isClient) {
      setUserItem(uid, "ordersColumns", columns);
      setUserItem(uid, "ordersVisibleColumns", visibleColumns);
    }
    setUserItem(uid, "ordersFilterState", columnFilters);
    setUserItem(uid, "ordersSortState", columnSort);
    // Server (debounced)
    if (isClient) {
      savePreferencesToServer({ search, statusFilter, clientFilter, carrierFilter, managerFilter, branchFilter, dateFrom, dateTo, dateField, enabledFilters: [...enabledFilters], filterSearches, sortBy, sortOrder, currentPage, columnFilters, columnSort });
    } else {
      savePreferencesToServer({ search, statusFilter, clientFilter, carrierFilter, managerFilter, branchFilter, dateFrom, dateTo, dateField, enabledFilters: [...enabledFilters], filterSearches, sortBy, sortOrder, currentPage, columns, visibleColumns, columnFilters, columnSort });
    }
  }, [uid, search, statusFilter, clientFilter, carrierFilter, managerFilter, branchFilter, dateFrom, dateTo, dateField, enabledFilters, filterSearches, sortBy, sortOrder, currentPage, columns, visibleColumns, columnFilters, columnSort, savePreferencesToServer, isClient]);

  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  // Sticky scrollbar refs and state
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [tableContentWidth, setTableContentWidth] = useState(0);
  const [scrollbarStyle, setScrollbarStyle] = useState<React.CSSProperties>({});
  const [isTableOverflowing, setIsTableOverflowing] = useState(false);

  // Sync scroll positions between table and sticky scrollbar
  const handleTableScroll = useCallback(() => {
    if (scrollbarRef.current && tableContainerRef.current) {
      scrollbarRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  }, []);

  const handleScrollbarScroll = useCallback(() => {
    if (scrollbarRef.current && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = scrollbarRef.current.scrollLeft;
    }
  }, []);

  // Форма заявки
  const [formData, setFormData] = useState({
    orderNumber: "",  // Номер заявки - может вводиться вручную
    clientId: "",
    clientContractId: "",
    carrierId: "",
    carrierContractId: "",
    driverId: "",
    vehicleId: "",
    trailerId: "",
    transportMode: "",
    loadingDatetime: "",
    loadingCity: "",
    loadingAddress: "",
    unloadingDatetime: "",
    unloadingCity: "",
    unloadingAddress: "",
    containerNumber: "",
    containerTypeId: "",
    trailerType: "",  // Тип прицепа: CONTAINER_CARRIER, TENT, REFRIGERATOR, LOWBOY
    cargoWeight: "",
    dangerLevel: "NOT_DANGEROUS",
    tareWeight: "",
    sealNumber: "",
    declarationNumber: "",
    packageCount: "",
    cargoName: "",
    consignee: "",
    shipper: "",
    portId: "",
    cargoNotes: "",
    clientRate: "",
    clientRateVat: "NO_VAT",
    carrierRate: "",
    carrierRateVat: "NO_VAT",
    carrierPaymentDays: "12",
    kpi: "",
    status: "NEW",
    emptyContainerReturnDate: "",
    emptyContainerReturnLocation: "",
    documentSubmissionDate: "",
    carrierPrepayment: "",
    carrierPrepaymentDate: "",
    carrierOffset: "",
    carrierOffsetAmount: "",
    carrierOffsetDescription: "",
    clientExpectedPaymentDate: "",
    clientActualPaymentDate: "",
    carrierExpectedPaymentDate: "",
    carrierActualPaymentDate: "",
    branchId: "",
    notes: "",
    carrierNotes: "",
    assignedManagerId: "NO_MANAGER",  // Менеджер по логистике (назначает администратор)
  });

  // Динамические точки маршрута
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);

  // Поисковые строки для автокомплита
  const [clientSearch, setClientSearch] = useState("");
  const [carrierSearch, setCarrierSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  // Дебаунс поиска — React автоматически откладывает обновление
  const deferredClientSearch = useDeferredValue(clientSearch);
  const deferredCarrierSearch = useDeferredValue(carrierSearch);
  const deferredDriverSearch = useDeferredValue(driverSearch);

  // Дополнительные расходы
  const [clientExpenses, setClientExpenses] = useState<OrderExpense[]>([]);
  const [carrierExpenses, setCarrierExpenses] = useState<OrderExpense[]>([]);

  // Этапы перевозки (для мониторинга)
  const [transportStages, setTransportStages] = useState<TransportStage[]>([]);
  const [newStage, setNewStage] = useState({
    stageType: "",
    stageDatetime: "",
    description: "",
    showDescription: false,
  });
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editStageData, setEditStageData] = useState({
    stageDatetime: "",
    description: "",
  });

  // Проверка ролей
  const { canReassign: canReassignPerm, canCreate } = usePermissions();
  const isAdmin = session.user?.role === "ADMIN";
  const isCommercialManager = session.user?.role === "COMMERCIAL_MANAGER";
  const isLogisticsManager = session.user?.role === "LOGISTICS_MANAGER";
  const canEditClientFields = isAdmin || isCommercialManager || isLogisticsManager;
  const canTakeOrder = isAdmin || isLogisticsManager; // Забирать заявку могут админ и менеджер по логистике
  const canReassignManager = isAdmin || canReassignPerm; // Переназначать менеджера: админ всегда, остальные по правам

  // Inline editing for TTN columns
  const [editingCell, setEditingCell] = useState<{orderId: string, field: string} | null>(null);
  const [editingCellValue, setEditingCellValue] = useState<string>("");

  // ===== Блокировка заявок =====
  const [isLocked, setIsLocked] = useState(false);
  const [lockedByUser, setLockedByUser] = useState("");
  const [lockHeartbeatInterval, setLockHeartbeatInterval] = useState<NodeJS.Timeout | null>(null);
  const lockOrderIdRef = useRef<string | null>(null);

  // ===== Данные для тентов =====
  const [tentInfo, setTentInfo] = useState<any>(null);
  const [tentInfoSaving, setTentInfoSaving] = useState(false);
  const [tentInnLookupLoading, setTentInnLookupLoading] = useState(false);
  const [tentFormOpen, setTentFormOpen] = useState(false);
  const [tentOrderDateOpen, setTentOrderDateOpen] = useState(false);
  
  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ orderId, field, value }: { orderId: string; field: string; value: any }) => {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value === "" ? null : value }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error) => {
      toast({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Inline manager reassignment from list
  const [reassignOrderId, setReassignOrderId] = useState<string | null>(null);
  const reassignMutation = useMutation({
    mutationFn: async ({ orderId, managerId }: { orderId: string; managerId: string }) => {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedManagerId: managerId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Ошибка переназначения");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setReassignOrderId(null);
      toast({ title: "Менеджер переназначен" });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInlineReassign = useCallback((orderId: string, managerId: string) => {
    reassignMutation.mutate({ orderId, managerId });
  }, [reassignMutation]);

  // Загрузка менеджеров по логистике + админов (для назначения)
  const { data: logisticsManagers } = useQuery({
    queryKey: ["logisticsManagers"],
    queryFn: async () => {
      const [logRes, adminRes] = await Promise.all([
        fetch("/api/users?role=LOGISTICS_MANAGER&limit=100"),
        fetch("/api/users?role=ADMIN&limit=100"),
      ]);
      const logData = await logRes.json();
      const adminData = await adminRes.json();
      const logUsers = logData.users || logData || [];
      const adminUsers = (adminData.users || adminData || []).filter((m: any) => m.id !== session.user?.id || true);
      // Merge: logistics managers first, then admins
      return [...logUsers, ...adminUsers];
    },
    enabled: !!session.user,
  });

  // Загрузка филиалов (для админа)
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const response = await fetch("/api/branches");
      if (!response.ok) throw new Error("Failed to fetch branches");
      return response.json();
    },
    enabled: !!session.user,
  });

  // Сброс пагинации при изменении фильтров
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, clientFilter, carrierFilter, managerFilter, branchFilter, dateFrom, dateTo, sortBy, sortOrder, dateField]);

  // Active filter count (how many filter types have at least one value)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter.length > 0) count++;
    if (clientFilter.length > 0) count++;
    if (carrierFilter.length > 0) count++;
    if (managerFilter.length > 0) count++;
    if (branchFilter.length > 0) count++;
    if (noOrderNumber) count++;
    if (noLoadingDate) count++;
    return count;
  }, [statusFilter, clientFilter, carrierFilter, managerFilter, branchFilter, noOrderNumber, noLoadingDate]);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setStatusFilter([]);
    setClientFilter([]);
    setCarrierFilter([]);
    setManagerFilter([]);
    setBranchFilter([]);
    setNoOrderNumber(false);
    setNoLoadingDate(false);
    setSortBy("createdAt");
    setSortOrder("desc");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setColumnFilters({});
    setColumnSort({ columnId: null, direction: null });
    setEnabledFilters(new Set());
    setFilterSearches({});
    setCurrentPage(1);
  }, []);

  // ---- Управление конфигурациями фильтров (серверное хранение) ----
  const [savedConfigs, setSavedConfigs] = useState<SavedFilterConfig[]>([]);
  const [showSaveConfigDialog, setShowSaveConfigDialog] = useState(false);
  const [newConfigName, setNewConfigName] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Загрузить список сохранённых конфигураций с сервера
  const refreshSavedConfigs = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch('/api/user-filter-configs?page=orders', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSavedConfigs(data);
      }
    } catch (err) {
      console.error('[filterConfigs] Failed to load:', err);
    }
  }, [uid]);

  // Загрузить список при маунте
  useEffect(() => { refreshSavedConfigs(); }, [refreshSavedConfigs]);

  const hasSavedConfig = savedConfigs.length > 0;

  // Собрать текущий state конфигурации
  const buildCurrentConfig = useCallback(() => ({
    statusFilter, clientFilter, carrierFilter, managerFilter, branchFilter,
    search, dateFrom, dateTo, dateField,
    sortBy, sortOrder,
    enabledFilters: [...enabledFilters],
    filterSearches,
    columnFilters,
    columnSort,
  }), [statusFilter, clientFilter, carrierFilter, managerFilter, branchFilter, search, dateFrom, dateTo, dateField, sortBy, sortOrder, enabledFilters, filterSearches, columnFilters, columnSort]);

  // Применить конфигурацию из объекта
  const applyConfig = useCallback((cfg: SavedFilterConfig['config']) => {
    if (cfg.statusFilter) setStatusFilter(cfg.statusFilter);
    if (cfg.clientFilter) setClientFilter(cfg.clientFilter);
    if (cfg.carrierFilter) setCarrierFilter(cfg.carrierFilter);
    if (cfg.managerFilter) setManagerFilter(cfg.managerFilter);
    if (cfg.branchFilter) setBranchFilter(cfg.branchFilter);
    if (cfg.search !== undefined) setSearch(cfg.search);
    if (cfg.dateFrom !== undefined) setDateFrom(cfg.dateFrom);
    if (cfg.dateTo !== undefined) setDateTo(cfg.dateTo);
    if (cfg.dateField) setDateField(cfg.dateField);
    if (cfg.sortBy) setSortBy(cfg.sortBy);
    if (cfg.sortOrder) setSortOrder(cfg.sortOrder);
    if (cfg.enabledFilters) setEnabledFilters(new Set(cfg.enabledFilters));
    if (cfg.filterSearches) setFilterSearches(cfg.filterSearches);
    if (cfg.columnFilters) setColumnFilters(cfg.columnFilters);
    if (cfg.columnSort) setColumnSort(cfg.columnSort);
    setCurrentPage(1);
  }, []);

  // Сохранить новую конфигурацию на сервер
  const saveFilterConfig = useCallback(async (name: string) => {
    if (!uid || !name.trim() || savingConfig) return;
    setSavingConfig(true);
    const config = buildCurrentConfig();
    try {
      const res = await fetch('/api/user-filter-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), page: 'orders', config }),
      });
      if (!res.ok) {
        let errorMsg = 'Ошибка сохранения';
        try {
          const err = await res.json();
          errorMsg = err.error || errorMsg;
        } catch {
          errorMsg = `Ошибка сервера (${res.status})`;
        }
        throw new Error(errorMsg);
      }
      await refreshSavedConfigs();
      setShowSaveConfigDialog(false);
      setNewConfigName('');
      toast({ title: 'Конфигурация сохранена', description: `«${name.trim()}» сохранена в ваш аккаунт` });
    } catch (err: any) {
      toast({ title: 'Ошибка сохранения', description: err.message, variant: 'destructive' });
    } finally {
      setSavingConfig(false);
    }
  }, [uid, buildCurrentConfig, refreshSavedConfigs, toast, savingConfig]);

  // Применить конфигурацию по id
  const loadFilterConfig = useCallback((id: string) => {
    if (!uid) return;
    const entry = savedConfigs.find(c => c.id === id);
    if (!entry) {
      toast({ title: 'Конфигурация не найдена', description: 'Возможно, она была удалена' });
      return;
    }
    applyConfig(entry.config);
    toast({ title: 'Конфигурация применена', description: `«${entry.name}» загружена` });
  }, [uid, savedConfigs, applyConfig, toast]);

  // Удалить конфигурацию по id на сервере
  const deleteFilterConfig = useCallback(async (id: string) => {
    if (!uid) return;
    const entry = savedConfigs.find(c => c.id === id);
    const name = entry?.name || '';
    try {
      const res = await fetch(`/api/user-filter-configs/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка удаления');
      }
      await refreshSavedConfigs();
      toast({ title: 'Конфигурация удалена', description: `«${name}» удалена` });
    } catch (err: any) {
      toast({ title: 'Ошибка удаления', description: err.message, variant: 'destructive' });
    }
  }, [uid, savedConfigs, refreshSavedConfigs, toast]);

  // Toggle a filter value in an array
  const toggleFilterValue = useCallback((filter: 'statusFilter' | 'clientFilter' | 'carrierFilter' | 'managerFilter' | 'branchFilter', value: string) => {
    const setter = { statusFilter: setStatusFilter, clientFilter: setClientFilter, carrierFilter: setCarrierFilter, managerFilter: setManagerFilter, branchFilter: setBranchFilter }[filter];
    setter(prev => {
      if (prev.includes(value)) return prev.filter(v => v !== value);
      return [...prev, value];
    });
  }, []);

  // Toggle a filter panel (enable/disable)
  const toggleFilterPanel = useCallback((key: string) => {
    setEnabledFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Also clear the filter values
        const setter: Record<string, React.Dispatch<React.SetStateAction<string[]>>> = {
          status: setStatusFilter,
          client: setClientFilter,
          carrier: setCarrierFilter,
          manager: setManagerFilter,
          branch: setBranchFilter,
        };
        setter[key]?.([]);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Parse manual date strings (YYYY-MM-DD from input[type=date]) to Date for API
  const parsedDateFrom = useMemo(() => {
    if (!dateFrom) return undefined;
    const d = new Date(`${dateFrom}T00:00:00`);
    return isNaN(d.getTime()) ? undefined : d;
  }, [dateFrom]);

  const parsedDateTo = useMemo(() => {
    if (!dateTo) return undefined;
    const d = new Date(`${dateTo}T23:59:59`);
    return isNaN(d.getTime()) ? undefined : d;
  }, [dateTo]);

  // Загрузка заявок (с автообновлением каждые 15 секунд для онлайн-режима)
  const { data: ordersData, isLoading, error, isError, refetch: refetchOrders } = useQuery({
    queryKey: ["orders", search, statusFilter, clientFilter, carrierFilter, managerFilter, branchFilter, parsedDateFrom, parsedDateTo, sortBy, sortOrder, currentPage, noOrderNumber, noLoadingDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter.length > 0) params.set("status", statusFilter.join(","));
      if (clientFilter.length > 0) params.set("clientId", clientFilter.join(","));
      if (carrierFilter.length > 0) params.set("carrierId", carrierFilter.join(","));
      if (managerFilter.length > 0) params.set("assignedManagerId", managerFilter.join(","));
      if (branchFilter.length > 0) params.set("branchId", branchFilter.join(","));
      if (parsedDateFrom) params.set("dateFrom", parsedDateFrom.toISOString());
      if (parsedDateTo) params.set("dateTo", parsedDateTo.toISOString());
      if (dateField && dateField !== "createdAt") params.set("dateField", dateField);
      if (noOrderNumber) params.set("noOrderNumber", "true");
      if (noLoadingDate) params.set("noLoadingDate", "true");
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("page", String(currentPage));
      params.set("pageSize", String(pageSize));

      const response = await fetch(`/api/orders?${params}`);
      if (!response.ok) {
        const errText = await response.text();
        console.error("[orders] API error:", response.status, errText);
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }
      const data = await response.json();
      console.log("[orders] Loaded:", data?.orders?.length, "orders, total:", data?.total, "page:", data?.currentPage);
      return data;
    },
    refetchInterval: 30000, // Автообновление каждые 30 секунд
  });

  // Detect table overflow for sticky scrollbar & compute position
  useEffect(() => {
    const el = tableContainerRef.current;
    const mainEl = mainRef.current;
    if (!el) return;
    const check = () => {
      setTableContentWidth(el.scrollWidth);
      const overflowing = el.scrollWidth > el.clientWidth;
      setIsTableOverflowing(overflowing);
      // Position scrollbar to match main content area bounds
      if (mainEl) {
        const rect = mainEl.getBoundingClientRect();
        setScrollbarStyle({
          position: 'fixed',
          bottom: 0,
          left: rect.left,
          width: rect.width,
          zIndex: 40,
        });
      }
    };
    check();
    const ro = new ResizeObserver(check);
    if (el) ro.observe(el);
    if (mainEl) ro.observe(mainEl);
    // Also update on resize
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [ordersData?.orders, columns, visibleColumns]);

  // Загрузка справочников
  const { data: clients } = useQuery({
    queryKey: ["clients", deferredClientSearch],
    queryFn: async () => {
      const url = deferredClientSearch
        ? `/api/clients?search=${encodeURIComponent(deferredClientSearch)}`
        : "/api/clients";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
  });

  // Загрузка договоров клиента при выборе клиента
  const { data: clientContracts } = useQuery({
    queryKey: ["clientContracts", formData.clientId],
    queryFn: async () => {
      if (!formData.clientId) return [];
      const response = await fetch(`/api/client-contracts?clientId=${formData.clientId}`);
      if (!response.ok) throw new Error("Failed to fetch client contracts");
      return response.json();
    },
    enabled: !!formData.clientId,
  });

  const { data: ports } = useQuery({
    queryKey: ["ports"],
    queryFn: async () => {
      const response = await fetch("/api/ports");
      if (!response.ok) throw new Error("Failed to fetch ports");
      return response.json();
    },
  });

  // Загрузка перевозчиков (включая заблокированных, если они уже выбраны в заявке)
  const { data: carriers } = useQuery({
    queryKey: ["carriers", deferredCarrierSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("includeBlocked", "true");
      if (deferredCarrierSearch) {
        params.set("search", deferredCarrierSearch);
      }
      const response = await fetch(`/api/carriers?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch carriers");
      return response.json();
    },
  });

  // Загрузка договоров перевозчика при выборе перевозчика
  const { data: carrierContracts } = useQuery({
    queryKey: ["carrierContracts", formData.carrierId],
    queryFn: async () => {
      if (!formData.carrierId) return [];
      const response = await fetch(`/api/carrier-contracts?carrierId=${formData.carrierId}`);
      if (!response.ok) throw new Error("Failed to fetch carrier contracts");
      return response.json();
    },
    enabled: !!formData.carrierId,
  });

  // Загрузка водителей по перевозчику
  const { data: carrierDrivers } = useQuery({
    queryKey: ["drivers", formData.carrierId, deferredDriverSearch],
    queryFn: async () => {
      if (!formData.carrierId) return [];
      const params = new URLSearchParams({ carrierId: formData.carrierId });
      if (deferredDriverSearch) params.set("search", deferredDriverSearch);
      const response = await fetch(`/api/drivers?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch drivers");
      return response.json();
    },
    enabled: !!formData.carrierId,
  });

  // Загрузка тягачей по перевозчику
  const { data: trucks } = useQuery({
    queryKey: ["trucks", formData.carrierId],
    queryFn: async () => {
      if (!formData.carrierId) return [];
      const response = await fetch(`/api/trucks?carrierId=${formData.carrierId}`);
      if (!response.ok) throw new Error("Failed to fetch trucks");
      return response.json();
    },
    enabled: !!formData.carrierId,
  });

  // Загрузка прицепов по перевозчику
  const { data: trailers } = useQuery({
    queryKey: ["trailers", formData.carrierId],
    queryFn: async () => {
      if (!formData.carrierId) return [];
      const response = await fetch(`/api/trailers?carrierId=${formData.carrierId}`);
      if (!response.ok) throw new Error("Failed to fetch trailers");
      return response.json();
    },
    enabled: !!formData.carrierId,
  });

  // Выбранный водитель (для получения тягача и прицепа)
  const selectedDriver = useMemo(() => {
    if (!formData.driverId || !carrierDrivers) return null;
    return carrierDrivers.find((d: any) => d.id === formData.driverId);
  }, [formData.driverId, carrierDrivers]);

  // Эффективный order для печати — обновляет truck/trailer/driver из текущего состояния формы,
  // чтобы PrintTab/TTN показывали актуальные данные даже без сохранения
  const effectiveOrderForPrint = useMemo(() => {
    if (!editingOrder) return null;
    const currentDriver = formData.driverId && carrierDrivers
      ? carrierDrivers.find((d: any) => d.id === formData.driverId) || null
      : null;
    // Priority:
    // 1. Manual selection (formData.vehicleId) looked up in trucks array — respects user's explicit choice
    // 2. Driver's embedded truck/trailer (from /api/drivers?carrierId=...) — auto-populated on driver select
    // 3. editingOrder's saved data — fallback when queries are still loading
    const currentTruck = (formData.vehicleId && trucks ? trucks.find((t: any) => t.id === formData.vehicleId) || null : null)
      || currentDriver?.truck
      || editingOrder.truck
      || null;
    const currentTrailer = (formData.trailerId && trailers ? trailers.find((t: any) => t.id === formData.trailerId) || null : null)
      || currentDriver?.trailer
      || editingOrder.trailer
      || null;
    return {
      ...editingOrder,
      driver: currentDriver || editingOrder.driver,
      truck: currentTruck,
      trailer: currentTrailer,
    };
  }, [editingOrder, formData.driverId, formData.vehicleId, formData.trailerId, carrierDrivers, trucks, trailers]);

  // Обработчик выбора водителя - автозаполнение тягача и прицепа
  const handleDriverChange = useCallback((driverId: string) => {
    const driver = carrierDrivers?.find((d: any) => d.id === driverId);
    setFormData(prev => ({
      ...prev,
      driverId: driverId,
      vehicleId: driver?.truck?.id || "",
      trailerId: driver?.trailer?.id || "",
    }));
  }, [carrierDrivers]);

  // Загрузка контрагентов для расходов
  const { data: contractors } = useQuery({
    queryKey: ["contractors"],
    queryFn: async () => {
      const response = await fetch("/api/contractors");
      if (!response.ok) throw new Error("Failed to fetch contractors");
      return response.json();
    },
  });

  // Контрагенты-перевозчики для расходов (не клиенты)
  const { data: carrierContractors } = useQuery({
    queryKey: ["carrierContractors"],
    queryFn: async () => {
      const response = await fetch("/api/contractors?type=CARRIER,CLIENT_CARRIER,CONTRACTOR");
      if (!response.ok) throw new Error("Failed to fetch carrier contractors");
      return response.json();
    },
    enabled: !!session.user,
  });

  const { data: containerTypes } = useQuery({
    queryKey: ["containerTypes"],
    queryFn: async () => {
      const response = await fetch("/api/container-types");
      if (!response.ok) throw new Error("Failed to fetch container types");
      return response.json();
    },
  });

  // Загрузка истории статусов для редактируемой заявки
  const { data: statusHistory } = useQuery({
    queryKey: ["statusHistory", editingOrder?.id],
    queryFn: async () => {
      if (!editingOrder?.id) return [];
      const response = await fetch(`/api/orders/${editingOrder.id}/status-history`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!editingOrder?.id,
  });

  // Загрузка истории изменений полей для редактируемой заявки
  const { data: changeHistory } = useQuery<ChangeHistoryItem[]>({
    queryKey: ["changeHistory", editingOrder?.id],
    queryFn: async () => {
      if (!editingOrder?.id) return [];
      const response = await fetch(`/api/orders/${editingOrder.id}/change-history`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!editingOrder?.id,
  });

  // Загрузка этапов перевозки для редактируемой заявки (с автообновлением)
  const { data: loadedTransportStages, refetch: refetchStages } = useQuery({
    queryKey: ["transportStages", editingOrder?.id],
    queryFn: async () => {
      if (!editingOrder?.id) return [];
      const response = await fetch(`/api/transport-stages?orderId=${editingOrder.id}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!editingOrder?.id,
    refetchInterval: 30000, // Автообновление каждые 30 секунд
  });

  // Обновление transportStages при загрузке данных
  useEffect(() => {
    if (loadedTransportStages) {
      setTransportStages(loadedTransportStages);
    }
  }, [loadedTransportStages]);

  // Проверяем наличие ключевых этапов для управления UI
  const hasSubmittedDocsStage = transportStages.some((s: any) => s.stageType === "SUBMITTED_DOCS");
  const hasReturnedEmptyStage = transportStages.some((s: any) => s.stageType === "RETURNED_EMPTY");
  // Дата сдачи порожнего из этапа мониторинга (read-only)
  const emptyReturnDateFromStage = transportStages.find((s: any) => s.stageType === "RETURNED_EMPTY")?.stageDatetime || null;
  // Дата сдачи документов из этапа мониторинга (read-only)
  const docsSubmitDateFromStage = transportStages.find((s: any) => s.stageType === "SUBMITTED_DOCS")?.stageDatetime || null;

  // Мутация для сохранения этапа
  const saveStageMutation = useMutation({
    mutationFn: async (data: { stageType: string; stageDatetime: string; description?: string }) => {
      if (!editingOrder?.id) throw new Error("Нет активной заявки");
      
      console.log("Saving stage:", { orderId: editingOrder.id, ...data });
      
      const response = await fetch("/api/transport-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: editingOrder.id,
          stageType: data.stageType,
          stageDatetime: toUTCISOString(data.stageDatetime),
          description: data.description,
        }),
      });
      
      const result = await response.json();
      console.log("Stage save response:", result);
      
      if (!response.ok) {
        throw new Error(result.error || "Ошибка сохранения этапа");
      }
      return result;
    },
    onSuccess: (data) => {
      console.log("Stage saved successfully:", data);
      refetchStages();
      setFormData(prev => ({ ...prev, status: data.newStatus }));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setNewStage({ stageType: "", stageDatetime: "", description: "", showDescription: false });
      toast({
        title: "Этап записан",
        description: `Статус обновлен: ${statusConfig[data.newStatus as keyof typeof statusConfig]?.label || data.newStatus}`,
      });
    },
    onError: (error: any) => {
      console.error("Stage save error:", error);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Мутация для редактирования этапа
  const editStageMutation = useMutation({
    mutationFn: async (data: { stageId: string; stageDatetime: string; description?: string }) => {
      const response = await fetch(`/api/transport-stages/${data.stageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageDatetime: toUTCISOString(data.stageDatetime),
          description: data.description,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка редактирования этапа");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchStages();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setEditingStageId(null);
      toast({ title: "Этап обновлен" });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Функция добавления этапа
  const handleAddStage = () => {
    if (!newStage.stageType || !newStage.stageDatetime) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Выберите этап и укажите дату/время",
      });
      return;
    }
    saveStageMutation.mutate(newStage);
  };

  // Функция сохранения редактирования этапа
  const handleSaveEditStage = (stageId: string) => {
    editStageMutation.mutate({
      stageId,
      stageDatetime: editStageData.stageDatetime,
      description: editStageData.description,
    });
  };

  // Мутация для удаления этапа (только для администратора)
  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      const response = await fetch(`/api/transport-stages/${stageId}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка удаления этапа");
      }
      return response.json();
    },
    onSuccess: (data) => {
      refetchStages();
      setFormData(prev => ({ ...prev, status: data.newStatus }));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Этап удалён", description: "Статус обновлён" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Ошибка", description: error.message });
    },
  });

  // При выборе договора перевозчика - автозаполнение даты
  useEffect(() => {
    if (formData.carrierContractId && carrierContracts) {
      const contract = carrierContracts.find((c: any) => c.id === formData.carrierContractId);
      if (contract) {
        // Дата договора доступна, но не отображаем её в отдельном поле
      }
    }
  }, [formData.carrierContractId, carrierContracts]);

  // Auto-set branchId when manager is assigned
  useEffect(() => {
    if (formData.assignedManagerId && formData.assignedManagerId !== "NO_MANAGER" && logisticsManagers) {
      const manager = (Array.isArray(logisticsManagers) ? logisticsManagers : (logisticsManagers as any).users || []).find((m: any) => m.id === formData.assignedManagerId);
      if (manager?.branchId) {
        setFormData(prev => ({ ...prev, branchId: manager.branchId }));
      }
    }
  }, [formData.assignedManagerId, logisticsManagers]);

  // Мутация сохранения
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingOrder ? `/api/orders/${editingOrder.id}` : "/api/orders";
      const method = editingOrder ? "PUT" : "POST";

      const routePointsData = routePoints.map((p, idx) => {
        console.log(`[routePointsData] Point ${idx}:`, {
          id: p.id,
          pointType: p.pointType,
          city: p.city,
          cityFiasId: p.cityFiasId,
          cityRegion: p.cityRegion,
          cityCountry: p.cityCountry,
          address: p.address,
        });
        return {
          id: p.id,
          pointType: p.pointType,
          pointOrder: idx,
          datetime: p.datetime || null,
          city: p.city,
          cityFiasId: p.cityFiasId,
          cityRegion: p.cityRegion,
          cityCountry: p.cityCountry,
          address: p.address,
          actualArrival: p.actualArrival,
          actualDeparture: p.actualDeparture,
        };
      });

      console.log("=== SAVING ORDER ===");
      console.log("Route points count:", routePoints.length);
      console.log("Route points data:", routePointsData);

      const body: any = {
        orderNumber: data.orderNumber || null,  // Номер заявки - может быть задан вручную
        clientId: data.clientId || null,
        carrierId: data.carrierId || null,
        carrierContractId: data.carrierContractId || null,
        loadingDatetime: data.loadingDatetime || null,
        loadingCity: data.loadingCity,
        loadingAddress: data.loadingAddress,
        unloadingDatetime: data.unloadingDatetime || null,
        unloadingCity: data.unloadingCity,
        unloadingAddress: data.unloadingAddress,
        containerNumber: data.containerNumber,
        containerTypeId: data.containerTypeId || null,
        trailerType: data.trailerType || null,
        cargoWeight: parseFloat(data.cargoWeight) || 0,
        dangerLevel: data.dangerLevel || "NOT_DANGEROUS",
        tareWeight: data.tareWeight ? parseFloat(data.tareWeight) : null,
        sealNumber: data.sealNumber || null,
        declarationNumber: data.declarationNumber || null,
        packageCount: data.packageCount ? parseInt(data.packageCount) : null,
        cargoName: data.cargoName || null,
        consignee: data.consignee || null,
        shipper: data.shipper || null,
        portId: data.portId || null,
        cargoNotes: data.cargoNotes || null,
        transportMode: data.transportMode || null,
        driverId: data.driverId || null,
        truckId: data.vehicleId || null,
        trailerId: data.trailerId || null,
        clientRate: data.clientRate ? parseFloat(data.clientRate) : null,
        clientRateVat: data.clientRateVat || "NO_VAT",
        carrierRate: data.carrierRate ? parseFloat(data.carrierRate) : null,
        carrierRateVat: data.carrierRateVat || "NO_VAT",
        carrierPaymentDays: data.carrierPaymentDays ? parseInt(data.carrierPaymentDays) : null,
        kpi: data.kpi ? parseFloat(data.kpi) : null,
        clientContractId: data.clientContractId || null,
        // Статус: для новой заявки всегда "NEW", для редактирования — только админ может менять статус вручную
        // Менеджеры не отправляют status, статус управляется сервером через авто-переходы
        ...(editingOrder
          ? (isAdmin ? { status: data.status } : {})
          : { status: "NEW" }
        ),
        // emptyContainerReturnDate и documentSubmissionDate больше не отправляются —
        // они управляются автоматически через этапы мониторинга (RETURNED_EMPTY, SUBMITTED_DOCS)
        emptyContainerReturnLocation: data.emptyContainerReturnLocation || null,
        notes: data.notes || null,
        carrierNotes: data.carrierNotes || null,
        assignedManagerId: data.assignedManagerId && data.assignedManagerId !== "NO_MANAGER" ? data.assignedManagerId : null,
        routePoints: routePointsData,
        expenses: [...clientExpenses.map(e => ({
          id: e.id,
          contractorId: e.contractorId,
          expenseType: "CLIENT",
          description: e.description,
          amount: e.amount,
          vatType: e.vatType,
          _deleted: e._deleted, // Передаём флаг удаления
        })), ...carrierExpenses.map(e => ({
          id: e.id,
          contractorId: e.contractorId,
          expenseType: "CARRIER",
          description: e.description,
          amount: e.amount,
          vatType: e.vatType,
          _deleted: e._deleted, // Передаём флаг удаления
        }))],
        carrierPrepayment: data.carrierPrepayment ? parseFloat(data.carrierPrepayment) : null,
        carrierPrepaymentDate: data.carrierPrepaymentDate || null,
        carrierOffset: data.carrierOffset ? parseFloat(data.carrierOffset) : null,
        carrierOffsetAmount: data.carrierOffsetAmount ? parseFloat(data.carrierOffsetAmount) : null,
        carrierOffsetDescription: data.carrierOffsetDescription || null,
        branchId: data.branchId || null,
        clientExpectedPaymentDate: data.clientExpectedPaymentDate || null,
        clientActualPaymentDate: data.clientActualPaymentDate || null,
        carrierActualPaymentDate: data.carrierActualPaymentDate || null,
        carrierExpectedPaymentDate: carrierExpectedPaymentDate || null,
      };

      console.log("Sending request to:", url);

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      console.log("Save response:", result);

      if (!response.ok) {
        throw new Error(result.error || result.detail || "Failed to save order");
      }
      return result;
    },
    onSuccess: (result) => {
      if (editingOrder && result) {
        setEditingOrder(result);
      }
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["changeHistory"] });
      refetchOrders(); // Force refetch to update the list immediately
      toast({
        title: editingOrder ? "Заявка обновлена" : "Заявка создана",
        description: editingOrder ? "Изменения успешно сохранены" : "Новая заявка успешно создана",
      });
      if (saveAndCloseRef.current) {
        saveAndCloseRef.current = false;
        setDialogOpen(false);
        resetForm();
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Мутация удаления
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

  // Мутация для забрать заявку
  const takeOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignToMe: true }),
      });
      if (!response.ok) throw new Error("Failed to take order");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Заявка закреплена за вами" });
    },
  });

  // Кнопка «Провести» удалена по запросу пользователя

  const resetForm = () => {
    setFormData({
      orderNumber: "",
      clientId: "",
      clientContractId: "",
      carrierId: "",
      carrierContractId: "",
      driverId: "",
      vehicleId: "",
      trailerId: "",
      transportMode: "",
      loadingDatetime: "",
      loadingCity: "",
      loadingAddress: "",
      unloadingDatetime: "",
      unloadingCity: "",
      unloadingAddress: "",
      containerNumber: "",
      containerTypeId: "",
      trailerType: "",
      cargoWeight: "",
      dangerLevel: "NOT_DANGEROUS",
      tareWeight: "",
      sealNumber: "",
      declarationNumber: "",
      packageCount: "",
      cargoName: "",
      consignee: "",
      shipper: "",
      portId: "",
      cargoNotes: "",
      clientRate: "",
      clientRateVat: "NO_VAT",
      carrierRate: "",
      carrierRateVat: "NO_VAT",
      carrierPaymentDays: "",
      kpi: "",
      status: "NEW",
      emptyContainerReturnDate: "",
      emptyContainerReturnLocation: "",
      documentSubmissionDate: "",
      carrierPrepayment: "",
      carrierPrepaymentDate: "",
      carrierOffset: "",
      carrierOffsetAmount: "",
      carrierOffsetDescription: "",
      clientExpectedPaymentDate: "",
      clientActualPaymentDate: "",
      carrierExpectedPaymentDate: "",
      carrierActualPaymentDate: "",
      branchId: "",
      notes: "",
      carrierNotes: "",
      assignedManagerId: "NO_MANAGER",
    });
    setRoutePoints([]);
    setClientExpenses([]);
    setCarrierExpenses([]);
    setTransportStages([]);
    setNewStage({ stageType: "", stageDatetime: "", description: "", showDescription: false });
    setEditingStageId(null);
    setEditingOrder(null);
    setTentInfo(null);
    setTentFormOpen(false);
    setActiveTab("client");
  };

  // ===== Функции блокировки заявок =====
  const acquireLock = async (orderId: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/order-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
        credentials: "include",
      });
      if (response.ok) {
        lockOrderIdRef.current = orderId;
        setIsLocked(false);
        setLockedByUser("");
        return true;
      } else if (response.status === 409) {
        const data = await response.json();
        setLockedByUser(data.lockedBy || "Неизвестный пользователь");
        setIsLocked(true);
        return false;
      }
      return true; // Если другая ошибка — пускаем
    } catch {
      return true; // Если API недоступен — пускаем
    }
  };

  const releaseLock = async () => {
    const orderId = lockOrderIdRef.current;
    if (orderId) {
      try {
        await fetch(`/api/order-locks?orderId=${orderId}`, {
          method: "DELETE",
          credentials: "include",
        });
      } catch {}
    }
    lockOrderIdRef.current = null;
    setIsLocked(false);
    setLockedByUser("");
    if (lockHeartbeatInterval) {
      clearInterval(lockHeartbeatInterval);
      setLockHeartbeatInterval(null);
    }
  };

  const startLockHeartbeat = (orderId: string) => {
    // Останавливаем предыдущий heartbeat
    if (lockHeartbeatInterval) {
      clearInterval(lockHeartbeatInterval);
    }
    const interval = setInterval(async () => {
      try {
        await fetch("/api/order-locks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
          credentials: "include",
        });
      } catch {}
    }, 30000); // Каждые 30 секунд
    setLockHeartbeatInterval(interval);
  };

  // Очистка heartbeat при размонтировании
  useEffect(() => {
    return () => {
      if (lockHeartbeatInterval) {
        clearInterval(lockHeartbeatInterval);
      }
    };
  }, [lockHeartbeatInterval]);

  // Мгновенное снятие блокировки при закрытии вкладки/переходе
  useEffect(() => {
    const handleBeforeUnload = () => {
      const orderId = lockOrderIdRef.current;
      if (orderId) {
        // fetch с keepalive работает при закрытии вкладки и поддерживает DELETE
        fetch(`/api/order-locks?orderId=${encodeURIComponent(orderId)}`, {
          method: "DELETE",
          credentials: "include",
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ===== Загрузка данных для тентов =====
  const loadTentInfo = async (orderId: string) => {
    try {
      const response = await fetch(`/api/tent-info?orderId=${orderId}`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setTentInfo(data);
      }
    } catch {
      setTentInfo(null);
    }
  };

  const saveTentInfo = async (orderId: string) => {
    if (!orderId) return;
    setTentInfoSaving(true);
    try {
      const response = await fetch("/api/tent-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...tentInfo }),
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setTentInfo(data);
        toast({ title: "Сохранено", description: "Данные для тентов сохранены" });
      }
    } catch {
      toast({ variant: "destructive", title: "Ошибка", description: "Не удалось сохранить данные" });
    } finally {
      setTentInfoSaving(false);
    }
  };

  const handleTentInnLookup = async () => {
    const inn = (tentInfo?.carrierInn || "").replace(/\D/g, "");
    if (inn.length !== 10 && inn.length !== 12) {
      toast({ variant: "destructive", title: "Ошибка", description: "ИНН должен содержать 10 или 12 цифр" });
      return;
    }
    setTentInnLookupLoading(true);
    try {
      const response = await fetch("/api/dadata/inn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inn }),
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Ошибка поиска");
      }
      const data = await response.json();
      setTentInfo(prev => prev ? ({
        ...prev,
        carrierName: data.name || prev.carrierName,
        carrierInn: data.inn || prev.carrierInn,
      }) : prev);
      toast({ title: "Найдено", description: `Перевозчик: ${data.name}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Ошибка", description: e.message || "Не удалось найти перевозчика" });
    } finally {
      setTentInnLookupLoading(false);
    }
  };

  const openEditDialog = async (order: Order) => {
    console.log("=== OPENING EDIT DIALOG ===");
    console.log("Order ID:", order.id);
    console.log("Order has routePoints:", order.routePoints?.length || 0);
    
    setEditingOrder(order);
    setFormData({
      orderNumber: order.orderNumber || "",
      clientId: order.client?.id || "",
      clientContractId: order.clientContractId || "",
      carrierId: order.carrierId || "",
      carrierContractId: order.carrierContractId || "",
      driverId: order.driver?.id || "",
      vehicleId: order.truck?.id || "",
      trailerId: order.trailer?.id || "",
      transportMode: order.transportMode || "",
      loadingDatetime: order.loadingDatetime ? order.loadingDatetime.slice(0, 16) : "",
      loadingCity: order.loadingCity || "",
      loadingAddress: order.loadingAddress || "",
      unloadingDatetime: order.unloadingDatetime ? order.unloadingDatetime.slice(0, 16) : "",
      unloadingCity: order.unloadingCity || "",
      unloadingAddress: order.unloadingAddress || "",
      containerNumber: order.containerNumber || "",
      containerTypeId: order.containerType?.id || "",
      trailerType: (order as any).trailerType || "",
      cargoWeight: order.cargoWeight?.toString() || "",
      dangerLevel: (order as any).dangerLevel || "NOT_DANGEROUS",
      tareWeight: (order as any).tareWeight?.toString() || "",
      sealNumber: (order as any).sealNumber || "",
      declarationNumber: (order as any).declarationNumber || "",
      packageCount: (order as any).packageCount?.toString() || "",
      cargoName: (order as any).cargoName || "",
      consignee: (order as any).consignee || "",
      shipper: (order as any).shipper || "",
      portId: order.port?.id || "",
      cargoNotes: (order as any).cargoNotes || "",
      clientRate: order.clientRate?.toString() || "",
      clientRateVat: order.clientRateVat || "NO_VAT",
      carrierRate: order.carrierRate?.toString() || "",
      carrierRateVat: order.carrierRateVat || "NO_VAT",
      carrierPaymentDays: order.carrierPaymentDays?.toString() || "",
      kpi: order.kpi?.toString() || "",
      status: order.status,
      emptyContainerReturnDate: order.emptyContainerReturnDate ? order.emptyContainerReturnDate.slice(0, 10) : "",
      emptyContainerReturnLocation: order.emptyContainerReturnLocation || "",
      documentSubmissionDate: order.documentSubmissionDate ? order.documentSubmissionDate.slice(0, 10) : "",
      carrierPrepayment: (order as any).carrierPrepayment?.toString() || "",
      carrierPrepaymentDate: (order as any).carrierPrepaymentDate?.slice(0, 10) || "",
      carrierOffset: (order as any).carrierOffset?.toString() || "",
      carrierOffsetAmount: (order as any).carrierOffsetAmount?.toString() || "",
      carrierOffsetDescription: (order as any).carrierOffsetDescription || "",
      clientExpectedPaymentDate: (order as any).clientExpectedPaymentDate?.slice(0, 10) || "",
      clientActualPaymentDate: (order as any).clientActualPaymentDate?.slice(0, 10) || "",
      carrierActualPaymentDate: (order as any).carrierActualPaymentDate?.slice(0, 10) || "",
      branchId: (order as any).branchId || (order as any).branch?.id || "",
      notes: order.notes || "",
      carrierNotes: (order as any).carrierNotes || "",
      assignedManagerId: order.assignedManager?.id || "NO_MANAGER",
    });

    // Загрузка точек маршрута
    try {
      console.log("Fetching route points for order:", order.id);
      const response = await fetch(`/api/route-points?orderId=${order.id}`);
      if (response.ok) {
        const points = await response.json();
        console.log("Loaded route points:", points.length, points);
        setRoutePoints(points);
      } else {
        console.error("Failed to fetch route points:", response.status);
        setRoutePoints([]);
      }
    } catch (e) {
      console.error("Error fetching route points:", e);
      setRoutePoints([]);
    }

    // Загрузка расходов
    try {
      const response = await fetch(`/api/orders/${order.id}/expenses`);
      if (response.ok) {
        const expenses = await response.json();
        setClientExpenses(expenses.filter((e: OrderExpense) => e.expenseType === "CLIENT"));
        setCarrierExpenses(expenses.filter((e: OrderExpense) => e.expenseType === "CARRIER"));
      }
    } catch (e) {
      setClientExpenses([]);
      setCarrierExpenses([]);
    }

    // Проверка блокировки и загрузка данных для тентов
    const lockAcquired = await acquireLock(order.id);
    if (lockAcquired) {
      startLockHeartbeat(order.id);
    }
    loadTentInfo(order.id);

    // Автоматически открываем раздел тентов при редактировании
    setTentFormOpen(true);

    setDialogOpen(true);
  };

  // Автоматическое открытие заявки при переходе по ссылке /orders?edit=ID
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || editingOrder) return;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${editId}`, { credentials: "include" });
        if (res.ok) {
          const order = await res.json();
          setEditFromLink(true);
          await openEditDialog(order);
        }
      } catch (e) {
        console.error("[orders] Failed to auto-open edit:", e);
      }
    })();
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Валидация
    if (!formData.trailerType) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Выберите тип прицепа",
      });
      return;
    }
    
    // Если выбран контейнеровоз, номер контейнера обязателен
    if (formData.trailerType === "CONTAINER_CARRIER" && !formData.containerNumber) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Для контейнеровоза номер контейнера обязателен",
      });
      return;
    }
    
    saveMutation.mutate(formData);
  };

  const handleSubmitWithConfirm = (e: React.FormEvent) => {
    handleSubmit(e);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd.MM.yyyy", { locale: ru });
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      // Проверяем валидность даты
      if (isNaN(date.getTime())) {
        return dateStr; // Возвращаем как есть если не парсится
      }
      return format(date, "dd.MM.yyyy HH:mm", { locale: ru });
    } catch {
      return dateStr;
    }
  };

  // Конвертация UTC -> Московское время (UTC+3) для datetime-local input
  const toLocalDatetimeInput = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";
      // Добавляем 3 часа для московского времени
      const moscowTime = new Date(date.getTime() + 3 * 60 * 60 * 1000);
      const year = moscowTime.getUTCFullYear();
      const month = String(moscowTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(moscowTime.getUTCDate()).padStart(2, '0');
      const hours = String(moscowTime.getUTCHours()).padStart(2, '0');
      const minutes = String(moscowTime.getUTCMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return "";
    }
  };

  // Конвертация московского времени из datetime-local -> UTC ISO строка
  const toUTCISOString = (localDatetime: string | null | undefined): string | null => {
    if (!localDatetime) return null;
    try {
      // localDatetime в формате "YYYY-MM-DDTHH:mm" - это московское время
      const [datePart, timePart] = localDatetime.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      // Создаём дату как UTC и вычитаем 3 часа
      const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
      utcDate.setUTCHours(utcDate.getUTCHours() - 3);
      
      return utcDate.toISOString();
    } catch {
      return null;
    }
  };

  const getVatLabel = (vat: string | null) => {
    const item = [...vatOptions.client, ...vatOptions.carrier].find(v => v.value === vat);
    return item?.label || "";
  };

  // Коэффициенты НДС для перевода суммы с НДС в сумму без НДС
  const vatDivisors: Record<string, number> = {
    NO_VAT: 1,
    VAT_0: 1,
    VAT_5: 1.05,
    VAT_7: 1.07,
    VAT_10: 1.10,
    VAT_20: 1.20,
    VAT_22: 1.22,
  };

  // Расчёт маржинальности и рентабельности
  const marginCalc = useMemo(() => {
    const clientRate = parseFloat(formData.clientRate) || 0;
    const clientRateVat = formData.clientRateVat || "NO_VAT";
    const kpi = parseFloat(formData.kpi) || 0;
    const carrierRate = parseFloat(formData.carrierRate) || 0;
    const carrierRateVat = formData.carrierRateVat || "NO_VAT";

    // Приводим ставку заказчика к без НДС
    const clientRateNoVat = clientRate / (vatDivisors[clientRateVat] || 1);

    // Приводим ставку перевозчика к без НДС
    const carrierRateNoVat = carrierRate / (vatDivisors[carrierRateVat] || 1);

    // Сумма доп. расходов по заказчику (без НДС)
    const clientExpensesNoVat = clientExpenses.reduce((sum, e) => {
      return sum + (e.amount || 0) / (vatDivisors[e.vatType] || 1);
    }, 0);

    // Сумма доп. расходов по перевозчику (без НДС)
    const carrierExpensesNoVat = carrierExpenses.reduce((sum, e) => {
      return sum + (e.amount || 0) / (vatDivisors[e.vatType] || 1);
    }, 0);

    // KPI (без наценки)
    const kpiValue = kpi;

    // РЗ = (ставка заказчика без НДС + доп.расходы по заказчику без НДС) - KPI
    const rz = clientRateNoVat + clientExpensesNoVat - kpiValue;

    // РП = ставка перевозчика без НДС + доп.расходы по перевозчику без НДС
    const rp = carrierRateNoVat + carrierExpensesNoVat;

    // Маржинальность = (РЗ - РП) / 1.05
    const marginVal = (rz - rp) / 1.05;

    // Рентабельность = Маржа × 100 / РЗ
    const profitabilityVal = rz !== 0 ? (marginVal * 100) / rz : 0;

    // Проверяем, есть ли хоть какие-то данные для расчёта
    const hasData = clientRate > 0 || carrierRate > 0 || clientExpenses.length > 0 || carrierExpenses.length > 0;

    return {
      margin: marginVal,
      profitability: profitabilityVal,
      rz,
      rp,
      hasData,
      clientRateNoVat,
      carrierRateNoVat,
      clientExpensesNoVat,
      carrierExpensesNoVat,
      kpiValue,
    };
  }, [formData.clientRate, formData.clientRateVat, formData.kpi, formData.carrierRate, formData.carrierRateVat, clientExpenses, carrierExpenses]);

  const toggleColumn = (columnId: string) => {
    setVisibleColumns(prev => 
      prev.includes(columnId)
        ? prev.filter(id => id !== columnId)
        : [...prev, columnId]
    );
  };

  const updateColumnWidth = (columnId: string, width: number) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, width } : col
    ));
  };

  const handleColumnDragStart = (columnId: string) => {
    setDraggedColumn(columnId);
  };

  const handleColumnDragEnd = () => {
    setDraggedColumn(null);
  };

  const handleColumnDrop = (targetId: string) => {
    if (!draggedColumn || draggedColumn === targetId) return;
    
    const newColumns = [...columns];
    const draggedIndex = newColumns.findIndex(c => c.id === draggedColumn);
    const targetIndex = newColumns.findIndex(c => c.id === targetId);
    
    const [removed] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, removed);
    
    setColumns(newColumns);
    setDraggedColumn(null);
  };

  // Обработчик изменения фильтра колонки
  const handleColumnFilterChange = (columnId: string, value: ColumnFilterValue) => {
    setColumnFilters(prev => {
      if (value === '' || (Array.isArray(value) && value.length === 0)) {
        const { [columnId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [columnId]: value };
    });
  };

  // Обработчик изменения сортировки колонки
  const handleColumnSortChange = (columnId: string, direction: 'asc' | 'desc' | null) => {
    if (direction === null) {
      setColumnSort({ columnId: null, direction: null });
    } else {
      setColumnSort({ columnId, direction });
    }
  };

  // Определение типа фильтра для колонки
  const getColumnFilterType = (columnId: string): 'text' | 'select' => {
    const selectColumns = ['status', 'client', 'carrier', 'assignedManager'];
    return selectColumns.includes(columnId) ? 'select' : 'text';
  };

  // Получение опций для select фильтра
  const getColumnFilterOptions = useCallback((columnId: string): { value: string; label: string }[] => {
    switch (columnId) {
      case 'status':
        return Object.entries(statusConfig).map(([key, config]) => ({ value: key, label: config.label }));
      case 'client':
        return (clients || []).map((c: any) => ({ value: c.name, label: c.name }));
      case 'carrier':
        return (carriers || []).map((c: any) => ({ value: c.name, label: c.name }));
      case 'assignedManager':
        return [
          { value: 'NO_MANAGER', label: 'Не назначен' },
          ...(logisticsManagers || []).map((m: any) => ({ value: m.id, label: m.name }))
        ];
      default: {
        // Для текстовых колонок — уникальные значения из текущих данных
        if (!ordersData?.orders) return [];
        const uniqueValues = new Set<string>();
        ordersData.orders.forEach((order: Order) => {
          const rawValue = getRawCellValue(order, columnId);
          const strValue = String(rawValue);
          if (strValue && strValue !== '-' && strValue !== 'undefined') {
            uniqueValues.add(strValue);
          }
        });
        return Array.from(uniqueValues).sort((a, b) => a.localeCompare(b, 'ru')).map(v => ({ value: v, label: v }));
      }
    }
  }, [clients, carriers, logisticsManagers, ordersData?.orders]);

  // Функции для работы с точками маршрута
  const addRoutePoint = () => {
    const newPoint: RoutePoint = {
      id: `temp-${Date.now()}`,
      pointType: "TRANSIT",
      pointOrder: routePoints.length,
      datetime: null,
      city: null,
      cityFiasId: null,
      cityRegion: null,
      cityCountry: null,
      address: null,
    };
    setRoutePoints([...routePoints, newPoint]);
  };

  const updateRoutePoint = (index: number, field: keyof RoutePoint, value: any) => {
    console.log(`[updateRoutePoint] index=${index}, field=${field}, value=`, value);
    const updated = [...routePoints];
    updated[index] = { ...updated[index], [field]: value };
    console.log(`[updateRoutePoint] updated point:`, updated[index]);
    console.log(`[updateRoutePoint] all routePoints:`, updated);
    setRoutePoints(updated);
  };

  const removeRoutePoint = (index: number) => {
    setRoutePoints(routePoints.filter((_, i) => i !== index));
  };

  const moveRoutePoint = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= routePoints.length) return;
    
    const updated = [...routePoints];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setRoutePoints(updated);
  };

  // Функции для работы с расходами
  const addClientExpense = () => {
    const newExpense: OrderExpense = {
      id: `temp-${Date.now()}`,
      contractorId: null,
      expenseType: "CLIENT",
      description: null,
      amount: 0,
      vatType: formData.clientRateVat || "NO_VAT",
    };
    setClientExpenses([...clientExpenses, newExpense]);
  };

  const addCarrierExpense = () => {
    const newExpense: OrderExpense = {
      id: `temp-${Date.now()}`,
      contractorId: null,
      expenseType: "CARRIER",
      description: null,
      amount: 0,
      vatType: formData.carrierRateVat || "NO_VAT",
    };
    setCarrierExpenses([...carrierExpenses, newExpense]);
  };

  const updateExpense = (
    type: 'CLIENT' | 'CARRIER',
    index: number,
    field: keyof OrderExpense,
    value: any
  ) => {
    if (type === 'CLIENT') {
      const updated = [...clientExpenses];
      updated[index] = { ...updated[index], [field]: value };
      setClientExpenses(updated);
    } else {
      const updated = [...carrierExpenses];
      updated[index] = { ...updated[index], [field]: value };
      setCarrierExpenses(updated);
    }
  };

  const removeExpense = (type: 'CLIENT' | 'CARRIER', index: number) => {
    if (type === 'CLIENT') {
      const expense = clientExpenses[index];
      // Если расход уже сохранён в БД (имеет реальный ID), помечаем как удалённый
      if (expense.id && !expense.id.startsWith('temp-')) {
        const updated = [...clientExpenses];
        updated[index] = { ...updated[index], _deleted: true };
        setClientExpenses(updated);
      } else {
        // Новый расход (с временным ID) просто удаляем из массива
        setClientExpenses(clientExpenses.filter((_, i) => i !== index));
      }
    } else {
      const expense = carrierExpenses[index];
      // Если расход уже сохранён в БД (имеет реальный ID), помечаем как удалённый
      if (expense.id && !expense.id.startsWith('temp-')) {
        const updated = [...carrierExpenses];
        updated[index] = { ...updated[index], _deleted: true };
        setCarrierExpenses(updated);
      } else {
        // Новый расход (с временным ID) просто удаляем из массива
        setCarrierExpenses(carrierExpenses.filter((_, i) => i !== index));
      }
    }
  };

  // Compute actual payment days: carrierPaymentDays + extra days from grace period
  // Используем даты из этапов мониторинга (RETURNED_EMPTY и SUBMITTED_DOCS)
  const actualPaymentDays = useMemo(() => {
    const baseDays = parseInt(formData.carrierPaymentDays) || 0;
    const returnDate = emptyReturnDateFromStage;
    const docDate = docsSubmitDateFromStage;
    
    if (!returnDate || !docDate || !baseDays) return baseDays;
    
    // Get branch grace days
    const branchGraceDays = (editingOrder as any)?.branch?.documentGraceDays;
    if (branchGraceDays === null || branchGraceDays === undefined) return baseDays;
    
    const returnD = new Date(returnDate);
    const docD = new Date(docDate);
    const workingDaysBetween = countRussianWorkingDays(returnD, docD);
    const extraDays = Math.max(0, workingDaysBetween - branchGraceDays);
    
    return baseDays + extraDays;
  }, [emptyReturnDateFromStage, docsSubmitDateFromStage, formData.carrierPaymentDays, editingOrder?.branch]);

  // Compute carrier expected payment date (doc date + actual days, skip holidays)
  const carrierExpectedPaymentDate = useMemo(() => {
    if (!docsSubmitDateFromStage || !actualPaymentDays) return "";
    const docDate = new Date(docsSubmitDateFromStage);
    const expected = addRussianWorkingDays(docDate, actualPaymentDays);
    // Форматируем в локальной таймзоне, чтобы избежать сдвига даты при toISOString()
    const y = expected.getFullYear();
    const m = String(expected.getMonth() + 1).padStart(2, '0');
    const d = String(expected.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [docsSubmitDateFromStage, actualPaymentDays]);

  // Выбранный договор перевозчика для отображения даты
  const selectedCarrierContract = useMemo(() => {
    if (!formData.carrierContractId || !carrierContracts) return null;
    return carrierContracts.find((c: any) => c.id === formData.carrierContractId);
  }, [formData.carrierContractId, carrierContracts]);

  // Выбранный договор клиента для отображения даты
  const selectedClientContract = useMemo(() => {
    if (!formData.clientContractId || !clientContracts) return null;
    return clientContracts.find((c: any) => c.id === formData.clientContractId);
  }, [formData.clientContractId, clientContracts]);

  const getCellValue = (order: Order, columnId: string) => {
    const statusConf = statusConfig[order.status as keyof typeof statusConfig];
    switch (columnId) {
      case "orderNumber": {
        if (order.loadingDatetime && !order.orderNumber) {
          return <span className="font-bold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded">—</span>;
        }
        return order.orderNumber || "-";
      }
      case "status": return (
        <Badge className={cn(statusConf?.color || "bg-gray-500 text-white", "font-medium shadow-sm")}>
          {statusConf?.label || order.status}
        </Badge>
      );
      case "client": return order.client?.name || "-";
      case "containerNumber": return order.containerNumber || "-";
      case "route": {
        if (order.routePoints && order.routePoints.length > 0) {
          const sortedPoints = [...order.routePoints].sort((a, b) => a.pointOrder - b.pointOrder);
          const cities: string[] = [];
          for (const p of sortedPoints) {
            if (p.city && (cities.length === 0 || cities[cities.length - 1] !== p.city)) {
              cities.push(p.city);
            }
          }
          if (cities.length === 1) return cities[0] || "-";
          return cities.join(' → ') || "-";
        }
        return [order.loadingCity, order.unloadingCity].filter(Boolean).join(' → ') || "-";
      }
      case "loadingDate": {
        // Сначала проверяем routePoints, затем loadingDatetime
        let loadingDateStr: string | null = null;
        
        if (order.routePoints && order.routePoints.length > 0) {
          const sortedPoints = [...order.routePoints].sort((a, b) => a.pointOrder - b.pointOrder);
          const loadingPoint = sortedPoints.find(p => p.pointType === 'LOADING');
          loadingDateStr = loadingPoint?.datetime || null;
        }
        
        // Fallback на loadingDatetime если нет routePoints
        if (!loadingDateStr) {
          loadingDateStr = order.loadingDatetime;
        }
        
        // Отображаем только дату без времени
        const formatted = formatDate(loadingDateStr);
        if (!loadingDateStr || formatted === "-") return "-";
        try {
          // Сравниваем дату загрузки с текущей датой в московском часовом поясе
          const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }); // "YYYY-MM-DD"
          const orderDateStr = loadingDateStr.substring(0, 10); // ISO date portion
          if (todayStr === orderDateStr) {
            return <span className="font-bold text-red-600">{formatted}</span>;
          }
        } catch {}
        return formatted;
      }
      case "carrier": return order.carrier?.name || "-";
      case "driver": {
        if (order.loadingDatetime && !order.driver?.fullName) {
          return <span className="font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">—</span>;
        }
        return order.driver?.fullName || "-";
      }
      case "vehicle": return order.truck?.vehicleNumber || "-";
      case "trailer": return order.trailer?.vehicleNumber || "-";
      case "clientRate": return order.clientRate ? `${order.clientRate.toLocaleString('ru-RU')} ₽ ${getVatLabel(order.clientRateVat)}` : "-";
      case "carrierRate": return order.carrierRate ? `${order.carrierRate.toLocaleString('ru-RU')} ₽ ${getVatLabel(order.carrierRateVat)}` : "-";
      case "assignedManager": {
        if (canReassignManager && !isClient) {
          return (
            <Popover open={reassignOrderId === order.id} onOpenChange={(open) => { if (!open) setReassignOrderId(null); }}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1 group cursor-pointer hover:text-blue-600 transition-colors w-full"
                  onClick={(e) => { e.stopPropagation(); setReassignOrderId(order.id); }}
                  title="Нажмите для переназначения менеджера"
                >
                  <span className="truncate">{order.assignedManager?.name || "—"}</span>
                  <UserCog className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-blue-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" side="bottom" align="start" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm font-medium mb-2">Переназначить менеджера</p>
                <Select
                  onValueChange={(value) => handleInlineReassign(order.id, value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите менеджера" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NO_MANAGER">Не назначен</SelectItem>
                    {Array.isArray(logisticsManagers) && logisticsManagers
                      .filter((m: any) => !m.dismissalDate)
                      .map((manager: any) => (
                        <SelectItem key={manager.id} value={manager.id}>
                          {manager.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </PopoverContent>
            </Popover>
          );
        }
        return order.assignedManager?.name || "—";
      }
      case "port": return order.port?.name || "-";
      case "containerType": return order.containerType?.name || "-";
      case "cargoWeight": return order.cargoWeight ? `${order.cargoWeight.toLocaleString('ru-RU')} кг` : "-";
      case "driverPhone": return order.driver?.phone || "-";
      case "totalClientExpenses": {
        const clientTotal = (order.clientRate || 0) + (order.expenses || [])
          .filter(e => e.expenseType === "CLIENT")
          .reduce((s, e) => s + (e.amount || 0), 0);
        return clientTotal > 0 ? `${Math.round(clientTotal).toLocaleString('ru-RU')} ₽` : "-";
      }
      case "totalCarrierExpenses": {
        const carrierTotal = (order.carrierRate || 0) + (order.expenses || [])
          .filter(e => e.expenseType === "CARRIER")
          .reduce((s, e) => s + (e.amount || 0), 0);
        return carrierTotal > 0 ? `${Math.round(carrierTotal).toLocaleString('ru-RU')} ₽` : "-";
      }
      case "notes": return order.notes || "-";
      case "cargoNotes": return (order as any).cargoNotes || "-";
      case "emptyContainerReturnDate": {
        const d = order.emptyContainerReturnDate;
        return d ? formatDate(d) : "-";
      }
      case "emptyContainerReturnLocation": return order.emptyContainerReturnLocation || "-";
      case "unloadingDate": {
        let unloadingDateStr: string | null = null;
        if (order.routePoints && order.routePoints.length > 0) {
          const sortedPoints = [...order.routePoints].sort((a, b) => a.pointOrder - b.pointOrder);
          const unloadingPoint = sortedPoints.find(p => p.pointType === 'UNLOADING');
          unloadingDateStr = unloadingPoint?.datetime || null;
        }
        if (!unloadingDateStr) unloadingDateStr = order.unloadingDatetime;
        const formatted = formatDate(unloadingDateStr);
        return (!unloadingDateStr || formatted === "-") ? "-" : formatted;
      }
      // --- Для ТТН ---
      case "tareWeight": return order.tareWeight != null ? order.tareWeight.toLocaleString('ru-RU') + " кг" : "-";
      case "sealNumber": return order.sealNumber || "-";
      case "declarationNumber": return order.declarationNumber || "-";
      case "packageCount": return order.packageCount != null ? String(order.packageCount) : "-";
      case "cargoName": return order.cargoName || "-";
      case "shipper": return order.shipper || "-";
      case "consignee": return order.consignee || "-";
      default: return "-";
    }
  };

  // Получение сырого значения для фильтрации/сортировки
  const getRawCellValue = (order: Order, columnId: string): string | number => {
    switch (columnId) {
      case "orderNumber": return order.orderNumber || "";
      case "status": return order.status || "";
      case "client": return order.client?.name || "";
      case "containerNumber": return order.containerNumber || "";
      case "route": {
        if (order.routePoints && order.routePoints.length > 0) {
          const sortedPoints = [...order.routePoints].sort((a, b) => a.pointOrder - b.pointOrder);
          const cities: string[] = [];
          for (const p of sortedPoints) {
            if (p.city && (cities.length === 0 || cities[cities.length - 1] !== p.city)) {
              cities.push(p.city);
            }
          }
          return cities.join(' → ');
        }
        return [order.loadingCity, order.unloadingCity].filter(Boolean).join(' → ');
      }
      case "loadingDate": {
        // Для сортировки берём дату из routePoints (первая LOADING точка)
        if (order.routePoints && order.routePoints.length > 0) {
          const sortedPoints = [...order.routePoints].sort((a, b) => a.pointOrder - b.pointOrder);
          const loadingPoint = sortedPoints.find(p => p.pointType === 'LOADING');
          if (loadingPoint?.datetime) return loadingPoint.datetime;
        }
        return order.loadingDatetime || "";
      }
      case "carrier": return order.carrier?.name || "";
      case "driver": return order.driver?.fullName || "";
      case "vehicle": return order.truck?.vehicleNumber || "";
      case "trailer": return order.trailer?.vehicleNumber || "";
      case "clientRate": return order.clientRate || 0;
      case "carrierRate": return order.carrierRate || 0;
      case "assignedManager": return order.assignedManager?.id || "NO_MANAGER";
      case "port": return order.port?.name || "";
      case "containerType": return order.containerType?.name || "";
      case "cargoWeight": return order.cargoWeight || 0;
      case "driverPhone": return order.driver?.phone || "";
      case "totalClientExpenses": return (order.clientRate || 0) + (order.expenses || [])
        .filter(e => e.expenseType === "CLIENT")
        .reduce((s, e) => s + (e.amount || 0), 0);
      case "totalCarrierExpenses": return (order.carrierRate || 0) + (order.expenses || [])
        .filter(e => e.expenseType === "CARRIER")
        .reduce((s, e) => s + (e.amount || 0), 0);
      case "notes": return order.notes || "";
      case "cargoNotes": return (order as any).cargoNotes || "";
      case "emptyContainerReturnDate": {
        if (order.routePoints && order.routePoints.length > 0) {
          const stage = order.routePoints.sort((a: any, b: any) => a.pointOrder - b.pointOrder).find((p: any) => p.pointType === 'UNLOADING');
          if (stage?.datetime) return stage.datetime;
        }
        return order.emptyContainerReturnDate || "";
      }
      case "emptyContainerReturnLocation": return order.emptyContainerReturnLocation || "";
      case "unloadingDate": {
        if (order.routePoints && order.routePoints.length > 0) {
          const sortedPoints = [...order.routePoints].sort((a, b) => a.pointOrder - b.pointOrder);
          const unloadingPoint = sortedPoints.find(p => p.pointType === 'UNLOADING');
          if (unloadingPoint?.datetime) return unloadingPoint.datetime;
        }
        return order.unloadingDatetime || "";
      }
      // --- Для ТТН ---
      case "tareWeight": return order.tareWeight ?? "";
      case "sealNumber": return order.sealNumber || "";
      case "declarationNumber": return order.declarationNumber || "";
      case "packageCount": return order.packageCount != null ? String(order.packageCount) : "";
      case "cargoName": return order.cargoName || "";
      case "shipper": return order.shipper || "";
      case "consignee": return order.consignee || "";
      default: return "";
    }
  };

  // Отфильтрованные и отсортированные заявки
  const filteredAndSortedOrders = useMemo(() => {
    if (!ordersData?.orders) return [];
    
    let result = [...ordersData.orders];
    
    // Применяем фильтры колонок
    Object.entries(columnFilters).forEach(([columnId, filterValue]) => {
      if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return;
      
      result = result.filter(order => {
        const cellValue = getRawCellValue(order, columnId);
        
        if (Array.isArray(filterValue)) {
          // Для select фильтров - проверяем наличие значения в массиве
          return filterValue.includes(String(cellValue));
        } else {
          // Для текстовых фильтров - проверяем вхождение
          return String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase());
        }
      });
    });
    
    // Применяем сортировку колонки
    if (columnSort.columnId && columnSort.direction) {
      const isDateColumn = columnSort.columnId === 'loadingDate' || columnSort.columnId === 'unloadingDate';
      result.sort((a, b) => {
        const aVal = getRawCellValue(a, columnSort.columnId!);
        const bVal = getRawCellValue(b, columnSort.columnId!);
        
        // Для колонок с датами — заявки без даты всегда внизу
        if (isDateColumn) {
          const aEmpty = !aVal || aVal === '' || aVal === '-';
          const bEmpty = !bVal || bVal === '' || bVal === '-';
          if (aEmpty && bEmpty) return 0;
          if (aEmpty) return 1;
          if (bEmpty) return -1;
        }
        
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal), 'ru');
        }
        
        return columnSort.direction === 'asc' ? comparison : -comparison;
      });
    }
    
    return result;
  }, [ordersData?.orders, columnFilters, columnSort]);

  return (
    <div className="flex flex-col h-full">
      {!editFromLink && <Header title="Заявки" />}
      <main ref={mainRef} className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
        <div className="flex-1 overflow-auto p-4 md:p-6 orders-main-scroll" style={{ paddingBottom: isTableOverflowing ? '48px' : undefined }}>
        {!editFromLink && (
        <Card className="shadow-2xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white rounded-t-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Список заявок
                </CardTitle>
                <CardDescription className="text-blue-100">
                  Управление заявками на контейнерные перевозки
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                {!isClient && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-white/30">
                      <Settings2 className="w-4 h-4 mr-2" />
                      Столбцы
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white shadow-xl border-slate-200">
                    {columns.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={visibleColumns.includes(column.id)}
                        onCheckedChange={() => toggleColumn(column.id)}
                        className="cursor-pointer"
                      >
                        {column.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
                {!isClient && canCreate("ORDERS") && (
                <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg">
                  <Plus className="w-4 h-4 mr-2" />
                  Новая заявка
                </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Фильтры */}
            <div className="space-y-3 p-4 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200">
              {/* Первая строка - поиск + кнопка фильтрации */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Поиск по номеру, контейнеру, городу, водителю..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 pr-10 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {!isClient && (
                <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="bg-white border-slate-300 gap-2">
                      <Funnel className="w-4 h-4" />
                      Настройка фильтрации
                      {activeFilterCount > 0 && (
                        <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-4 bg-white" align="end">
                    <div className="space-y-4">
                      <h4 className="font-medium text-sm text-slate-700">Фильтры</h4>
                      
                      {/* Toggle buttons for each filter type */}
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: 'status', label: 'Статус', filter: statusFilter },
                          { key: 'client', label: 'Клиент', filter: clientFilter },
                          { key: 'carrier', label: 'Перевозчик', filter: carrierFilter },
                          { key: 'manager', label: 'Менеджер', filter: managerFilter },
                          ...(isAdmin ? [{ key: 'branch', label: 'Филиал', filter: branchFilter }] : []),
                        ].map(({ key, label, filter }) => (
                          <Button
                            key={key}
                            variant={enabledFilters.has(key) ? "default" : "outline"}
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => toggleFilterPanel(key)}
                          >
                            {label}
                            {filter.length > 0 && (
                              <Badge variant={enabledFilters.has(key) ? "secondary" : "default"} className="h-4 min-w-4 px-1 text-[10px] rounded-full">
                                {filter.length}
                              </Badge>
                            )}
                          </Button>
                        ))}
                      </div>

                      {/* Без номера */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 select-none">
                          <input
                            type="checkbox"
                            checked={noOrderNumber}
                            onChange={(e) => { setNoOrderNumber(e.target.checked); setCurrentPage(1); }}
                            className="rounded border-slate-300"
                          />
                          Без номера
                        </label>
                      </div>

                      {/* Без даты загрузки */}
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 select-none">
                          <input
                            type="checkbox"
                            checked={noLoadingDate}
                            onChange={(e) => { setNoLoadingDate(e.target.checked); setCurrentPage(1); }}
                            className="rounded border-slate-300"
                          />
                          Без даты загрузки
                        </label>
                      </div>

                      {/* Status filter */}
                      {enabledFilters.has('status') && (
                        <FilterDropdown
                          title="Статус"
                          searchValue={filterSearches['status'] || ''}
                          onSearchChange={(v) => setFilterSearches(p => ({ ...p, status: v }))}
                          selected={statusFilter}
                          onToggle={(v) => toggleFilterValue('statusFilter', v)}
                          options={Object.entries(statusConfig).map(([key, config]) => ({ value: key, label: config.label }))}
                        />
                      )}

                      {/* Client filter */}
                      {enabledFilters.has('client') && (
                        <FilterDropdown
                          title="Клиент"
                          searchValue={filterSearches['client'] || ''}
                          onSearchChange={(v) => setFilterSearches(p => ({ ...p, client: v }))}
                          selected={clientFilter}
                          onToggle={(v) => toggleFilterValue('clientFilter', v)}
                          options={(clients || []).map((c: any) => ({ value: c.id, label: c.name }))}
                        />
                      )}

                      {/* Carrier filter */}
                      {enabledFilters.has('carrier') && (
                        <FilterDropdown
                          title="Перевозчик"
                          searchValue={filterSearches['carrier'] || ''}
                          onSearchChange={(v) => setFilterSearches(p => ({ ...p, carrier: v }))}
                          selected={carrierFilter}
                          onToggle={(v) => toggleFilterValue('carrierFilter', v)}
                          options={(carriers || []).map((c: any) => ({ value: c.id, label: c.name }))}
                        />
                      )}

                      {/* Manager filter */}
                      {enabledFilters.has('manager') && (
                        <FilterDropdown
                          title="Менеджер"
                          searchValue={filterSearches['manager'] || ''}
                          onSearchChange={(v) => setFilterSearches(p => ({ ...p, manager: v }))}
                          selected={managerFilter}
                          onToggle={(v) => toggleFilterValue('managerFilter', v)}
                          options={[
                            { value: 'NO_MANAGER', label: 'Не назначен' },
                            ...(logisticsManagers || []).map((m: any) => ({ value: m.id, label: m.name })),
                          ]}
                        />
                      )}

                      {/* Branch filter — только для админов */}
                      {enabledFilters.has('branch') && isAdmin && (
                        <FilterDropdown
                          title="Филиал"
                          searchValue={filterSearches['branch'] || ''}
                          onSearchChange={(v) => setFilterSearches(p => ({ ...p, branch: v }))}
                          selected={branchFilter}
                          onToggle={(v) => toggleFilterValue('branchFilter', v)}
                          options={(branches || []).map((b: any) => ({ value: b.id, label: b.name }))}
                        />
                      )}

                      {/* Apply button */}
                      <div className="flex justify-end pt-2 border-t">
                        <Button size="sm" onClick={() => setFilterPopoverOpen(false)}>
                          <Check className="w-4 h-4 mr-1" />
                          Применить
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Сортировка:</span>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-44 bg-white border-slate-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-xl">
                      {isClient ? (
                        <SelectItem value="loadingDate">Дата загрузки</SelectItem>
                      ) : (
                        <>
                      <SelectItem value="createdAt">Дата создания</SelectItem>
                      <SelectItem value="loadingDate">Дата загрузки</SelectItem>
                      <SelectItem value="orderNumber">Номер заявки</SelectItem>
                      <SelectItem value="status">Статус</SelectItem>
                      <SelectItem value="client">Клиент</SelectItem>
                      <SelectItem value="carrier">Перевозчик</SelectItem>
                      <SelectItem value="clientRate">Ставка клиента</SelectItem>
                      <SelectItem value="carrierRate">Ставка перевозчика</SelectItem>
                      <SelectItem value="updatedAt">Дата обновления</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    title={sortOrder === "asc" ? "По возрастанию" : "По убыванию"}
                    className="bg-white border-slate-300"
                  >
                    {sortOrder === "asc" ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="M11 12h4"/><path d="M11 16h7"/><path d="M11 20h10"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/></svg>
                    )}
                  </Button>
                </div>

                {/* Separator */}
                <div className="w-px h-6 bg-slate-300 hidden sm:block" />

                {/* Date field + date range */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground hidden sm:inline">Период:</span>
                  {isClient ? (
                    <span className="text-sm font-medium bg-slate-100 px-3 py-1.5 rounded-md border border-slate-300">Дата загрузки</span>
                  ) : (
                  <Select value={dateField} onValueChange={setDateField}>
                    <SelectTrigger className="w-40 bg-white border-slate-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-xl">
                      <SelectItem value="createdAt">Дата создания</SelectItem>
                      <SelectItem value="loadingDate">Дата загрузки</SelectItem>
                      <SelectItem value="unloadingDate">Дата выгрузки</SelectItem>
                      <SelectItem value="carrierActualPaymentDate">Оплата перевозчику</SelectItem>
                      <SelectItem value="documentSubmissionDate">Сдача документов</SelectItem>
                      <SelectItem value="clientActualPaymentDate">Оплата клиента</SelectItem>
                      <SelectItem value="emptyContainerReturnDate">Возврат порожнего</SelectItem>
                    </SelectContent>
                  </Select>
                  )}
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-36 bg-white border-slate-300 text-sm"
                  />
                  <span className="text-sm text-slate-400">—</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-36 bg-white border-slate-300 text-sm"
                  />
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Кнопка сброса фильтров */}
                {(activeFilterCount > 0 || sortBy !== "createdAt" || sortOrder !== "desc" || search || dateFrom || dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="text-muted-foreground"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Сбросить
                  </Button>
                )}

                {/* Кнопки сохранения/загрузки конфигурации */}
                {!isClient && (
                <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSaveConfigDialog(true)}
                  className="text-muted-foreground"
                  title="Сохранить текущие фильтры и сортировку"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Сохранить
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={hasSavedConfig ? "text-green-600" : "text-muted-foreground"}
                      disabled={!hasSavedConfig}
                      title="Применить сохранённую конфигурацию"
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      Применить
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {savedConfigs.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Нет сохранённых конфигураций</div>
                    )}
                    {savedConfigs.map((cfg) => (
                      <div key={cfg.id} className="flex items-center gap-1 px-1">
                        <button
                          className="flex-1 text-left px-2 py-1.5 text-sm rounded hover:bg-accent truncate"
                          onClick={() => loadFilterConfig(cfg.id)}
                          title={cfg.name}
                        >
                          {cfg.name}
                        </button>
                        <button
                          className="p-1.5 text-muted-foreground hover:text-red-600 rounded hover:bg-accent"
                          onClick={(e) => { e.stopPropagation(); deleteFilterConfig(cfg.id); }}
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                </>
                )}

                {/* Диалог сохранения конфигурации */}
                <Dialog open={showSaveConfigDialog} onOpenChange={setShowSaveConfigDialog}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Сохранить конфигурацию</DialogTitle>
                      <DialogDescription>Введите название для текущей конфигурации фильтров и сортировки</DialogDescription>
                    </DialogHeader>
                    <Input
                      autoFocus
                      placeholder="Название конфигурации"
                      value={newConfigName}
                      onChange={(e) => setNewConfigName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newConfigName.trim()) {
                          saveFilterConfig(newConfigName);
                        }
                      }}
                    />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowSaveConfigDialog(false)}>Отмена</Button>
                      <Button
                        onClick={() => saveFilterConfig(newConfigName)}
                        disabled={!newConfigName.trim() || savingConfig}
                      >
                        {savingConfig ? "Сохранение..." : "Сохранить"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Таблица */}
            <div 
              ref={tableContainerRef}
              className="overflow-auto max-h-[calc(100vh-220px)] orders-table-scroll-container"
              onScroll={handleTableScroll}
            >
              <table className="w-full" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {columns.filter(c => visibleColumns.includes(c.id)).map((column) => (
                    <col key={column.id} style={{ width: column.width }} />
                  ))}
                  {!isClient && <col style={{ width: 170, minWidth: 170 }} />}
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr>
                    {columns.filter(c => visibleColumns.includes(c.id)).map((column, colIdx) => (
                      <ResizableHeader
                        key={column.id}
                        column={column}
                        width={column.width}
                        onWidthChange={(width) => updateColumnWidth(column.id, width)}
                        onDragStart={() => handleColumnDragStart(column.id)}
                        onDragEnd={handleColumnDragEnd}
                        isDragging={draggedColumn === column.id}
                        onDrop={() => handleColumnDrop(column.id)}
                        isFirstColumn={colIdx === 0}
                      >
                        {column.label}
                      </ResizableHeader>
                    ))}
                    {!isClient && (
                    <th className="px-3 pt-1 pb-1 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider sticky right-0 z-20 bg-gradient-to-b from-slate-100 to-slate-50 border-b border-slate-200">
                      Действия
                    </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={visibleColumns.length + (isClient ? 0 : 1)} className="text-center py-12 text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          Загрузка...
                        </div>
                      </td>
                    </tr>
                  ) : isError ? (
                    <tr>
                      <td colSpan={visibleColumns.length + (isClient ? 0 : 1)} className="text-center py-12 text-red-500">
                        <div className="flex flex-col items-center gap-2">
                          <Package className="w-12 h-12 text-red-300" />
                          <p className="font-medium">Ошибка загрузки заявок</p>
                          <p className="text-sm text-red-400">{error?.message || "Неизвестная ошибка"}</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAndSortedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + (isClient ? 0 : 1)} className="text-center py-12 text-slate-500">
                        <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                        Заявки не найдены
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedOrders.map((order: Order) => {
                      const rowColor = order.assignedManager?.managerColor;
                      return (
                      <tr 
                        key={order.id} 
                        className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200"
                        style={rowColor ? { backgroundColor: `${rowColor}33` } : undefined}
                      >
                        {columns.filter(c => visibleColumns.includes(c.id)).map((column, colIdx) => {
                          const isTtnColumn = TTN_COLUMN_IDS.has(column.id);
                          const isEditingTtn = canViewTtnColumns && isTtnColumn && editingCell?.orderId === order.id && editingCell?.field === column.id;
                          const rawValue = (order as any)[column.id];
                          const displayValue = getCellValue(order, column.id);
                          
                          if (isEditingTtn) {
                            return (
                              <td
                                key={column.id}
                                className={cn(
                                  "px-4 pt-0.5 pb-0.5 text-sm text-slate-700 whitespace-nowrap overflow-hidden",
                                  colIdx === 0 && "sticky left-0 z-10 bg-white border-r border-slate-200 font-medium"
                                )}
                              >
                                <input
                                  autoFocus
                                  className="w-full px-1 py-0.5 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                  defaultValue={rawValue != null ? String(rawValue) : ""}
                                  onBlur={(e) => {
                                    const val = column.type === 'number' ? (e.target.value ? parseFloat(e.target.value) : null) : e.target.value;
                                    inlineUpdateMutation.mutate({ orderId: order.id, field: column.id, value: val });
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                  type={column.type === 'number' ? 'number' : 'text'}
                                  step={column.type === 'number' ? 'any' : undefined}
                                />
                              </td>
                            );
                          }
                          
                          if (canViewTtnColumns && isTtnColumn) {
                            return (
                              <td
                                key={column.id}
                                className={cn(
                                  "px-4 pt-0.5 pb-0.5 text-sm text-slate-700 whitespace-nowrap overflow-hidden",
                                  colIdx === 0 && "sticky left-0 z-10 bg-white border-r border-slate-200 font-medium"
                                )}
                              >
                                <div
                                  className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded min-h-[28px] flex items-center truncate"
                                  onClick={() => {
                                    setEditingCell({ orderId: order.id, field: column.id });
                                    setEditingCellValue(rawValue != null ? String(rawValue) : '');
                                  }}
                                  title="Нажмите для редактирования"
                                >
                                  {displayValue || <span className="text-gray-300">—</span>}
                                </div>
                              </td>
                            );
                          }
                          
                          return (
                          <td
                            key={column.id}
                            className={cn(
                              "px-4 pt-0.5 pb-0.5 text-sm text-slate-700 whitespace-nowrap overflow-hidden",
                              colIdx === 0 && "sticky left-0 z-10 bg-white border-r border-slate-200 font-medium"
                            )}
                          >
                            <div className="truncate" title={String(displayValue)}>
                              {displayValue}
                            </div>
                          </td>
                          );
                        })}
                        {!isClient && (
                        <td className="px-3 pt-0.5 pb-0.5 sticky right-0 z-10 border-l border-slate-200 bg-white shadow-md">
                          {!isClient && (
                          <div className="flex flex-wrap gap-1 items-center">
                            {canViewTtnColumns && (
                              <>
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setTtnPrintOrderId(order.id); }}
                                  title="Печать ТТН" className="hover:bg-purple-100">
                                  <FileText className="w-4 h-4 text-purple-600" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setTitlePrintOrderId(order.id); }}
                                  title="Титульный лист" className="hover:bg-teal-100">
                                  <FileOutput className="w-4 h-4 text-teal-600" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(order)} title="Редактировать" className="hover:bg-blue-100">
                              <Edit className="w-4 h-4 text-slate-600" />
                            </Button>
                            {!order.assignedManager && canTakeOrder && (
                              <Button variant="ghost" size="icon" onClick={() => takeOrderMutation.mutate(order.id)} title="Забрать заявку" className="hover:bg-blue-100">
                                <UserCheck className="w-4 h-4 text-blue-600" />
                              </Button>
                            )}
                            {/* Кнопка «Провести» удалена */}
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="hover:bg-red-100" onClick={() => { setOrderToDelete(order); setDeleteDialogOpen(true); }} title="Удалить">
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                          )}
                        </td>
                        )}
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-slate-50/50">
              <div className="text-xs text-slate-500">
                {ordersData?.total ? (
                  <>
                    Показано {(currentPage - 1) * pageSize + 1}-
                    {Math.min(currentPage * pageSize, ordersData.total)} из {ordersData.total} заявок
                  </>
                ) : (
                  <>...</>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                >
                  <ChevronsLeft className="w-3 h-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <span className="text-xs text-slate-700 px-2">
                  {currentPage} / {ordersData?.totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  disabled={!ordersData?.totalPages || currentPage >= ordersData.totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  <ChevronRight className="w-3 h-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  disabled={!ordersData?.totalPages || currentPage >= ordersData.totalPages}
                  onClick={() => setCurrentPage(ordersData.totalPages)}
                >
                  <ChevronsRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Sticky horizontal scrollbar — fixed to bottom of viewport */}
        {isTableOverflowing && tableContentWidth > 0 && (
          <div style={scrollbarStyle} className="bg-white/95 backdrop-blur-sm border-t border-slate-300 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
            <div 
              ref={scrollbarRef}
              className="overflow-x-auto orders-sticky-scrollbar-track"
              onScroll={handleScrollbarScroll}
            >
              <div style={{ width: tableContentWidth, height: '14px' }} />
            </div>
          </div>
        )}

        {/* Диалог создания/редактирования */}
        <Dialog open={dialogOpen} onOpenChange={async (open) => {
          if (!open) {
            await releaseLock();
            if (editFromLink) {
              router.back();
              return;
            }
            resetForm();
          }
          setDialogOpen(open);
        }}>
          <DialogContent 
            className={cn(
              "p-0 gap-0 overflow-hidden flex flex-col bg-white shadow-2xl",
              editFromLink
                ? "w-[100vw] max-w-[100vw] h-[100vh] max-h-[100vh] rounded-none"
                : "w-[95vw] max-w-[1400px] h-[90vh] max-h-[90vh]"
            )}
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader className="p-6 pb-0 flex-shrink-0 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    {editingOrder ? `Заявка ${editingOrder.orderNumber || '-'}` : "Новая заявка"}
                  </DialogTitle>
                  <DialogDescription className="text-blue-100">
                    {editingOrder ? "Редактирование данных заявки" : "Заполните информацию о заявке на перевозку"}
                  </DialogDescription>
                </div>
                {editFromLink && (
                  <Button
                    variant="outline"
                    onClick={() => router.back()}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Назад
                  </Button>
                )}
              </div>
            </DialogHeader>
            
            <form onSubmit={handleSubmitWithConfirm} className="flex-1 flex flex-col overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className={cn(hasSubmittedDocsStage ? "grid-cols-9" : "grid-cols-8", "bg-gradient-to-r from-slate-100 to-slate-50 rounded-none border-b flex-shrink-0 h-12 w-full")}>
                  <TabsTrigger value="client" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white">
                    <Building2 className="w-4 h-4 mr-1" />
                    Клиент
                  </TabsTrigger>
                  <TabsTrigger value="carrier" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white">
                    <Truck className="w-4 h-4 mr-1" />
                    Перевозчик
                  </TabsTrigger>
                  <TabsTrigger value="route" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white">
                    <MapPin className="w-4 h-4 mr-1" />
                    Маршрут
                  </TabsTrigger>
                  <TabsTrigger value="cargo" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white">
                    <Package className="w-4 h-4 mr-1" />
                    Груз
                  </TabsTrigger>
                  <TabsTrigger value="finance" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white">
                    <DollarSign className="w-4 h-4 mr-1" />
                    Финансы
                  </TabsTrigger>
                  <TabsTrigger value="monitoring" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white">
                    <Eye className="w-4 h-4 mr-1" />
                    Мониторинг
                  </TabsTrigger>
                  {hasSubmittedDocsStage && (
                    <TabsTrigger value="payment" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-green-500 data-[state=active]:to-green-600 data-[state=active]:text-white">
                      <DollarSign className="w-4 h-4 mr-1" />
                      Оплата
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="history" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-500 data-[state=active]:to-slate-600 data-[state=active]:text-white">
                    <History className="w-4 h-4 mr-1" />
                    История
                  </TabsTrigger>
                  <TabsTrigger value="print" className="text-xs data-[state=active]:bg-gradient-to-b data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white">
                    <Printer className="w-4 h-4 mr-1" />
                    Печать
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-slate-50 to-blue-50">
                  {/* Блок Клиента */}
                  <TabsContent value="client" className="mt-0 space-y-4">
                    {/* Номер заявки */}
                    {(isAdmin || isLogisticsManager) && (
                      <Card className="border-l-4 border-l-purple-500 shadow-lg bg-white">
                        <CardHeader className="pb-3 bg-gradient-to-r from-purple-50 to-violet-50">
                          <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                            <FileText className="w-5 h-5 text-purple-600" />
                            Номер заявки
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          <div>
                            <Label className="text-slate-700">Номер заявки</Label>
                            <Input
                              value={formData.orderNumber}
                              onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                              placeholder="Оставьте пустым для автогенерации"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Если оставить пустым, номер будет сгенерирован автоматически
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Назначение менеджера */}
                    {(isAdmin || canReassignManager) ? (
                      <Card className={cn("border-l-4 shadow-lg bg-white", canReassignManager && !isAdmin ? "border-l-orange-500" : "border-l-amber-500")}>
                        <CardHeader className={cn("pb-3", canReassignManager && !isAdmin ? "bg-gradient-to-r from-orange-50 to-amber-50" : "bg-gradient-to-r from-amber-50 to-yellow-50")}>
                          <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                            <UserCheck className="w-5 h-5 text-amber-600" />
                            Назначение менеджера
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-slate-700">Менеджер по логистике</Label>
                              <Select
                                value={formData.assignedManagerId}
                                onValueChange={(value) => setFormData({ ...formData, assignedManagerId: value })}
                              >
                                <SelectTrigger className="bg-white border-slate-300">
                                  <SelectValue placeholder="Выберите менеджера" />
                                </SelectTrigger>
                                <SelectContent className="bg-white shadow-xl">
                                  <SelectItem value="NO_MANAGER">Не назначен</SelectItem>
                                  {Array.isArray(logisticsManagers) && logisticsManagers.map((manager: any) => (
                                    <SelectItem key={manager.id} value={manager.id}>{manager.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-slate-700">Текущий менеджер</Label>
                              <div className="flex items-center gap-2 mt-2">
                                {editingOrder?.assignedManager ? (
                                  <Badge className="bg-blue-100 text-blue-700">
                                    {editingOrder.assignedManager.name}
                                  </Badge>
                                ) : (
                                  <span className="text-slate-400 text-sm">Не назначен</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : editingOrder?.assignedManager ? (
                      <Card className="border-l-4 border-l-amber-500 shadow-lg bg-white">
                        <CardHeader className="pb-3 bg-gradient-to-r from-amber-50 to-yellow-50">
                          <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                            <UserCheck className="w-5 h-5 text-amber-600" />
                            Закреплённый менеджер
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-100 text-blue-700 text-sm">
                              {editingOrder.assignedManager.name}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}
                    
                    <Card className="border-l-4 border-l-blue-500 shadow-lg bg-white">
                      <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-indigo-50">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          Информация о клиенте
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label className="flex items-center gap-1 text-slate-700">
                              Клиент
                              <span className="text-red-500">*</span>
                            </Label>
                            <SearchableSelect
                              options={(clients || []).map((c: any) => ({ value: c.id, label: c.name, secondary: c.inn || undefined }))}
                              value={formData.clientId || ""}
                              onValueChange={(value) => {
                                setFormData({ ...formData, clientId: value, clientContractId: "" });
                              }}
                              onSearchChange={setClientSearch}
                              placeholder="Начните вводить для поиска..."
                              searchPlaceholder="Поиск клиента по названию или ИНН..."
                              emptyMessage="Клиенты не найдены"
                              disabled={editingOrder && !canEditClientFields}
                              className={editingOrder && !canEditClientFields ? "bg-slate-100" : ""}
                            />
                            {editingOrder && !canEditClientFields && (
                              <p className="text-xs text-amber-600 mt-1">Только для администратора</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-slate-700">Договор клиента</Label>
                            <Select 
                              value={formData.clientContractId} 
                              onValueChange={(value) => setFormData({ ...formData, clientContractId: value })}
                              disabled={!formData.clientId || (editingOrder && !canEditClientFields)}
                            >
                              <SelectTrigger className="bg-white border-slate-300">
                                <SelectValue placeholder={formData.clientId ? "Выберите договор" : "Сначала выберите клиента"} />
                              </SelectTrigger>
                              <SelectContent className="bg-white shadow-xl">
                                {clientContracts?.map((c: any) => (
                                  <SelectItem key={c.id} value={c.id}>{c.contractNumber}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedClientContract && (
                              <p className="text-xs text-slate-500 mt-1">
                                от {formatDate(selectedClientContract.contractDate)}
                              </p>
                            )}
                          </div>
                          <div>
                            <Label className="text-slate-700">Дата договора</Label>
                            <Input
                              type="date"
                              value={selectedClientContract ? selectedClientContract.contractDate.slice(0, 10) : ""}
                              disabled
                              className="bg-slate-100 border-slate-300 text-slate-600"
                              placeholder="Автоматически из договора"
                            />
                            <p className="text-xs text-slate-500 mt-1">Заполняется из договора</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Примечания */}
                    <Card className="border-l-4 border-l-slate-400 shadow-lg bg-white">
                      <CardHeader className="pb-3 bg-gradient-to-r from-slate-50 to-gray-50">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                          <FileText className="w-5 h-5 text-slate-500" />
                          Примечания
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        <Textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          rows={3}
                          placeholder="Дополнительная информация..."
                          className="bg-white border-slate-300"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Блок Перевозчика */}
                  <TabsContent value="carrier" className="mt-0 space-y-4">
                    <Card className="border-l-4 border-l-green-500 shadow-lg bg-white">
                      <CardHeader className="pb-3 bg-gradient-to-r from-green-50 to-emerald-50">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                          <Truck className="w-5 h-5 text-green-600" />
                          Информация о перевозчике
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label className="text-slate-700">Перевозчик</Label>
                            <SearchableSelect
                              options={(carriers || []).map((c: any) => ({ 
                                value: c.id, 
                                label: c.name + (c.isBlocked ? " (заблокирован)" : ""),
                                secondary: c.inn || undefined,
                                disabled: c.isBlocked && formData.carrierId !== c.id
                              }))}
                              value={formData.carrierId || ""}
                              onValueChange={(value) => {
                                setFormData({
                                  ...formData,
                                  carrierId: value,
                                  carrierContractId: "",
                                  driverId: "",
                                  vehicleId: "",
                                  trailerId: "",
                                });
                                setDriverSearch("");
                              }}
                              onSearchChange={setCarrierSearch}
                              placeholder="Начните вводить для поиска..."
                              searchPlaceholder="Поиск перевозчика по названию или ИНН..."
                              emptyMessage="Перевозчики не найдены"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700">Договор с перевозчиком</Label>
                            <Select 
                              value={formData.carrierContractId} 
                              onValueChange={(value) => setFormData({ ...formData, carrierContractId: value })}
                              disabled={!formData.carrierId}
                            >
                              <SelectTrigger className="bg-white border-slate-300">
                                <SelectValue placeholder={formData.carrierId ? "Выберите договор" : "Сначала выберите перевозчика"} />
                              </SelectTrigger>
                              <SelectContent className="bg-white shadow-xl">
                                {carrierContracts?.map((c: any) => (
                                  <SelectItem key={c.id} value={c.id}>{c.contractNumber}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedCarrierContract && (
                              <p className="text-xs text-slate-500 mt-1">
                                от {formatDate(selectedCarrierContract.contractDate)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label className="text-slate-700">Водитель</Label>
                            <SearchableSelect
                              options={(carrierDrivers || []).map((d: any) => ({
                                value: d.id,
                                label: d.fullName,
                                secondary: d.phone || undefined,
                              }))}
                              value={formData.driverId || ""}
                              onValueChange={(value) => {
                                handleDriverChange(value);
                              }}
                              onSearchChange={setDriverSearch}
                              placeholder={formData.carrierId ? "Начните вводить для поиска..." : "Сначала выберите перевозчика"}
                              searchPlaceholder="Поиск водителя по ФИО или телефону..."
                              emptyMessage="Водители не найдены"
                              disabled={!formData.carrierId}
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <Label className="text-slate-700">Тягач</Label>
                              {formData.carrierId && (
                                <button
                                  type="button"
                                  onClick={() => setCarrierCardOpen(true)}
                                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  Изменить
                                  <Edit className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                value={selectedDriver?.truck 
                                  ? `${selectedDriver.truck.vehicleNumber}${selectedDriver.truck.brand ? ` (${selectedDriver.truck.brand}${selectedDriver.truck.model ? ` ${selectedDriver.truck.model}` : ''})` : ''}`
                                  : (formData.driverId ? "Не привязан к водителю" : "Выберите водителя")
                                }
                                disabled
                                className="bg-slate-100 border-slate-300 text-slate-700"
                              />
                            </div>
                            {selectedDriver?.truck && (
                              <p className="text-xs text-slate-500 mt-1">Автоматически из карточки водителя</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-slate-700">Прицеп</Label>
                            <Input
                              value={selectedDriver?.trailer 
                                ? `${selectedDriver.trailer.vehicleNumber}${selectedDriver.trailer.brand ? ` (${selectedDriver.trailer.brand})` : ''}`
                                : (formData.driverId ? "Не привязан к водителю" : "Выберите водителя")
                              }
                              disabled
                              className="bg-slate-100 border-slate-300 text-slate-700"
                            />
                            {selectedDriver?.trailer && (
                              <p className="text-xs text-slate-500 mt-1">Автоматически из карточки водителя</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label className="text-slate-700">Примечания по перевозчику</Label>
                            <Textarea
                              value={formData.carrierNotes}
                              onChange={(e) => setFormData({ ...formData, carrierNotes: e.target.value })}
                              placeholder="Дополнительные сведения о перевозчике..."
                              className="bg-white border-slate-300 min-h-[80px]"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Блок Маршрута */}
                  <TabsContent value="route" className="mt-0 space-y-4">
                    <Card className="border-l-4 border-l-orange-500 shadow-lg bg-white">
                      <CardHeader className="pb-3 bg-gradient-to-r from-orange-50 to-amber-50">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                          <MapPin className="w-5 h-5 text-orange-600" />
                          Маршрут перевозки
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        <div>
                          <Label className="text-slate-700">Режим перевозки</Label>
                          <Select value={formData.transportMode} onValueChange={(value) => setFormData({ ...formData, transportMode: value })}>
                            <SelectTrigger className="w-full md:w-64 bg-white border-slate-300">
                              <SelectValue placeholder="Выберите режим" />
                            </SelectTrigger>
                            <SelectContent className="bg-white shadow-xl">
                              {transportModes.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Точки маршрута */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-slate-700 font-medium">Точки маршрута</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addRoutePoint} className="bg-white">
                              <Plus className="w-4 h-4 mr-1" />
                              Добавить точку
                            </Button>
                          </div>

                          {routePoints.length > 0 ? (
                            <div className="space-y-2">
                              {routePoints.map((point, index) => (
                                <Card key={point.id} className="bg-gradient-to-r from-slate-50 to-white border-slate-200">
                                  <CardContent className="p-3">
                                    <div className="flex items-start gap-2">
                                      <div className="flex flex-col gap-1">
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-6 w-6"
                                          onClick={() => moveRoutePoint(index, 'up')}
                                          disabled={index === 0}
                                        >
                                          <ArrowUp className="w-3 h-3" />
                                        </Button>
                                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-medium">
                                          {index + 1}
                                        </div>
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-6 w-6"
                                          onClick={() => moveRoutePoint(index, 'down')}
                                          disabled={index === routePoints.length - 1}
                                        >
                                          <ArrowDown className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                                        <div>
                                          <Label className="text-xs text-slate-600">Тип</Label>
                                          <Select 
                                            value={point.pointType} 
                                            onValueChange={(value) => updateRoutePoint(index, 'pointType', value)}
                                          >
                                            <SelectTrigger className="bg-white border-slate-300 h-9">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white shadow-xl">
                                              {pointTypes.map((pt) => (
                                                <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div>
                                          <Label className="text-xs text-slate-600">Дата и время</Label>
                                          <Input
                                            type="datetime-local"
                                            value={point.datetime ? point.datetime.slice(0, 16) : ''}
                                            onChange={(e) => updateRoutePoint(index, 'datetime', e.target.value || null)}
                                            className="bg-white border-slate-300 h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs text-slate-600">Город</Label>
                                          <CitySelect
                                            value={point.city || ''}
                                            onChange={(value, cityData) => {
                                              console.log('[CitySelect onChange] value=', value, 'cityData=', cityData);
                                              // Обновляем все поля города одновременно
                                              setRoutePoints(prev => {
                                                const updated = [...prev];
                                                updated[index] = {
                                                  ...updated[index],
                                                  city: value,
                                                  cityFiasId: cityData?.id || null,
                                                  cityRegion: cityData?.region || null,
                                                  cityCountry: cityData?.country || null,
                                                };
                                                console.log('[CitySelect onChange] updated point:', updated[index]);
                                                return updated;
                                              });
                                            }}
                                            placeholder="Город"
                                            cityFiasId={point.cityFiasId}
                                            cityRegion={point.cityRegion}
                                            cityCountry={point.cityCountry}
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs text-slate-600">Адрес</Label>
                                          <Input
                                            value={point.address || ''}
                                            onChange={(e) => updateRoutePoint(index, 'address', e.target.value)}
                                            placeholder="Адрес"
                                            className="bg-white border-slate-300 h-9"
                                          />
                                        </div>
                                      </div>
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 text-red-500 hover:bg-red-50"
                                        onClick={() => removeRoutePoint(index)}
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-500 border-2 border-dashed border-slate-200 rounded-lg">
                              <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                              Точки маршрута не добавлены
                            </div>
                          )}
                        </div>


                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Блок Груза */}
                  <TabsContent value="cargo" className="mt-0 space-y-4">
                    <Card className="border-l-4 border-l-purple-500 shadow-lg bg-white">
                      <CardHeader className="pb-3 bg-gradient-to-r from-purple-50 to-violet-50">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                          <Package className="w-5 h-5 text-purple-600" />
                          Информация о грузе
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <Label className="flex items-center gap-1 text-slate-700">
                              Тип прицепа
                              <span className="text-red-500">*</span>
                            </Label>
                            <Select value={formData.trailerType} onValueChange={(value) => setFormData({ ...formData, trailerType: value })}>
                              <SelectTrigger className="bg-white border-slate-300">
                                <SelectValue placeholder="Выберите тип" />
                              </SelectTrigger>
                              <SelectContent className="bg-white shadow-xl">
                                {trailerTypes.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="flex items-center gap-1 text-slate-700">
                              Номер контейнера
                              {formData.trailerType === "CONTAINER_CARRIER" && (
                                <span className="text-red-500">*</span>
                              )}
                            </Label>
                            <Input
                              value={formData.containerNumber}
                              onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                              placeholder="ABCD1234567"
                              disabled={editingOrder && !canEditClientFields}
                              className="bg-white border-slate-300"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700">Тип контейнера</Label>
                            <Select value={formData.containerTypeId} onValueChange={(value) => setFormData({ ...formData, containerTypeId: value })}>
                              <SelectTrigger className="bg-white border-slate-300">
                                <SelectValue placeholder="Выберите тип" />
                              </SelectTrigger>
                              <SelectContent className="bg-white shadow-xl">
                                {containerTypes?.map((ct: any) => (
                                  <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-slate-700">Вес груза (кг)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.cargoWeight}
                              onChange={(e) => setFormData({ ...formData, cargoWeight: e.target.value })}
                              placeholder="0.00"
                              className="bg-white border-slate-300"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <Label className="text-slate-700">Уровень опасности</Label>
                            <Select value={formData.dangerLevel} onValueChange={(value) => setFormData({ ...formData, dangerLevel: value })}>
                              <SelectTrigger className="bg-white border-slate-300">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white shadow-xl">
                                {dangerLevels.map((level) => (
                                  <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-slate-700">Вес тары (кг)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.tareWeight}
                              onChange={(e) => setFormData({ ...formData, tareWeight: e.target.value })}
                              placeholder="0.00"
                              className="bg-white border-slate-300"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700">Номер пломбы</Label>
                            <Input
                              value={formData.sealNumber}
                              onChange={(e) => setFormData({ ...formData, sealNumber: e.target.value })}
                              placeholder="Номер пломбы"
                              className="bg-white border-slate-300"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700">Номер декларации</Label>
                            <Input
                              value={formData.declarationNumber}
                              onChange={(e) => setFormData({ ...formData, declarationNumber: e.target.value })}
                              placeholder="Номер декларации"
                              className="bg-white border-slate-300"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700">Количество мест</Label>
                            <Input
                              type="number"
                              value={formData.packageCount}
                              onChange={(e) => setFormData({ ...formData, packageCount: e.target.value })}
                              placeholder="0"
                              className="bg-white border-slate-300"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-slate-700">Наименование груза</Label>
                            <Input
                              value={formData.cargoName}
                              onChange={(e) => setFormData({ ...formData, cargoName: e.target.value })}
                              placeholder="Описание груза"
                              className="bg-white border-slate-300"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700">Порт</Label>
                            <Select value={formData.portId} onValueChange={(value) => setFormData({ ...formData, portId: value })}>
                              <SelectTrigger className="bg-white border-slate-300">
                                <SelectValue placeholder="Выберите порт" />
                              </SelectTrigger>
                              <SelectContent className="bg-white shadow-xl">
                                {ports?.map((p: any) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-slate-700">Грузоотправитель</Label>
                            <Input
                              value={formData.shipper}
                              onChange={(e) => setFormData({ ...formData, shipper: e.target.value })}
                              placeholder="Наименование грузоотправителя"
                              className="bg-white border-slate-300"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700">Грузополучатель</Label>
                            <Input
                              value={formData.consignee}
                              onChange={(e) => setFormData({ ...formData, consignee: e.target.value })}
                              placeholder="Наименование грузополучателя"
                              className="bg-white border-slate-300"
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-slate-700">Примечания к грузу</Label>
                          <Textarea
                            value={formData.cargoNotes}
                            onChange={(e) => setFormData({ ...formData, cargoNotes: e.target.value })}
                            placeholder="Дополнительная информация о грузе..."
                            className="bg-white border-slate-300 min-h-[80px]"
                          />
                        </div>

                        {/* ===== Секция "Для тентов" ===== */}
                        <Collapsible open={tentFormOpen} onOpenChange={setTentFormOpen} className="mt-4">
                            <Card className="border-l-4 border-l-amber-500 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
                              <CollapsibleTrigger asChild>
                                <CardHeader className="pb-2 cursor-pointer hover:from-amber-100/50 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <CardTitle className="text-base text-amber-800 flex items-center gap-2">
                                      <Truck className="w-5 h-5 text-amber-600" />
                                      Данные для тентов
                                    </CardTitle>
                                    <ChevronDown className={cn("w-5 h-5 text-amber-600 transition-transform", tentFormOpen && "rotate-180")} />
                                  </div>
                                  <CardDescription className="text-amber-700/70 text-xs">
                                    Дополнительная информация для перевозки тентовым транспортом
                                  </CardDescription>
                                </CardHeader>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <CardContent className="space-y-4 pt-2">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Дата заявки — Calendar Date Picker */}
                                    <div>
                                      <Label className="text-slate-700">Дата заявки</Label>
                                      <Popover open={tentOrderDateOpen} onOpenChange={setTentOrderDateOpen}>
                                        <PopoverTrigger asChild>
                                          <Button variant="outline" className={cn(
                                            "w-full justify-start text-left font-normal bg-white border-slate-300 h-9",
                                            !tentInfo?.orderDate && "text-muted-foreground"
                                          )}>
                                            <CalendarDays className="mr-2 h-4 w-4" />
                                            {tentInfo?.orderDate
                                              ? format(parseISO(tentInfo.orderDate), "dd.MM.yyyy", { locale: ru })
                                              : "Выберите дату"}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                          <Calendar
                                            mode="single"
                                            selected={tentInfo?.orderDate ? parseISO(tentInfo.orderDate) : undefined}
                                            onSelect={(date: Date | undefined) => {
                                              setTentInfo(prev => prev ? ({
                                                ...prev,
                                                orderDate: date ? format(date, "yyyy-MM-dd") : null,
                                              }) : {
                                                id: "", orderId: "", orderDate: date ? format(date, "yyyy-MM-dd") : null,
                                                orderNumber: null, deliveryAddress: null, deliveryDateTime: null,
                                                carrierInn: null, carrierName: null, driverName: null,
                                                driverPassport: null, vehicleBrand: null, tractorNumber: null,
                                                trailerNumber: null, ownershipType: null,
                                              });
                                              setTentOrderDateOpen(false);
                                            }}
                                            initialFocus
                                          />
                                        </PopoverContent>
                                      </Popover>
                                    </div>

                                    {/* Номер заявки */}
                                    <div>
                                      <Label className="text-slate-700">Номер заявки</Label>
                                      <Input
                                        value={tentInfo?.orderNumber || ""}
                                        onChange={(e) => setTentInfo(prev => prev ? { ...prev, orderNumber: e.target.value } : prev)}
                                        placeholder="Номер заявки"
                                        className="bg-white border-slate-300 h-9"
                                      />
                                    </div>

                                    {/* Дата и время доставки — datetime-local picker */}
                                    <div>
                                      <Label className="text-slate-700">Дата и время доставки</Label>
                                      <Input
                                        type="datetime-local"
                                        value={tentInfo?.deliveryDateTime || ""}
                                        onChange={(e) => setTentInfo(prev => prev ? { ...prev, deliveryDateTime: e.target.value } : prev)}
                                        className="bg-white border-slate-300 h-9"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <Label className="text-slate-700">Адрес доставки</Label>
                                    <Input
                                      value={tentInfo?.deliveryAddress || ""}
                                      onChange={(e) => setTentInfo(prev => prev ? { ...prev, deliveryAddress: e.target.value } : prev)}
                                      placeholder="Полный адрес доставки"
                                      className="bg-white border-slate-300 h-9"
                                    />
                                  </div>

                                  {/* ИНН перевозчика + автозаполнение */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                      <Label className="text-slate-700">ИНН перевозчика</Label>
                                      <div className="flex gap-2">
                                        <Input
                                          value={tentInfo?.carrierInn || ""}
                                          onChange={(e) => setTentInfo(prev => prev ? { ...prev, carrierInn: e.target.value } : prev)}
                                          placeholder="Введите ИНН (10 или 12 цифр)"
                                          className="bg-white border-slate-300 h-9"
                                        />
                                        <Button
                                          type="button"
                                          onClick={handleTentInnLookup}
                                          disabled={tentInnLookupLoading || !(tentInfo?.carrierInn?.replace(/\D/g, "").length === 10 || tentInfo?.carrierInn?.replace(/\D/g, "").length === 12)}
                                          className="shrink-0 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-9"
                                        >
                                          {tentInnLookupLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                          ) : (
                                            <Search className="w-4 h-4" />
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="text-slate-700">Перевозчик</Label>
                                      <Input
                                        value={tentInfo?.carrierName || ""}
                                        onChange={(e) => setTentInfo(prev => prev ? { ...prev, carrierName: e.target.value } : prev)}
                                        placeholder="Автозаполнение по ИНН или вручную"
                                        className="bg-white border-slate-300 h-9"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-slate-700">Форма собственности</Label>
                                      <Select
                                        value={tentInfo?.ownershipType || ""}
                                        onValueChange={(val) => setTentInfo(prev => prev ? { ...prev, ownershipType: val } : prev)}
                                      >
                                        <SelectTrigger className="bg-white border-slate-300 h-9">
                                          <SelectValue placeholder="Выберите" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white shadow-xl">
                                          <SelectItem value="OWN">Собственная</SelectItem>
                                          <SelectItem value="LEASED">Аренда</SelectItem>
                                          <SelectItem value="CONTRACTOR">Подрядчик</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-slate-700">ФИО водителя</Label>
                                      <Input
                                        value={tentInfo?.driverName || ""}
                                        onChange={(e) => setTentInfo(prev => prev ? { ...prev, driverName: e.target.value } : prev)}
                                        placeholder="ФИО водителя"
                                        className="bg-white border-slate-300 h-9"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-slate-700">Паспорт водителя</Label>
                                      <Input
                                        value={tentInfo?.driverPassport || ""}
                                        onChange={(e) => setTentInfo(prev => prev ? { ...prev, driverPassport: e.target.value } : prev)}
                                        placeholder="Серия и номер паспорта"
                                        className="bg-white border-slate-300 h-9"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                      <Label className="text-slate-700">Марка ТС</Label>
                                      <Input
                                        value={tentInfo?.vehicleBrand || ""}
                                        onChange={(e) => setTentInfo(prev => prev ? { ...prev, vehicleBrand: e.target.value } : prev)}
                                        placeholder="Марка транспортного средства"
                                        className="bg-white border-slate-300 h-9"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-slate-700">Госномер тягача</Label>
                                      <Input
                                        value={tentInfo?.tractorNumber || ""}
                                        onChange={(e) => setTentInfo(prev => prev ? { ...prev, tractorNumber: e.target.value } : prev)}
                                        placeholder="А000АА 00"
                                        className="bg-white border-slate-300 h-9"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-slate-700">Госномер прицепа</Label>
                                      <Input
                                        value={tentInfo?.trailerNumber || ""}
                                        onChange={(e) => setTentInfo(prev => prev ? { ...prev, trailerNumber: e.target.value } : prev)}
                                        placeholder="А000АА 00"
                                        className="bg-white border-slate-300 h-9"
                                      />
                                    </div>
                                  </div>

                                  {/* Кнопка сохранения */}
                                  <div className="flex justify-end pt-2 border-t border-amber-200/50">
                                    <Button
                                      type="button"
                                      onClick={() => editingOrder && saveTentInfo(editingOrder.id)}
                                      disabled={tentInfoSaving || !editingOrder}
                                      className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                                    >
                                      {tentInfoSaving ? (
                                        <>
                                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                          Сохранение...
                                        </>
                                      ) : (
                                        <>
                                          <Save className="w-4 h-4 mr-2" />
                                          Сохранить данные
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Блок Финансов */}
                  <TabsContent value="finance" className="mt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* По клиенту */}
                      <Card className="border-l-4 border-l-blue-500 shadow-lg bg-white">
                        <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-indigo-50">
                          <CardTitle className="text-base text-slate-800">По заказчику</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-slate-700">Ставка заказчика (₽)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={formData.clientRate}
                                onChange={(e) => setFormData({ ...formData, clientRate: e.target.value })}
                                placeholder="0.00"
                                disabled={editingOrder && !canEditClientFields}
                                className="bg-white border-slate-300"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-700">НДС заказчика</Label>
                              <Select value={formData.clientRateVat} onValueChange={(value) => setFormData({ ...formData, clientRateVat: value })}>
                                <SelectTrigger className="bg-white border-slate-300">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white shadow-xl">
                                  {vatOptions.client.map((v) => (
                                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <Label className="text-slate-700">KPI (вознаграждение клиента)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.kpi}
                              onChange={(e) => setFormData({ ...formData, kpi: e.target.value })}
                              placeholder="0.00"
                              className="bg-white border-slate-300"
                            />
                          </div>

                          {/* Дополнительные расходы клиента */}
                          <div className="pt-4 border-t border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                              <Label className="text-slate-700 font-medium">Дополнительные расходы</Label>
                              <Button type="button" variant="outline" size="sm" onClick={addClientExpense} className="bg-white">
                                <Plus className="w-4 h-4 mr-1" />
                                Добавить расход
                              </Button>
                            </div>
                            {clientExpenses.filter(e => !e._deleted).length > 0 && (
                              <div className="space-y-2">
                                {clientExpenses.filter(e => !e._deleted).map((expense, index) => {
                                  // Находим оригинальный индекс в массиве для правильного обновления
                                  const originalIndex = clientExpenses.findIndex(e => e.id === expense.id);
                                  return (
                                  <div key={expense.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                                    <Input
                                      value={expense.description || ""}
                                      onChange={(e) => updateExpense('CLIENT', originalIndex, 'description', e.target.value)}
                                      placeholder="Описание"
                                      className="flex-1 bg-white border-slate-300 h-8"
                                    />
                                    <Input
                                      type="number"
                                      value={expense.amount}
                                      onChange={(e) => updateExpense('CLIENT', originalIndex, 'amount', parseFloat(e.target.value) || 0)}
                                      placeholder="Сумма"
                                      className="w-24 bg-white border-slate-300 h-8"
                                    />
                                    <span className="w-28 text-xs text-muted-foreground text-center px-2 py-1 bg-slate-100 rounded">
                                      {getVatLabel(formData.clientRateVat)}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500"
                                      onClick={() => removeExpense('CLIENT', originalIndex)}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* По перевозчику */}
                      <Card className="border-l-4 border-l-green-500 shadow-lg bg-white">
                        <CardHeader className="pb-3 bg-gradient-to-r from-green-50 to-emerald-50">
                          <CardTitle className="text-base text-slate-800">По перевозчику</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-slate-700">Ставка перевозчика (₽)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={formData.carrierRate}
                                onChange={(e) => setFormData({ ...formData, carrierRate: e.target.value })}
                                placeholder="0.00"
                                className="bg-white border-slate-300"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-700">НДС перевозчика</Label>
                              <Select value={formData.carrierRateVat} onValueChange={(value) => setFormData({ ...formData, carrierRateVat: value })}>
                                <SelectTrigger className="bg-white border-slate-300">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white shadow-xl">
                                  {vatOptions.carrier.map((v) => (
                                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <Label className="text-slate-700">Срок оплаты (дней)</Label>
                            <Input
                              type="number"
                              min={isLogisticsManager ? 7 : undefined}
                              value={formData.carrierPaymentDays}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (isLogisticsManager && val !== "" && parseInt(val) < 7) {
                                  setFormData({ ...formData, carrierPaymentDays: "7" });
                                } else {
                                  setFormData({ ...formData, carrierPaymentDays: val });
                                }
                              }}
                              placeholder="12"
                              readOnly={!!(editingOrder && editingOrder.status !== "NEW" && !isAdmin)}
                              disabled={!!(editingOrder && editingOrder.status !== "NEW" && !isAdmin)}
                              className={cn("bg-white border-slate-300", editingOrder && editingOrder.status !== "NEW" && !isAdmin && "opacity-60")}
                            />
                            {isLogisticsManager && (
                              <p className="text-xs text-amber-600 mt-1">Минимум 7 дней</p>
                            )}
                            {editingOrder && editingOrder.status !== "NEW" && isAdmin && (
                              <p className="text-xs text-amber-600 mt-1">Изменение срока оплаты администратором</p>
                            )}
                            <p className="text-xs text-slate-400 mt-1">Менеджер устанавливает срок. После смены статуса поле доступно только администратору.</p>
                          </div>

                          {/* Фактический срок оплаты */}
                          <div>
                            <Label className="text-slate-700">Фактический срок оплаты</Label>
                            <div className="h-9 flex items-center px-3 rounded-md border bg-slate-50 text-sm font-medium mt-1">
                              {actualPaymentDays || formData.carrierPaymentDays || "-"} дней
                            </div>
                            {(editingOrder as any)?.branch?.documentGraceDays !== null && (editingOrder as any)?.branch?.documentGraceDays !== undefined && (
                              <p className="text-xs text-slate-400 mt-1">
                                Срок + {parseInt(formData.carrierPaymentDays) || 0} дн. (свободный: {(editingOrder as any).branch.documentGraceDays} дн.)
                              </p>
                            )}
                          </div>

                          {/* Предоплата перевозчику */}
                          <div className="border rounded-lg p-3 bg-slate-50">
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">Предоплата перевозчику</h4>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <Label className="text-xs text-slate-500">Сумма</Label>
                                <Input type="number" value={formData.carrierPrepayment} onChange={e => setFormData(p => ({...p, carrierPrepayment: e.target.value}))} placeholder="0" className="bg-white border-slate-300 h-9" />
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500">Дата оплаты</Label>
                                <Input type="date" value={formData.carrierPrepaymentDate} onChange={e => setFormData(p => ({...p, carrierPrepaymentDate: e.target.value}))} className="bg-white border-slate-300 h-9" />
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500">% от ставки</Label>
                                <div className="h-9 flex items-center px-3 rounded-md border bg-white text-sm">
                                  {formData.carrierRate && formData.carrierPrepayment 
                                    ? ((parseFloat(formData.carrierPrepayment) / parseFloat(formData.carrierRate)) * 100).toFixed(1) + '%' 
                                    : '0%'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Взаимозачёт перевозчику */}
                          <div className="border rounded-lg p-3 bg-slate-50">
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">Взаимозачёт перевозчику</h4>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <Label className="text-xs text-slate-500">Сумма</Label>
                                <Input type="number" value={formData.carrierOffsetAmount} onChange={e => setFormData(p => ({...p, carrierOffsetAmount: e.target.value}))} placeholder="0" className="bg-white border-slate-300 h-9" />
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500">Описание</Label>
                                <Input value={formData.carrierOffsetDescription} onChange={e => setFormData(p => ({...p, carrierOffsetDescription: e.target.value}))} placeholder="Описание взаимозачёта" className="bg-white border-slate-300 h-9" />
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500">% от ставки</Label>
                                <div className="h-9 flex items-center px-3 rounded-md border bg-white text-sm">
                                  {formData.carrierRate && formData.carrierOffsetAmount 
                                    ? ((parseFloat(formData.carrierOffsetAmount) / parseFloat(formData.carrierRate)) * 100).toFixed(1) + '%' 
                                    : '0%'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Дополнительные расходы перевозчика */}
                          <div className="pt-4 border-t border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                              <Label className="text-slate-700 font-medium">Дополнительные расходы</Label>
                              <Button type="button" variant="outline" size="sm" onClick={addCarrierExpense} className="bg-white">
                                <Plus className="w-4 h-4 mr-1" />
                                Добавить расход
                              </Button>
                            </div>
                            {carrierExpenses.filter(e => !e._deleted).length > 0 && (
                              <div className="space-y-2">
                                {carrierExpenses.filter(e => !e._deleted).map((expense, index) => {
                                  // Находим оригинальный индекс в массиве для правильного обновления
                                  const originalIndex = carrierExpenses.findIndex(e => e.id === expense.id);
                                  return (
                                  <div key={expense.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                                    <SearchableSelect
                                      options={(carrierContractors || []).map((c: any) => ({
                                        value: c.id,
                                        label: c.name,
                                        secondary: c.inn || undefined,
                                      }))}
                                      value={expense.contractorId || ""}
                                      onValueChange={(value) => updateExpense('CARRIER', originalIndex, 'contractorId', value)}
                                      placeholder="Контрагент"
                                      searchPlaceholder="Поиск контрагента..."
                                      emptyMessage="Контрагент не найден"
                                      className="w-40 h-8"
                                    />
                                    <Input
                                      value={expense.description || ""}
                                      onChange={(e) => updateExpense('CARRIER', originalIndex, 'description', e.target.value)}
                                      placeholder="Описание"
                                      className="flex-1 bg-white border-slate-300 h-8"
                                    />
                                    <Input
                                      type="number"
                                      value={expense.amount}
                                      onChange={(e) => updateExpense('CARRIER', originalIndex, 'amount', parseFloat(e.target.value) || 0)}
                                      placeholder="Сумма"
                                      className="w-24 bg-white border-slate-300 h-8"
                                    />
                                    <Select
                                      value={expense.vatType}
                                      onValueChange={(value) => updateExpense('CARRIER', originalIndex, 'vatType', value)}
                                    >
                                      <SelectTrigger className="w-28 bg-white border-slate-300 h-8">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="bg-white shadow-xl">
                                        {vatOptions.carrier.map((v) => (
                                          <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500"
                                      onClick={() => removeExpense('CARRIER', originalIndex)}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* Блок Оплаты */}
                  {hasSubmittedDocsStage && (
                  <TabsContent value="payment" className="mt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Оплата от клиента */}
                      <Card className="border-l-4 border-l-blue-500 shadow-lg bg-white">
                        <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-indigo-50">
                          <CardTitle className="text-base text-slate-800">Оплата от клиента</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          <div>
                            <Label className="text-slate-700">Предполагаемая дата оплаты</Label>
                            <Input
                              type="date"
                              value={formData.clientExpectedPaymentDate}
                              onChange={(e) => setFormData({ ...formData, clientExpectedPaymentDate: e.target.value })}
                              className="bg-white border-slate-300"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700">Фактическая дата оплаты</Label>
                            <Input
                              type="date"
                              value={formData.clientActualPaymentDate}
                              onChange={(e) => setFormData({ ...formData, clientActualPaymentDate: e.target.value })}
                              className="bg-white border-slate-300"
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Оплата перевозчику */}
                      <Card className="border-l-4 border-l-green-500 shadow-lg bg-white">
                        <CardHeader className="pb-3 bg-gradient-to-r from-green-50 to-emerald-50">
                          <CardTitle className="text-base text-slate-800">Оплата перевозчику</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          <div>
                            <Label className="text-slate-700">Предполагаемая дата оплаты (расчётная)</Label>
                            <Input
                              type="date"
                              value={carrierExpectedPaymentDate}
                              readOnly
                              disabled
                              className="bg-slate-50 border-slate-200"
                            />
                            <p className="text-xs text-slate-400 mt-1">Дата сдачи документов + Фактический срок оплаты</p>
                          </div>
                          <div>
                            <Label className="text-slate-700">Фактическая дата оплаты</Label>
                            <Input
                              type="date"
                              value={formData.carrierActualPaymentDate}
                              onChange={(e) => setFormData({ ...formData, carrierActualPaymentDate: e.target.value })}
                              className="bg-white border-slate-300"
                            />
                            {formData.carrierActualPaymentDate && (
                              <p className="text-xs text-green-600 mt-1 font-medium">
                                ✓ При сохранении статус будет изменён на «Оплачено перевозчику»
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                  )}

                  {/* Блок Мониторинга */}
                  <TabsContent value="monitoring" className="mt-0 space-y-4">
                    <Card className="border-l-4 border-l-cyan-500 shadow-lg bg-white">
                      <CardHeader className="pb-3 bg-gradient-to-r from-cyan-50 to-sky-50">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                          <Eye className="w-5 h-5 text-cyan-600" />
                          Мониторинг заявки
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        {/* Текущий статус (только чтение) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label className="text-slate-700">{isAdmin ? "Статус заявки" : "Статус заявки (автоматически)"}</Label>
                            <div className="flex items-center gap-2 mt-1">
                              {isAdmin ? (
                                <Select
                                  value={formData.status}
                                  onValueChange={(val) => setFormData({ ...formData, status: val })}
                                >
                                  <SelectTrigger className="w-full bg-white border-slate-300 h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(statusConfig).map(([key, cfg]) => (
                                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <>
                                  <Badge className={cn(statusConfig[formData.status as keyof typeof statusConfig]?.color || "bg-gray-500 text-white", "font-medium shadow-sm px-3 py-1")}>
                                    {statusConfig[formData.status as keyof typeof statusConfig]?.label || formData.status}
                                  </Badge>
                                  <span className="text-xs text-slate-500">Обновляется по этапам</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div>
                            <Label className="text-slate-700">Дата сдачи порожнего</Label>
                            <Input
                              type="date"
                              value={emptyReturnDateFromStage ? (() => {
                                try {
                                  const d = new Date(emptyReturnDateFromStage);
                                  if (isNaN(d.getTime())) return "";
                                  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
                                } catch { return ""; }
                              })() : ""}
                              readOnly
                              disabled
                              className="bg-slate-50 border-slate-200 text-slate-600"
                            />
                            <p className="text-xs text-slate-400 mt-1">Из этапа «Сдал порожний»</p>
                          </div>
                          <div>
                            <Label className="text-slate-700">Куда сдали порожний</Label>
                            <Input
                              value={formData.emptyContainerReturnLocation}
                              onChange={(e) => setFormData({ ...formData, emptyContainerReturnLocation: e.target.value })}
                              placeholder="Укажите место сдачи порожнего..."
                              className="bg-white border-slate-300"
                            />
                          </div>
                        </div>

                        {/* Добавление этапа */}
                        <div className="pt-4 border-t border-slate-200">
                          <Label className="text-slate-700 font-medium flex items-center gap-2 mb-3">
                            <MapPin className="w-4 h-4" />
                            Добавить этап перевозки
                          </Label>
                          
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-lg border border-slate-200">
                            <div>
                              <Label className="text-xs text-slate-600">Этап</Label>
                              <Select 
                                value={newStage.stageType} 
                                onValueChange={(value) => setNewStage({ ...newStage, stageType: value, showDescription: value === "PROBLEM" })}
                              >
                                <SelectTrigger className="bg-white border-slate-300">
                                  <SelectValue placeholder="Выберите этап" />
                                </SelectTrigger>
                                <SelectContent className="bg-white shadow-xl">
                                  {transportStagesList.map((stage) => (
                                    <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs text-slate-600">Дата и время этапа</Label>
                              <Input
                                type="datetime-local"
                                value={newStage.stageDatetime}
                                onChange={(e) => setNewStage({ ...newStage, stageDatetime: e.target.value })}
                                className="bg-white border-slate-300"
                              />
                            </div>
                            {newStage.showDescription && (
                              <div className="md:col-span-2">
                                <Label className="text-xs text-slate-600">Описание проблемы</Label>
                                <Input
                                  value={newStage.description}
                                  onChange={(e) => setNewStage({ ...newStage, description: e.target.value })}
                                  placeholder="Опишите проблему..."
                                  className="bg-white border-slate-300"
                                />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex justify-end mt-3">
                            <Button 
                              type="button" 
                              onClick={handleAddStage}
                              disabled={!newStage.stageType || !newStage.stageDatetime || saveStageMutation.isPending}
                              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                            >
                              {saveStageMutation.isPending ? "Запись..." : "Записать"}
                            </Button>
                          </div>
                        </div>

                        {/* Записанные этапы */}
                        <div className="pt-4 border-t border-slate-200">
                          <Label className="text-slate-700 font-medium flex items-center gap-2 mb-3">
                            <CheckCircle className="w-4 h-4" />
                            Записанные этапы
                          </Label>
                          
                          {editingOrder ? (
                            transportStages.length > 0 ? (
                              <div className="space-y-2">
                                {transportStages.map((stage, index) => {
                                  const stageInfo = transportStagesList.find(s => s.value === stage.stageType);
                                  const isEditing = editingStageId === stage.id;
                                  
                                  return (
                                    <div 
                                      key={stage.id} 
                                      className="p-3 bg-gradient-to-r from-white to-slate-50 rounded-lg border border-slate-200 shadow-sm"
                                    >
                                      {isEditing ? (
                                        // Режим редактирования
                                        <div className="space-y-3">
                                          <div className="flex items-center gap-2">
                                            <Badge className="bg-cyan-500 text-white">{stageInfo?.label || stage.stageType}</Badge>
                                            <span className="text-xs text-slate-500">Редактирование</span>
                                          </div>
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                            <div>
                                              <Label className="text-xs text-slate-600">Дата и время этапа</Label>
                                              <Input
                                                type="datetime-local"
                                                value={editStageData.stageDatetime}
                                                onChange={(e) => setEditStageData({ ...editStageData, stageDatetime: e.target.value })}
                                                className="bg-white border-slate-300 h-9"
                                              />
                                            </div>
                                            {stage.stageType === "PROBLEM" && (
                                              <div className="md:col-span-2">
                                                <Label className="text-xs text-slate-600">Описание проблемы</Label>
                                                <Input
                                                  value={editStageData.description || ""}
                                                  onChange={(e) => setEditStageData({ ...editStageData, description: e.target.value })}
                                                  className="bg-white border-slate-300 h-9"
                                                />
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex gap-2">
                                            <Button 
                                              type="button" 
                                              size="sm" 
                                              onClick={() => handleSaveEditStage(stage.id)}
                                              disabled={saveStageMutation.isPending}
                                              className="bg-green-600 hover:bg-green-700 text-white"
                                            >
                                              Сохранить
                                            </Button>
                                            <Button 
                                              type="button" 
                                              size="sm" 
                                              variant="outline"
                                              onClick={() => setEditingStageId(null)}
                                              className="bg-white"
                                            >
                                              Отмена
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        // Режим просмотра
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-medium">
                                                ✓
                                              </div>
                                              <Badge className="bg-cyan-500 text-white">{stageInfo?.label || stage.stageType}</Badge>
                                            </div>
                                            <div className="mt-2 text-sm text-slate-700 space-y-1">
                                              <div className="flex items-center gap-2">
                                                <Clock className="w-3 h-3 text-slate-400" />
                                                <span>Время этапа: {stage.stageDatetime ? formatDateTime(stage.stageDatetime) : "-"}</span>
                                              </div>
                                              <div className="text-xs text-slate-500">
                                                Записал: {stage.recordedByUser?.name || "Система"} • {formatDateTime(stage.recordedAt)}
                                              </div>
                                              {stage.editedAt && stage.editedByUser && (
                                                <div className="text-xs text-amber-600">
                                                  Отредактировал: {stage.editedByUser.name} • {formatDateTime(stage.editedAt)}
                                                </div>
                                              )}
                                              {stage.description && (
                                                <div className="text-xs text-red-600 mt-1 p-2 bg-red-50 rounded">
                                                  <strong>Проблема:</strong> {stage.description}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => {
                                              setEditingStageId(stage.id);
                                              setEditStageData({
                                                stageDatetime: toLocalDatetimeInput(stage.stageDatetime),
                                                description: stage.description || ""
                                              });
                                            }}
                                            className="text-slate-600 hover:text-blue-600"
                                          >
                                            <Edit className="w-4 h-4 mr-1" />
                                            Редактировать
                                          </Button>
                                          {isAdmin && (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                if (confirm("Удалить этап? Статус заявки будет пересчитан.")) {
                                                  deleteStageMutation.mutate(stage.id);
                                                }
                                              }}
                                              disabled={deleteStageMutation.isPending}
                                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            >
                                              <Trash2 className="w-4 h-4 mr-1" />
                                              Удалить
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-slate-500 border-2 border-dashed border-slate-200 rounded-lg">
                                <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                Этапы не записаны
                              </div>
                            )
                          ) : (
                            <div className="text-center py-4 text-slate-500 bg-slate-50 rounded-lg">
                              <Eye className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                              Сначала создайте заявку для отслеживания этапов
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Блок История изменений */}
                  <TabsContent value="history" className="mt-0 space-y-4">
                    <Card className="border-l-4 border-l-slate-500 shadow-lg bg-white">
                      <CardHeader className="pb-3 bg-gradient-to-r from-slate-50 to-gray-50">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                          <History className="w-5 h-5 text-slate-600" />
                          История изменений
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          Все изменения полей заявки с указанием ответственного
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-4">
                        {editingOrder ? (
                          changeHistory && changeHistory.length > 0 ? (
                            <div className="space-y-2">
                              {changeHistory.map((item) => (
                                <div
                                  key={item.id}
                                  className="p-3 bg-gradient-to-r from-white to-slate-50 rounded-lg border border-slate-200 shadow-sm"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-slate-700">
                                          {item.fieldLabel}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1.5 text-sm flex-wrap">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-50 text-red-700 text-xs font-medium line-through opacity-70">
                                          {item.oldValue || "—"}
                                        </span>
                                        <span className="text-slate-400 text-xs">→</span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs font-medium">
                                          {item.newValue || "—"}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                        <div className="flex items-center gap-1">
                                          <div className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-medium">
                                            {(item.changedByUser?.name || "С")[0].toUpperCase()}
                                          </div>
                                          <span>{item.changedByUser?.name || "Система"}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Clock className="w-3 h-3" />
                                          <span>{formatDateTime(item.changedAt)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-200 rounded-lg">
                              <History className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                              <p className="text-sm font-medium">Изменений пока нет</p>
                              <p className="text-xs text-slate-400 mt-1">
                                При редактировании полей заявки здесь будет отображаться история изменений
                              </p>
                            </div>
                          )
                        ) : (
                          <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                            <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-sm">Сначала создайте или выберите заявку</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Блок Печать */}
                  <TabsContent value="print" className="mt-0 space-y-4">
                    <PrintTab order={effectiveOrderForPrint} />
                  </TabsContent>
                </div>
              </Tabs>

              <DialogFooter className="p-4 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 flex-shrink-0">
                {/* Маржинальность и рентабельность */}
                <div className="flex-1 mr-4">
                  {marginCalc.hasData && (() => {
                    const p = marginCalc.profitability;
                    const marginColor = p > 15
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : p > 10
                        ? 'bg-orange-50 border-orange-200 text-orange-700'
                        : p > 3
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-rose-100 border-rose-300 text-rose-900';
                    const marginIcon = marginCalc.margin > 0
                      ? <TrendingUp className="w-4 h-4" />
                      : marginCalc.margin < 0
                        ? <TrendingDown className="w-4 h-4" />
                        : <Calculator className="w-4 h-4" />;
                    return (
                      <div className="flex items-center gap-4">
                        <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border", marginColor)}>
                          {marginIcon}
                          <div className="flex flex-col leading-tight">
                            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">Маржа</span>
                            <span className="text-sm font-bold tabular-nums">
                              {marginCalc.margin.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₽
                            </span>
                          </div>
                        </div>
                        <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border", marginColor)}>
                          <Percent className="w-4 h-4" />
                          <div className="flex flex-col leading-tight">
                            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">Рентаб.</span>
                            <span className="text-sm font-bold tabular-nums">
                              {p.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {!editFromLink && (
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="bg-white">
                    Отмена
                  </Button>
                )}
                {!editFromLink && (
                <Button
                  type="button"
                  disabled={saveMutation.isPending}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg"
                  onClick={(e) => {
                    e.preventDefault();
                    saveAndCloseRef.current = true;
                    const form = (e.currentTarget.closest('form') as HTMLFormElement);
                    if (form) form.requestSubmit();
                  }}
                >
                  {saveMutation.isPending ? "Сохранение..." : "Сохранить и закрыть"}
                </Button>
                )}
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  variant="outline"
                  className="bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                >
                  Сохранить
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Диалог уведомления о блокировке заявки */}
        <Dialog open={isLocked} onOpenChange={(open) => {
          if (!open) {
            setIsLocked(false);
            setLockedByUser("");
            // Закрываем диалог заявки
            setDialogOpen(false);
          }
        }}>
          <DialogContent className="bg-white shadow-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <Lock className="w-5 h-5" />
                Заявка заблокирована
              </DialogTitle>
              <DialogDescription>
                {/* empty to avoid default */}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <UserCheck className="w-6 h-6 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Эту заявку сейчас редактирует:
                  </p>
                  <p className="text-base font-semibold text-amber-900 mt-1">
                    {lockedByUser}
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Вы не можете редактировать эту заявку, пока другой пользователь не завершит работу с ней.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsLocked(false);
                  setLockedByUser("");
                  setDialogOpen(false);
                }}>
                Закрыть
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Диалог удаления */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="bg-white shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-slate-800">Удалить заявку?</DialogTitle>
              <DialogDescription className="text-slate-600">
                Вы уверены, что хотите удалить заявку {orderToDelete?.orderNumber}?
                Это действие нельзя отменить.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="bg-white">Отмена</Button>
              <Button variant="destructive" onClick={() => orderToDelete && deleteMutation.mutate(orderToDelete.id)} disabled={deleteMutation.isPending} className="bg-red-600 hover:bg-red-700">
                Удалить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Диалог карточки перевозчика */}
        <CounterpartyEditDialog
          open={carrierCardOpen}
          onOpenChange={setCarrierCardOpen}
          counterpartyId={formData.carrierId || null}
          onSaveSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            refetchOrders();
          }}
        />

        {/* Диалог печати ТТН */}
        {ttnPrintOrderId && (
          <TTNPreviewDialog
            open={true}
            onOpenChange={(open) => { if (!open) setTtnPrintOrderId(null); }}
            order={ordersData?.orders?.find((o: any) => o.id === ttnPrintOrderId) || null}
          />
        )}

        {/* Диалог печати титульного листа */}
        {titlePrintOrderId && (
          <TitlePagePreviewDialog
            open={true}
            onOpenChange={(open) => { if (!open) setTitlePrintOrderId(null); }}
            order={ordersData?.orders?.find((o: any) => o.id === titlePrintOrderId) || null}
          />
        )}
        </div>
      </main>
    </div>
  );
}
