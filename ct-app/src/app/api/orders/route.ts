import { NextRequest, NextResponse } from "next/server";
import { getServerUser, hasPermission } from "@/lib/server-auth";
import { db, ensureMigrations } from "@/lib/db";
import { logAudit, extractIpAddress, extractUserAgent } from "@/lib/audit";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { ensureRussianWorkingDay } from "@/lib/russian-calendar";

// Заявки — всегда динамический роут (авторизация, фильтры по пользователю)
export const dynamic = "force-dynamic";

// Helper to parse date string with proper timezone handling
// Accepts datetime-local format (YYYY-MM-DDTHH:mm) and converts to UTC
const parseDateTime = (val: string | null | undefined): Date | null => {
  if (!val || val.trim() === "") return null;
  
  // If it's a datetime-local format (YYYY-MM-DDTHH:mm), treat it as local time
  if (val.includes('T') && !val.includes('Z') && !val.includes('+')) {
    // Create date as local time by appending 'Z' would be wrong
    // Instead, parse it and treat as local time
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Otherwise parse normally
  const date = new Date(val);
  return isNaN(date.getTime()) ? null : date;
};

// Helper to parse date-only string (YYYY-MM-DD)
const parseDateOnly = (val: string | null | undefined): Date | null => {
  if (!val || val.trim() === "") return null;
  // For date-only, create date at midnight UTC to avoid timezone shifts
  const date = new Date(val + 'T00:00:00Z');
  return isNaN(date.getTime()) ? null : date;
};

// Route point schema
const routePointSchema = z.object({
  id: z.string().optional(), // For existing points
  pointType: z.enum(["LOADING", "UNLOADING", "TRANSIT"]),
  pointOrder: z.number().int().min(0),
  datetime: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  cityFiasId: z.string().nullable().optional(),
  cityRegion: z.string().nullable().optional(),
  cityCountry: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  actualArrival: z.string().nullable().optional(),
  actualDeparture: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  _deleted: z.boolean().optional(), // Mark for deletion
});

// Expense schema
const expenseSchema = z.object({
  id: z.string().optional(), // For existing expenses
  contractorId: z.string().nullable().optional(),
  expenseType: z.enum(["CLIENT", "CARRIER"]),
  description: z.string().nullable().optional(),
  amount: z.number().min(0),
  vatType: z.string().default("NO_VAT"),
});

// Schema for creating/updating orders with all new fields
const orderSchema = z.object({
  // Order number (can be set manually by admin or logistics manager, nullable)
  orderNumber: z.string().max(50).nullable().optional(),
  
  // Client block
  clientId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  clientContractId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  
  // Carrier block
  carrierId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  carrierContractId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  driverId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  truckId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  trailerId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  
  // Route block
  transportMode: z.string().nullable().optional(), // GTD, VTT, MTT, EXPORT
  routePoints: z.array(routePointSchema).optional(),
  
  // Cargo block
  containerTypeId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  containerNumber: z.string().optional().nullable(),
  trailerType: z.enum(["CONTAINER_CARRIER", "TENT", "REFRIGERATOR", "LOWBOY"]).nullable().optional(),
  cargoWeight: z.number().min(0).nullable().optional(),
  dangerLevel: z.enum(["NOT_DANGEROUS", "DANGEROUS", "DANGEROUS_DIRECT"]).default("NOT_DANGEROUS").nullable().optional(),
  tareWeight: z.number().min(0).nullable().optional(),
  sealNumber: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  declarationNumber: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  packageCount: z.number().int().min(0).nullable().optional(),
  cargoName: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  consignee: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  shipper: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  portId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  cargoNotes: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  
  // Finance block
  clientRate: z.number().nullable().optional(),
  clientRateVat: z.string().default("NO_VAT"),
  carrierRate: z.number().nullable().optional(),
  carrierRateVat: z.string().default("NO_VAT"),
  carrierPaymentDays: z.number().int().nullable().optional(), // -1 означает "не указан"
  kpi: z.number().min(0).nullable().optional(),
  expenses: z.array(expenseSchema).optional(),
  
  // Monitoring block
  status: z.string().default("NEW"),
  emptyContainerReturnDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  emptyContainerReturnLocation: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  
  // Documents block
  documentSubmissionDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  
  // Notes
  notes: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  carrierNotes: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  
  // Manager assignment (admin only)
  assignedManagerId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  
  // Finance/Payment fields
  branchId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  carrierPrepayment: z.number().nullable().optional(),
  carrierPrepaymentDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  carrierOffset: z.number().nullable().optional(),
  carrierOffsetAmount: z.number().nullable().optional(),
  carrierOffsetDescription: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  clientExpectedPaymentDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  clientActualPaymentDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  carrierExpectedPaymentDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  carrierActualPaymentDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  
  // Legacy fields for backwards compatibility - stored as strings in DB
  loadingDatetime: z.string().nullable().optional(),
  loadingCity: z.string().optional(),
  loadingAddress: z.string().optional(),
  unloadingDatetime: z.string().nullable().optional(),
  unloadingCity: z.string().optional(),
  unloadingAddress: z.string().optional(),
});

// Generate unique order number with retry on collision
async function generateOrderNumber(): Promise<string> {
  const prefix = "ORD";
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  
  // Используем транзакцию для атомарного подсчёта и создания
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await db.order.count({
      where: {
        createdAt: {
          gte: startOfMonth,
        },
      },
    });
    
    const sequence = (count + 1).toString().padStart(4, "0");
    const orderNumber = `${prefix}-${year}${month}-${sequence}`;
    
    // Проверяем что номер ещё не занят (защита от race condition)
    const existing = await db.order.findUnique({
      where: { orderNumber },
      select: { id: true },
    });
    
    if (!existing) {
      return orderNumber;
    }
    
    // Номер уже занят — пробуем следующий
    console.warn(`[generateOrderNumber] Collision on ${orderNumber}, retry ${attempt + 1}`);
  }
  
  // Фоллбэк: использовать UUID-суффикс
  const fallback = `${prefix}-${year}${month}-${Date.now().toString(36).toUpperCase()}`;
  return fallback;
}

// Helper function for sorting
function getOrderBy(sortBy: string, sortOrder: string): any {
  const order = sortOrder === "asc" ? "asc" : "desc";
  
  switch (sortBy) {
    case "orderNumber":
      return { orderNumber: order };
    case "status":
      return { status: order };
    case "client":
      return { client: { name: order } };
    case "carrier":
      return { carrier: { name: order } };
    case "clientRate":
      return { clientRate: order };
    case "carrierRate":
      return { carrierRate: order };
    case "loadingDate":
      // Сортировка по loadingDatetime (legacy) — будет переопределена ниже
      // если есть routePoints с LOADING
      return { loadingDatetime: order };
    case "unloadingDate":
      return { unloadingDatetime: order };
    case "updatedAt":
      return { updatedAt: order };
    case "createdAt":
    default:
      return { createdAt: order };
  }
}

// GET - List orders with filtering
export async function GET(request: NextRequest) {
  try {
    await ensureMigrations();
    logger.log("[orders] GET request started");
    const user = await getServerUser(request);
    logger.log("[orders] User:", user?.id, user?.role);

    if (!user?.id) {
      logger.log("[orders] Unauthorized - no user");
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const canView = await hasPermission(user, "ORDERS", "canView");
    if (!canView) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const driverId = searchParams.get("driverId");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const assignedToMe = searchParams.get("assignedToMe") === "true";
    
    // Новые параметры сортировки и фильтрации
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const clientId = searchParams.get("clientId");
    const carrierId = searchParams.get("carrierId");
    const assignedManagerId = searchParams.get("assignedManagerId");
    const hasNoManager = searchParams.get("hasNoManager") === "true";
    const branchId = searchParams.get("branchId");
    const reviewFilter = searchParams.get("reviewFilter") === "true";
    const paymentIssueType = searchParams.get("paymentIssueType");
    const paymentIssueResolution = searchParams.get("paymentIssueResolution");
    const noOrderNumber = searchParams.get("noOrderNumber") === "true";
    const noLoadingDate = searchParams.get("noLoadingDate") === "true";

    const where: any = {};

    // Фильтрация по филиалу: не-админы видят только заявки своего филиала
    if (user.role !== "ADMIN") {
      // CLIENT users are filtered by client access (no branch filter)
      if (user.role === "CLIENT") {
        try {
          const clientAccess = await db.userClientAccess.findMany({
            where: { userId: user.id },
            select: { clientId: true },
          });
          if (clientAccess.length === 0) {
            // No access — return empty
            return NextResponse.json({ orders: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
          }
          where.clientId = { in: clientAccess.map(ca => ca.clientId) };
        } catch {
          // Table might not exist yet
          return NextResponse.json({ orders: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
        }
      } else {
        if (!user.branchId) {
          return NextResponse.json(
            { error: "У вас не назначен филиал. Обратитесь к администратору." },
            { status: 403 }
          );
        }
        where.branchId = user.branchId;
      }
    }

    // Фильтрация по закреплённому менеджеру для заявок на доработке (PROBLEM + reviewComment)
    // Не-админы видят только заявки, закреплённые за ними
    const reviewFilterParam = searchParams.get("reviewFilter") === "true";
    const statusParam = searchParams.get("status");
    if (reviewFilterParam && statusParam === "PROBLEM" && user.role !== "ADMIN") {
      where.assignedManagerId = user.id;
    }

    // Убрана жесткая фильтрация по ролям - права доступа управляются через систему разрешений
    // Администраторы и пользователи с правом canView(ORDERS) видят заявки согласно настройкам
    
    // Filter for assigned to me
    if (assignedToMe) {
      where.assignedManagerId = user.id;
    }

    // Multi-value filter support (comma-separated)
    if (status && status !== "ALL") {
      const statuses = status.split(',').filter(Boolean);
      if (statuses.length === 1) {
        where.status = statuses[0];
      } else if (statuses.length > 1) {
        where.status = { in: statuses };
      }
    }

    // Фильтр для доработки: PROBLEM с непустым reviewComment
    if (reviewFilter) {
      where.reviewComment = { not: null };
    }

    // Фильтр по типу проблемы с документами
    if (paymentIssueType) {
      where.paymentIssueType = paymentIssueType;
      
      // Менеджеры видят только свои заявки в проблемных документах
      if (user.role !== "ADMIN") {
        where.assignedManagerId = user.id;
      }
    }

    // Фильтр по статусу решения проблемы
    if (paymentIssueResolution) {
      where.paymentIssueResolution = paymentIssueResolution;
    }

    if (driverId && driverId !== "ALL") {
      where.driverId = driverId;
    }

    // Multi-value filters
    if (clientId && clientId !== "ALL") {
      const ids = clientId.split(',').filter(Boolean);
      if (ids.length === 1) {
        where.clientId = ids[0];
      } else if (ids.length > 1) {
        where.clientId = { in: ids };
      }
    }
    
    if (carrierId && carrierId !== "ALL") {
      const ids = carrierId.split(',').filter(Boolean);
      if (ids.length === 1) {
        where.carrierId = ids[0];
      } else if (ids.length > 1) {
        where.carrierId = { in: ids };
      }
    }
    
    if (assignedManagerId && assignedManagerId !== "ALL") {
      const ids = assignedManagerId.split(',').filter(Boolean);
      if (ids.length === 1) {
        // Special case: NO_MANAGER means null
        where.assignedManagerId = ids[0] === "NO_MANAGER" ? null : ids[0];
      } else if (ids.length > 1) {
        // Build array, replacing NO_MANAGER with null
        const managerIds = ids.filter(id => id !== "NO_MANAGER");
        if (ids.includes("NO_MANAGER")) {
          if (managerIds.length > 0) {
            where.OR = [
              { assignedManagerId: { in: managerIds } },
              { assignedManagerId: null },
            ];
          } else {
            where.assignedManagerId = null;
          }
        } else {
          where.assignedManagerId = { in: managerIds };
        }
      }
    }
    
    if (hasNoManager) {
      where.assignedManagerId = null;
    }

    // Фильтр: заявки без номера
    if (noOrderNumber) {
      where.orderNumber = null;
    }

    // Фильтр: заявки без даты загрузки (нет RoutePoint LOADING с datetime)
    if (noLoadingDate) {
      where.routePoints = {
        ...where.routePoints,
        none: {
          pointType: "LOADING",
          datetime: { not: null },
        },
      };
    }

    if (branchId && branchId !== "ALL" && user.role === "ADMIN") {
      const ids = branchId.split(',').filter(Boolean);
      if (ids.length === 1) {
        where.branchId = ids[0];
      } else if (ids.length > 1) {
        where.branchId = { in: ids };
      }
    }

    if (search) {
      where.AND = [
        ...where.AND || [],
        { OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          { containerNumber: { contains: search, mode: "insensitive" } },
          { cargoName: { contains: search, mode: "insensitive" } },
          { consignee: { contains: search, mode: "insensitive" } },
          { shipper: { contains: search, mode: "insensitive" } },
          { driver: { fullName: { contains: search, mode: "insensitive" } } },
        ]},
      ];
    }

    // Date field filtering — supports configurable date field
    const dateField = searchParams.get("dateField") || "createdAt";
    // Map frontend field names to Prisma field names
    const dateFieldMap: Record<string, string> = {
      createdAt: "createdAt",
      loadingDate: "loadingDatetime",
      unloadingDate: "unloadingDatetime",
      carrierActualPaymentDate: "carrierActualPaymentDate",
      documentSubmissionDate: "documentSubmissionDate",
      clientActualPaymentDate: "clientActualPaymentDate",
      emptyContainerReturnDate: "emptyContainerReturnDate",
    };
    const prismaDateField = dateFieldMap[dateField] || "createdAt";

    // loadingDatetime and unloadingDatetime are stored as String in DB,
    // so we must use string comparison instead of Date objects
    const stringDateFields = ["loadingDatetime", "unloadingDatetime"];

    // Для loadingDate/unloadingDate — фильтруем по RoutePoint (вкладка Маршрут),
    // а не по legacy полям Order.loadingDatetime/unloadingDatetime
    const isRoutePointDateField = dateField === "loadingDate" || dateField === "unloadingDate";
    const rpPointType = dateField === "loadingDate" ? "LOADING" : dateField === "unloadingDate" ? "UNLOADING" : null;

    if (dateFrom || dateTo) {
      if (isRoutePointDateField) {
        // Фильтрация по дате из RoutePoint (первая точка загрузки/выгрузки во вкладке Маршрут)
        const rpFilter: any = { pointType: rpPointType };
        if (dateFrom) {
          const d = new Date(dateFrom);
          if (!isNaN(d.getTime())) {
            rpFilter.datetime = { ...rpFilter.datetime, gte: d.toISOString() };
          }
        }
        if (dateTo) {
          const d = new Date(dateTo);
          d.setHours(23, 59, 59, 999);
          if (!isNaN(d.getTime())) {
            rpFilter.datetime = { ...rpFilter.datetime, lte: d.toISOString() };
          }
        }
        where.routePoints = { some: rpFilter };
      } else if (stringDateFields.includes(prismaDateField)) {
        // For string date fields, compare as ISO strings
        if (dateFrom) {
          const d = new Date(dateFrom);
          if (!isNaN(d.getTime())) {
            where[prismaDateField] = { ...where[prismaDateField], gte: d.toISOString() };
          }
        }
        if (dateTo) {
          const d = new Date(dateTo);
          d.setHours(23, 59, 59, 999);
          if (!isNaN(d.getTime())) {
            where[prismaDateField] = { ...where[prismaDateField], lte: d.toISOString() };
          }
        }
      } else {
        // For DateTime fields, use Date objects
        if (!where[prismaDateField]) where[prismaDateField] = {};
        if (dateFrom) {
          where[prismaDateField].gte = new Date(dateFrom);
        }
        if (dateTo) {
          const d = new Date(dateTo);
          d.setHours(23, 59, 59, 999);
          where[prismaDateField].lte = d;
        }
      }
    }

    logger.log("[orders] Query where:", JSON.stringify(where));
    
    let total;
    try {
      // count() не поддерживает relation filters — убираем driver из where для подсчёта
      const countWhere = JSON.parse(JSON.stringify(where));
      if (countWhere?.AND) {
        const andArr = Array.isArray(countWhere.AND) ? countWhere.AND : [countWhere.AND];
        countWhere.AND = andArr.filter((cond: any) => !cond?.OR || !cond.OR.some((o: any) => o.driver));
        if (countWhere.AND.length === 0) delete countWhere.AND;
      }
      total = await db.order.count({ where: countWhere });
      logger.log("[orders] Count:", total);
    } catch (countError: any) {
      console.error("[orders] Count error:", countError);
      return NextResponse.json(
        { error: "Ошибка подсчета заказов", details: countError?.message },
        { status: 500 }
      );
    }

    let orders;
    try {
      // Полный запрос с всеми связями
      if (sortBy === "loadingDate" || sortBy === "unloadingDate") {
        // Оптимизация: двухшаговая загрузка вместо загрузки ВСЕХ заявок
        // Шаг 1: Получаем только ID заявок (легковесный запрос)
        const allOrderIds = await db.order.findMany({
          where,
          select: { id: true },
        });

        // Шаг 2: Получаем даты из RoutePoint для этих заявок
        const pointType = sortBy === "loadingDate" ? "LOADING" : "UNLOADING";
        const orderIds = allOrderIds.map(o => o.id);

        const routeDates = orderIds.length > 0
          ? await db.routePoint.findMany({
              where: {
                orderId: { in: orderIds },
                pointType: pointType,
              },
              select: { orderId: true, datetime: true },
              orderBy: { pointOrder: "asc" },
            })
          : [];

        // Строим карту: orderId -> первая дата
        const dateMap = new Map<string, string>();
        for (const rp of routeDates) {
          if (rp.datetime && !dateMap.has(rp.orderId)) {
            dateMap.set(rp.orderId, rp.datetime);
          }
        }

        // Сортируем ID по датам (в памяти, но только ID + даты — минимальный объём)
        const dir = sortOrder === "asc" ? 1 : -1;
        allOrderIds.sort((a, b) => {
          const aDate = dateMap.get(a.id) || null;
          const bDate = dateMap.get(b.id) || null;
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return dir * aDate.localeCompare(bDate);
        });

        // Пагинация на уровне ID
        const start = (page - 1) * pageSize;
        const pageIds = allOrderIds.slice(start, start + pageSize).map(o => o.id);

        // Шаг 3: Загружаем полную заявку только для текущей страницы
        if (pageIds.length > 0) {
          orders = await db.order.findMany({
            where: { id: { in: pageIds } },
            include: {
              client: true,
              clientContract: true,
              carrier: true,
              carrierContract: true,
              driver: {
                include: {
                  carrier: {
                    select: { id: true, name: true }
                  }
                }
              },
              truck: true,
              trailer: true,
              port: true,
              containerType: true,
              user: {
                select: { id: true, name: true, email: true },
              },
              assignedManager: {
                select: { id: true, name: true, email: true, managerColor: true, dismissalDate: true, phones: { where: { isPrimary: true }, select: { phone: true, label: true }, take: 1 } },
              },
              branch: {
                select: { id: true, name: true },
              },
              routePoints: {
                orderBy: { pointOrder: "asc" as const },
              },
              expenses: {
                include: {
                  contractor: {
                    select: { id: true, name: true, type: true },
                  },
                },
              },
            },
          });

          // Сортируем результат в том же порядке, что и pageIds
          const idOrder = new Map(pageIds.map((id, i) => [id, i]));
          orders.sort((a, b) => (idOrder.get(a.id) || 0) - (idOrder.get(b.id) || 0));
        } else {
          orders = [];
        }
      } else {
        orders = await db.order.findMany({
          where,
          include: {
            client: true,
            clientContract: true,
            carrier: true,
            carrierContract: true,
            driver: {
              include: {
                carrier: {
                  select: { id: true, name: true }
                }
              }
            },
            truck: true,
            trailer: true,
            port: true,
            containerType: true,
            user: {
              select: { id: true, name: true, email: true },
            },
            assignedManager: {
              select: { id: true, name: true, email: true, managerColor: true, dismissalDate: true, phones: { where: { isPrimary: true }, select: { phone: true, label: true }, take: 1 } },
            },
            branch: {
              select: { id: true, name: true },
            },
            routePoints: {
              orderBy: { pointOrder: "asc" as const },
            },
            expenses: {
              include: {
                contractor: {
                  select: { id: true, name: true, type: true },
                },
              },
            },
          },
          orderBy: getOrderBy(sortBy, sortOrder),
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
      }

      logger.log("[orders] Fetched orders:", orders?.length);
    } catch (findError: any) {
      console.error("[orders] FindMany error:", findError);
      console.error("[orders] Error code:", findError?.code);
      console.error("[orders] Error meta:", JSON.stringify(findError?.meta));
      return NextResponse.json(
        { 
          error: "Ошибка получения заказов", 
          details: findError?.message,
          code: findError?.code,
          meta: findError?.meta,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orders,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error("Get orders error:", error);
    console.error("Error stack:", error?.stack);
    console.error("Error message:", error?.message);
    return NextResponse.json(
      { 
        error: "Ошибка получения списка заявок", 
        details: error?.message || "Unknown error",
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}

// POST - Create new order
export async function POST(request: NextRequest) {
  try {
    await ensureMigrations();
    const user = await getServerUser(request);

    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const canCreate = await hasPermission(user, "ORDERS", "canCreate");
    if (!canCreate) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json();
    const data = orderSchema.parse(body);

    // Validate branchId if provided
    if (data.branchId) {
      // Не-админы могут создавать заявки только в своём филиале
      if (user.role !== "ADMIN" && user.branchId && data.branchId !== user.branchId) {
        return NextResponse.json(
          { error: "Вы можете создавать заявки только в своём филиале" },
          { status: 403 }
        );
      }
      const branchExists = await db.branch.findUnique({ where: { id: data.branchId } });
      if (!branchExists) {
        return NextResponse.json(
          { error: "Филиал не найден" },
          { status: 400 }
        );
      }
    } else if (data.assignedManagerId) {
      // Auto-set branchId from manager's branch
      const manager = await db.user.findUnique({
        where: { id: data.assignedManagerId },
        select: { branchId: true },
      });
      if (manager?.branchId) {
        data.branchId = manager.branchId;
      }
    }

    // Валидация срока оплаты перевозчику
    if (data.carrierPaymentDays !== undefined && data.carrierPaymentDays !== null) {
      if (user.role === "LOGISTICS_MANAGER" && data.carrierPaymentDays < 7) {
        return NextResponse.json(
          { error: "Менеджер по логистике не может установить срок оплаты менее 7 дней" },
          { status: 403 }
        );
      }
    }

    // Проверяем уникальность номера если передан
    if (data.orderNumber) {
      const existingOrder = await db.order.findUnique({
        where: { orderNumber: data.orderNumber }
      });
      if (existingOrder) {
        return NextResponse.json(
          { error: "Заявка с таким номером уже существует" },
          { status: 400 }
        );
      }
    }

    // Create order with route points and expenses in a transaction
    const order = await db.$transaction(async (tx) => {
      // Create the order
      const newOrder = await tx.order.create({
        data: {
          orderNumber: data.orderNumber || null, // Может быть пустым до назначения менеджером
          // Client block
          clientId: data.clientId,
          clientContractId: data.clientContractId,
          
          // Carrier block
          carrierId: data.carrierId,
          carrierContractId: data.carrierContractId,
          driverId: data.driverId,
          truckId: data.truckId,
          trailerId: data.trailerId,
          
          // Route block
          transportMode: data.transportMode,
          
          // Cargo block
          containerTypeId: data.containerTypeId,
          containerNumber: data.containerNumber,
          trailerType: data.trailerType,
          cargoWeight: data.cargoWeight,
          dangerLevel: data.dangerLevel || "NOT_DANGEROUS",
          tareWeight: data.tareWeight,
          sealNumber: data.sealNumber,
          declarationNumber: data.declarationNumber,
          packageCount: data.packageCount,
          cargoName: data.cargoName,
          consignee: data.consignee,
          shipper: data.shipper,
          portId: data.portId,
          cargoNotes: data.cargoNotes,
          
          // Finance block
          clientRate: data.clientRate,
          clientRateVat: data.clientRateVat || "NO_VAT",
          carrierRate: data.carrierRate,
          carrierRateVat: data.carrierRateVat || "NO_VAT",
          carrierPaymentDays: data.carrierPaymentDays,
          kpi: data.kpi,
          
          // Monitoring block
          status: data.status || "NEW",
          emptyContainerReturnDate: data.emptyContainerReturnDate,
          emptyContainerReturnLocation: data.emptyContainerReturnLocation,
          
          // Documents block
          documentSubmissionDate: data.documentSubmissionDate,
          
          // Notes
          notes: data.notes,
          carrierNotes: data.carrierNotes,
          
          // Manager assignment
          assignedManagerId: data.assignedManagerId,
          
          // Finance/Payment fields
          branchId: data.branchId,
          carrierPrepayment: data.carrierPrepayment,
          carrierPrepaymentDate: data.carrierPrepaymentDate,
          carrierOffset: data.carrierOffset,
          carrierOffsetAmount: data.carrierOffsetAmount,
          carrierOffsetDescription: data.carrierOffsetDescription,
          clientExpectedPaymentDate: data.clientExpectedPaymentDate,
          clientActualPaymentDate: data.clientActualPaymentDate,
          carrierExpectedPaymentDate: data.carrierExpectedPaymentDate
            ? ensureRussianWorkingDay(data.carrierExpectedPaymentDate)
            : null,
          carrierActualPaymentDate: data.carrierActualPaymentDate,
          
          // User
          userId: user.id,
          
          // Legacy fields
          loadingDatetime: data.loadingDatetime,
          loadingCity: data.loadingCity,
          loadingAddress: data.loadingAddress,
          unloadingDatetime: data.unloadingDatetime,
          unloadingCity: data.unloadingCity,
          unloadingAddress: data.unloadingAddress,
        },
        include: {
          client: true,
          clientContract: true,
          port: true,
          containerType: true,
          driver: true,
          truck: true,
          trailer: true,
          carrier: true,
          carrierContract: true,
        },
      });

      // Create route points if provided
      if (data.routePoints && data.routePoints.length > 0) {
        for (const point of data.routePoints) {
          await tx.routePoint.create({
            data: {
              orderId: newOrder.id,
              pointType: point.pointType,
              pointOrder: point.pointOrder,
              datetime: point.datetime || null,
              city: point.city,
              cityFiasId: point.cityFiasId,
              cityRegion: point.cityRegion,
              cityCountry: point.cityCountry,
              address: point.address,
              actualArrival: point.actualArrival || null,
              actualDeparture: point.actualDeparture || null,
              notes: point.notes,
            },
          });
        }
      }

      // Create expenses if provided
      if (data.expenses && data.expenses.length > 0) {
        for (const expense of data.expenses) {
          await tx.orderExpense.create({
            data: {
              orderId: newOrder.id,
              contractorId: expense.contractorId,
              expenseType: expense.expenseType,
              description: expense.description,
              amount: expense.amount,
              vatType: expense.vatType || "NO_VAT",
            },
          });
        }
      }

      return newOrder;
    });

    // Логируем действие в аудит (кроме админа)
    await logAudit({
      userId: user.id,
      action: "CREATE",
      entityType: "ORDER",
      entityId: order.id,
      entityName: order.orderNumber ? `Заявка #${order.orderNumber}` : `Заявка ${order.id.slice(0, 8)}`,
      description: `Создана заявка ${order.orderNumber || order.id.slice(0, 8)}`,
      ipAddress: extractIpAddress(request),
      userAgent: extractUserAgent(request),
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    console.error("Create order error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message, details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Ошибка создания заявки", detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
