import { NextRequest, NextResponse } from "next/server";
import { getServerUser, hasPermission, canReassignManager } from "@/lib/server-auth";
import { db, ensureMigrations } from "@/lib/db";
import { logAudit, extractIpAddress, extractUserAgent } from "@/lib/audit";
import { createNotification, createNotificationsBatch } from "@/lib/notification-service";
import { logger } from "@/lib/logger";
import { ensureRussianWorkingDay } from "@/lib/russian-calendar";

import { z } from "zod";

// Маппинг названий полей на русские метки для истории изменений
const fieldLabels: Record<string, string> = {
  orderNumber: "Номер заявки",
  clientId: "Клиент",
  clientContractId: "Договор клиента",
  carrierId: "Перевозчик",
  carrierContractId: "Договор перевозчика",
  driverId: "Водитель",
  truckId: "Тягач",
  trailerId: "Прицеп",
  transportMode: "Тип перевозки",
  containerTypeId: "Тип контейнера",
  containerNumber: "Номер контейнера",
  trailerType: "Тип прицепа",
  cargoWeight: "Вес груза",
  dangerLevel: "Класс опасности",
  tareWeight: "Вес тары",
  sealNumber: "Номер пломбы",
  declarationNumber: "Номер декларации",
  packageCount: "Количество мест",
  cargoName: "Наименование груза",
  consignee: "Грузополучатель",
  shipper: "Грузоотправитель",
  portId: "Порт",
  cargoNotes: "Примечания к грузу",
  clientRate: "Ставка клиента",
  clientRateVat: "НДС клиента",
  carrierRate: "Ставка перевозчика",
  carrierRateVat: "НДС перевозчика",
  carrierPaymentDays: "Срок оплаты перевозчику",
  kpi: "KPI",
  status: "Статус",
  emptyContainerReturnDate: "Дата сдачи порожнего",
  emptyContainerReturnLocation: "Место сдачи порожнего",
  documentSubmissionDate: "Дата сдачи документов",
  notes: "Примечания",
  carrierNotes: "Примечания по перевозчику",
  reviewComment: "Комментарий к доработке",
  assignedManagerId: "Ответственный менеджер",
  branchId: "Филиал",
  carrierPrepayment: "Аванс перевозчику",
  carrierPrepaymentDate: "Дата аванса перевозчику",
  carrierOffset: "Оффсет",
  carrierOffsetAmount: "Сумма оффсета",
  carrierOffsetDescription: "Описание оффсета",
  clientExpectedPaymentDate: "Плановая дата оплаты клиентом",
  clientActualPaymentDate: "Фактическая дата оплаты клиентом",
  carrierExpectedPaymentDate: "Плановая дата оплаты перевозчику",
  carrierActualPaymentDate: "Фактическая дата оплаты перевозчику",
  loadingDatetime: "Дата и время загрузки",
  loadingCity: "Город загрузки",
  loadingAddress: "Адрес загрузки",
  unloadingDatetime: "Дата и время выгрузки",
  unloadingCity: "Город выгрузки",
  unloadingAddress: "Адрес выгрузки",
};

// Маппинг значений для перечислений
const enumLabels: Record<string, Record<string, string>> = {
  status: {
    NEW: "Новый",
    WAITING_RELEASE: "Ждем выпуск",
    WAITING_RELAY: "Ждем релиз",
    IN_PORT: "В порту",
    IN_TRANSIT: "В пути",
    AT_CUSTOMS: "На таможне",
    AT_UNLOADING: "На выгрузке",
    AT_LOADING: "На загрузке",
    ON_RETURN: "На возврате",
    PROBLEM: "Проблема",
    FOR_REVIEW: "На проверке",
    COMPLETED: "Сдан",
    WAITING_PAYMENT: "Ожидание оплаты",
    PAID: "Оплачено перевозчику",
  },
  transportMode: {
    GTD: "ГТД",
    VTT: "ВТТ",
    MTT: "МТТ",
    EXPORT: "Экспорт",
  },
  trailerType: {
    CONTAINER_CARRIER: "Контейнеровоз",
    TENT: "Тент",
    REFRIGERATOR: "Рефрижератор",
    LOWBOY: "Трал",
  },
  dangerLevel: {
    NOT_DANGEROUS: "Не опасный",
    DANGEROUS: "Опасный",
    DANGEROUS_DIRECT: "Опасный (прямой)",
  },
  clientRateVat: {
    NO_VAT: "Без НДС",
    VAT_5: "НДС 5%",
    VAT_7: "НДС 7%",
    VAT_10: "НДС 10%",
    VAT_20: "НДС 20%",
    VAT_22: "НДС 22%",
  },
  carrierRateVat: {
    NO_VAT: "Без НДС",
    VAT_5: "НДС 5%",
    VAT_7: "НДС 7%",
    VAT_10: "НДС 10%",
    VAT_20: "НДС 20%",
    VAT_22: "НДС 22%",
  },
};

// Поля, которые содержат дату и время (нужен полный формат)
const datetimeFields = [
  "loadingDatetime",
  "unloadingDatetime",
  "emptyContainerReturnDate",
  "documentSubmissionDate",
  "carrierPrepaymentDate",
  "clientExpectedPaymentDate",
  "clientActualPaymentDate",
  "carrierExpectedPaymentDate",
  "carrierActualPaymentDate",
];

// Форматирование значения для отображения в истории
function formatValueForHistory(fieldName: string, value: any): string {
  if (value === null || value === undefined || value === "") return "—";

  // Проверяем, является ли значение датой (Date объект)
  if (value instanceof Date) {
    // Для полей с датой и временем показываем полный формат
    if (datetimeFields.includes(fieldName)) {
      return value.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return value.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  // Строковые значения даты/времени
  const strValue = String(value);
  if (datetimeFields.includes(fieldName) && strValue) {
    // Пробуем распарсить как дату
    try {
      const date = new Date(strValue);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch {}
  }

  // Числовые значения — добавляем разделитель тысяч
  if (typeof value === "number") {
    return value.toLocaleString("ru-RU");
  }

  // Проверяем перечисления
  if (enumLabels[fieldName] && enumLabels[fieldName][strValue]) {
    return enumLabels[fieldName][strValue];
  }

  return strValue;
}

// Запись изменений в историю
async function recordChangeHistory(
  tx: any,
  orderId: string,
  userId: string,
  fieldName: string,
  oldValue: any,
  newValue: any
) {
  const formattedOld = formatValueForHistory(fieldName, oldValue);
  const formattedNew = formatValueForHistory(fieldName, newValue);

  // Не записываем, если значения идентичны после форматирования
  if (formattedOld === formattedNew) return;

  await tx.orderChangeHistory.create({
    data: {
      orderId,
      fieldName,
      fieldLabel: fieldLabels[fieldName] || fieldName,
      oldValue: formattedOld,
      newValue: formattedNew,
      changedBy: userId,
    },
  });
}

// Проверка, изменилось ли значение (с учётом дат)
function isValueChanged(oldVal: any, newVal: any, fieldName: string): boolean {
  // Оба null/undefined/пустая строка — не изменилось
  if ((oldVal === null || oldVal === undefined || oldVal === "") && 
      (newVal === null || newVal === undefined || newVal === "")) {
    return false;
  }

  // Одно null, другое нет — изменилось
  if ((oldVal === null || oldVal === undefined || oldVal === "") !== 
      (newVal === null || newVal === undefined || newVal === "")) {
    return true;
  }

  // Для полей с датой и временем сравниваем форматированные значения
  if (datetimeFields.includes(fieldName)) {
    const oldFormatted = formatValueForHistory(fieldName, oldVal);
    const newFormatted = formatValueForHistory(fieldName, newVal);
    return oldFormatted !== newFormatted;
  }

  // Для дат сравниваем как Date объекты
  if (oldVal instanceof Date && newVal instanceof Date) {
    return oldVal.getTime() !== newVal.getTime();
  }

  // Для Date и строки
  if (oldVal instanceof Date && typeof newVal === "string") {
    const newDate = new Date(newVal);
    return !isNaN(newDate.getTime()) && oldVal.getTime() !== newDate.getTime();
  }
  if (typeof oldVal === "string" && newVal instanceof Date) {
    const oldDate = new Date(oldVal);
    return !isNaN(oldDate.getTime()) && oldDate.getTime() !== newVal.getTime();
  }

  // Обычное сравнение через JSON.stringify
  return JSON.stringify(oldVal) !== JSON.stringify(newVal);
}

// Helper to parse date string with proper timezone handling
const parseDateTime = (val: string | null | undefined): Date | null => {
  if (!val || val.trim() === "") return null;
  
  // If it's a datetime-local format (YYYY-MM-DDTHH:mm), treat it as local time
  if (val.includes('T') && !val.includes('Z') && !val.includes('+')) {
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }
  
  const date = new Date(val);
  return isNaN(date.getTime()) ? null : date;
};

// Helper to parse date-only string (YYYY-MM-DD)
const parseDateOnly = (val: string | null | undefined): Date | null => {
  if (!val || val.trim() === "") return null;
  const date = new Date(val + 'T00:00:00Z');
  return isNaN(date.getTime()) ? null : date;
};

// Route point schema
const routePointSchema = z.object({
  id: z.string().optional(),
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
  id: z.string().optional(),
  contractorId: z.string().nullable().optional(),
  expenseType: z.enum(["CLIENT", "CARRIER"]),
  description: z.string().nullable().optional(),
  amount: z.number().min(0),
  vatType: z.string().default("NO_VAT"),
  _deleted: z.boolean().optional(), // Mark for deletion
});

// Order status enum
const orderStatusSchema = z.enum([
  "NEW",
  "WAITING_RELEASE",
  "WAITING_RELAY",
  "IN_PORT",
  "IN_TRANSIT",
  "AT_CUSTOMS",
  "AT_UNLOADING",
  "AT_LOADING",
  "ON_RETURN",
  "PROBLEM",
  "FOR_REVIEW",
  "COMPLETED",
  "WAITING_PAYMENT",
  "PAID",
]);

const orderUpdateSchema = z.object({
  // Order number (can be edited by admin or logistics manager, nullable)
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
  containerNumber: z.string().nullable().optional(),
  trailerType: z.enum(["CONTAINER_CARRIER", "TENT", "REFRIGERATOR", "LOWBOY"]).nullable().optional(),
  cargoWeight: z.number().min(0).nullable().optional(),
  dangerLevel: z.enum(["NOT_DANGEROUS", "DANGEROUS", "DANGEROUS_DIRECT"]).nullable().optional(),
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
  clientRateVat: z.string().optional(),
  carrierRate: z.number().nullable().optional(),
  carrierRateVat: z.string().optional(),
  carrierPaymentDays: z.number().int().nullable().optional(), // -1 означает "не указан"
  kpi: z.number().min(0).nullable().optional(),
  expenses: z.array(expenseSchema).optional(),
  
  // Monitoring block
  status: orderStatusSchema.optional(),
  emptyContainerReturnDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  emptyContainerReturnLocation: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  
  // Documents block
  documentSubmissionDate: z.string().transform(val => parseDateOnly(val)).nullable().optional(),
  
  // Notes
  notes: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  carrierNotes: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  reviewComment: z.string().transform(val => val === "" ? null : val).nullable().optional(),

  // Review actions (admin: approve/reject, manager: resubmit)
  reviewAction: z.enum(["approve", "reject", "resubmit"]).optional(),

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
  
  // Manager actions
  takeOrder: z.boolean().optional(), // Assign to current user
  assignToMe: z.boolean().optional(), // Alias for takeOrder
  completeOrder: z.boolean().optional(), // Mark as completed
  
  // Legacy fields - stored as strings in DB
  loadingDatetime: z.string().nullable().optional(),
  loadingCity: z.string().optional(),
  loadingAddress: z.string().optional(),
  unloadingDatetime: z.string().nullable().optional(),
  unloadingCity: z.string().optional(),
  unloadingAddress: z.string().optional(),
});

// GET - Get single order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrations();
    const user = await getServerUser(request);

    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
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
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignedManager: {
          select: {
            id: true,
            name: true,
            email: true,
            branchId: true,
            phones: {
              where: { isPrimary: true },
              select: { phone: true, label: true },
              take: 1,
            },
          },
        },
        branch: {
          select: { id: true, name: true, documentGraceDays: true },
        },
        routePoints: {
          orderBy: {
            pointOrder: "asc",
          },
        },
        expenses: {
          include: {
            contractor: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    // Авто-коррекция статуса: если статус COMPLETED но есть этапы SUBMITTED_DOCS/PAID — исправляем
    if (order.status === "COMPLETED" && order.isCompleted) {
      try {
        const stages = await db.transportStage.findMany({
          where: { orderId: id },
          select: { stageType: true },
        });
        let correctStatus: string | null = null;
        if (stages.some(s => s.stageType === "PAID")) {
          correctStatus = "PAID";
        } else if (stages.some(s => s.stageType === "SUBMITTED_DOCS")) {
          correctStatus = "WAITING_PAYMENT";
        }
        if (correctStatus && correctStatus !== order.status) {
          console.log("[orders GET] Auto-correcting status for order", id, "from", order.status, "to", correctStatus);
          await db.order.update({ where: { id }, data: { status: correctStatus } });
          order.status = correctStatus;
        }
      } catch (autoFixErr: any) {
        console.error("[orders GET] Auto-fix status error:", autoFixErr.message);
      }
    }

    // Не-админы видят только заявки своего филиала
    if (user.role !== "ADMIN") {
      if (!user.branchId) {
        return NextResponse.json(
          { error: "У вас не назначен филиал. Обратитесь к администратору." },
          { status: 403 }
        );
      }
      if (order.branchId !== user.branchId) {
        return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
      }
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json(
      { error: "Ошибка получения заявки" },
      { status: 500 }
    );
  }
}

// PUT - Update order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureMigrations();
    const user = await getServerUser(request);

    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;

    logger.log("[PUT /api/orders/:id] User:", user.id, "Role:", user.role, "Branch:", user.branchId);

    const canEdit = await hasPermission(user, "ORDERS", "canEdit");
    if (!canEdit) {
      logger.log("[PUT /api/orders/:id] Permission denied for user:", user.id, "role:", user.role, "canEdit:", canEdit);
      return NextResponse.json({ error: "Доступ запрещен. У вас нет прав на редактирование заявок." }, { status: 403 });
    }

    // Проверка доступа по филиалу: не-админы могут редактировать только заявки своего филиала
    const existingOrderForAccess = await db.order.findUnique({
      where: { id },
      select: { branchId: true, status: true },
    });

    if (!existingOrderForAccess) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    // Проверка доступа: заявки со статусом «Оплачено перевозчику» доступны только администратору
    // и пользователям с правом PAID_ORDERS.canEdit
    if (existingOrderForAccess.status === "PAID" && user.role !== "ADMIN") {
      const canEditPaid = await hasPermission(user, "PAID_ORDERS", "canEdit");
      if (!canEditPaid) {
        return NextResponse.json(
          { error: "Заявка со статусом «Оплачено перевозчику» доступна только для чтения. Обратитесь к администратору для получения прав на редактирование." },
          { status: 403, headers: { "X-PAID-ORDER-LOCKED": "true" } }
        );
      }
    }

    if (user.role !== "ADMIN") {
      if (!user.branchId) {
        return NextResponse.json(
          { error: "У вас не назначен филиал. Обратитесь к администратору." },
          { status: 403 }
        );
      }
      if (existingOrderForAccess.branchId !== user.branchId) {
        return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
      }
    }

    const body = await request.json();
    
    logger.log("=== UPDATE ORDER REQUEST ===");
    logger.log("Order ID:", id);
    logger.log("carrierId:", body.carrierId);
    logger.log("driverId:", body.driverId);
    logger.log("truckId:", body.truckId);
    logger.log("trailerId:", body.trailerId);
    
    // Проверка валидности всех внешних ключей
    const validationErrors: string[] = [];
    
    // Проверка carrierId
    if (body.carrierId && body.carrierId !== "" && body.carrierId !== null) {
      const carrier = await db.counterparty.findUnique({
        where: { id: body.carrierId },
      });
      logger.log("Carrier check:", body.carrierId, carrier ? `exists, type=${carrier.type}, isActive=${carrier.isActive}` : "NOT FOUND");
      
      if (!carrier) {
        validationErrors.push(`Перевозчик с ID "${body.carrierId}" не найден`);
      } else if (!carrier.isActive) {
        validationErrors.push(`Перевозчик "${carrier.name}" неактивен`);
      } else if (carrier.type !== "CARRIER" && carrier.type !== "CLIENT_CARRIER") {
        validationErrors.push(`Контрагент "${carrier.name}" не является перевозчиком`);
      }
    }
    
    // Проверка driverId
    if (body.driverId && body.driverId !== "" && body.driverId !== null) {
      const driver = await db.driver.findUnique({
        where: { id: body.driverId },
      });
      logger.log("Driver check:", body.driverId, driver ? `exists, isActive=${driver.isActive}` : "NOT FOUND");
      
      if (!driver) {
        validationErrors.push(`Водитель с ID "${body.driverId}" не найден`);
      } else if (!driver.isActive) {
        validationErrors.push(`Водитель неактивен`);
      }
    }
    
    // Проверка truckId
    if (body.truckId && body.truckId !== "" && body.truckId !== null) {
      const truck = await db.truck.findUnique({
        where: { id: body.truckId },
      });
      logger.log("Truck check:", body.truckId, truck ? `exists, isActive=${truck.isActive}` : "NOT FOUND");
      
      if (!truck) {
        validationErrors.push(`Тягач с ID "${body.truckId}" не найден`);
      } else if (!truck.isActive) {
        validationErrors.push(`Тягач неактивен`);
      }
    }
    
    // Проверка trailerId
    if (body.trailerId && body.trailerId !== "" && body.trailerId !== null) {
      const trailer = await db.trailer.findUnique({
        where: { id: body.trailerId },
      });
      logger.log("Trailer check:", body.trailerId, trailer ? `exists, isActive=${trailer.isActive}` : "NOT FOUND");
      
      if (!trailer) {
        validationErrors.push(`Прицеп с ID "${body.trailerId}" не найден`);
      } else if (!trailer.isActive) {
        validationErrors.push(`Прицеп неактивен`);
      }
    }
    
    if (validationErrors.length > 0) {
      logger.log("Validation errors:", validationErrors);
      return NextResponse.json(
        { error: validationErrors.join("; "), code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    
    const data = orderUpdateSchema.parse(body);
    
    logger.log("Parsed carrierId:", data.carrierId);

    const existingOrder = await db.order.findUnique({
      where: { id },
      include: {
        routePoints: true,
        expenses: true,
        carrier: { select: { id: true, name: true } },
      },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const isAdmin = user.role === "ADMIN";
    const isLogisticsManager = user.role === "LOGISTICS_MANAGER";
    const isCommercialManager = user.role === "COMMERCIAL_MANAGER";
    const canEditClientFields = isAdmin || isCommercialManager || isLogisticsManager;
    const canEditOrderNumber = isAdmin || isLogisticsManager;

    // Prepare update data
    const updateData: any = {};

    // Order number - can be edited by admin or logistics manager (can be set to null)
    if (data.orderNumber !== undefined && canEditOrderNumber) {
      // Check if order number is unique (excluding current order) - only if not null
      if (data.orderNumber !== null) {
        const existingOrderWithNumber = await db.order.findFirst({
          where: {
            orderNumber: data.orderNumber,
            NOT: { id }
          }
        });
        if (existingOrderWithNumber) {
          return NextResponse.json(
            { error: "Заявка с таким номером уже существует" },
            { status: 400 }
          );
        }
      }
      updateData.orderNumber = data.orderNumber;
    }

    // Client block - restricted for managers
    if (canEditClientFields) {
      if (data.clientId !== undefined) updateData.clientId = data.clientId;
      if (data.clientContractId !== undefined) updateData.clientContractId = data.clientContractId;
    }

    // Carrier block - everyone can edit
    if (data.carrierId !== undefined) {
      logger.log("Setting carrierId:", data.carrierId);
      updateData.carrierId = data.carrierId;
    }
    if (data.carrierContractId !== undefined) updateData.carrierContractId = data.carrierContractId;
    if (data.driverId !== undefined) updateData.driverId = data.driverId;
    if (data.truckId !== undefined) updateData.truckId = data.truckId;
    if (data.trailerId !== undefined) updateData.trailerId = data.trailerId;
    
    logger.log("=== UPDATE DATA TO BE SENT TO PRISMA ===");
    logger.log("updateData:", JSON.stringify(updateData, null, 2));
    logger.log("updateData.carrierId:", updateData.carrierId);

    // Route block
    if (data.transportMode !== undefined) updateData.transportMode = data.transportMode;

    // Cargo block - container number and client rate restricted for managers
    if (canEditClientFields) {
      if (data.containerNumber !== undefined) updateData.containerNumber = data.containerNumber;
    }
    if (data.containerTypeId !== undefined) updateData.containerTypeId = data.containerTypeId;
    if (data.trailerType !== undefined) updateData.trailerType = data.trailerType;
    if (data.cargoWeight !== undefined) updateData.cargoWeight = data.cargoWeight;
    if (data.dangerLevel !== undefined) updateData.dangerLevel = data.dangerLevel;
    if (data.tareWeight !== undefined) updateData.tareWeight = data.tareWeight;
    if (data.sealNumber !== undefined) updateData.sealNumber = data.sealNumber;
    if (data.declarationNumber !== undefined) updateData.declarationNumber = data.declarationNumber;
    if (data.packageCount !== undefined) updateData.packageCount = data.packageCount;
    if (data.cargoName !== undefined) updateData.cargoName = data.cargoName;
    if (data.consignee !== undefined) updateData.consignee = data.consignee;
    if (data.shipper !== undefined) updateData.shipper = data.shipper;
    if (data.portId !== undefined) updateData.portId = data.portId;
    if (data.cargoNotes !== undefined) updateData.cargoNotes = data.cargoNotes;

    // Finance block - client rate restricted for managers
    if (canEditClientFields) {
      if (data.clientRate !== undefined) updateData.clientRate = data.clientRate;
      if (data.clientRateVat !== undefined) updateData.clientRateVat = data.clientRateVat;
    }
    if (data.carrierRate !== undefined) updateData.carrierRate = data.carrierRate;
    if (data.carrierRateVat !== undefined) updateData.carrierRateVat = data.carrierRateVat;
    if (data.carrierPaymentDays !== undefined) {
      // Менеджер по логистике не может изменить срок оплаты после смены статуса
      // Проверяем только если значение реально изменилось (не совпадает с текущим)
      if (user.role === "LOGISTICS_MANAGER" && existingOrder.status !== "NEW") {
        const existingVal = existingOrder.carrierPaymentDays;
        const newVal = data.carrierPaymentDays;
        // Считаем значения равными: оба null или оба одинаковые числа
        const valueChanged = (existingVal === null) !== (newVal === null) ||
          (existingVal !== null && newVal !== null && existingVal !== newVal);
        if (valueChanged) {
          return NextResponse.json(
            { error: "Менеджер по логистике не может изменить срок оплаты после смены статуса" },
            { status: 403 }
          );
        }
      }
      // Менеджер по логистике не может установить срок оплаты менее 7 дней
      if (user.role === "LOGISTICS_MANAGER" && data.carrierPaymentDays !== null && data.carrierPaymentDays < 7) {
        return NextResponse.json(
          { error: "Менеджер по логистике не может установить срок оплаты менее 7 дней" },
          { status: 403 }
        );
      }
      updateData.carrierPaymentDays = data.carrierPaymentDays;
    }
    if (data.kpi !== undefined) updateData.kpi = data.kpi;

    // Monitoring block
    if (data.status !== undefined) updateData.status = data.status;
    // emptyContainerReturnDate и documentSubmissionDate теперь управляются через этапы мониторинга
    // (RETURNED_EMPTY и SUBMITTED_DOCS). Не позволяем менять их напрямую через API заказа.
    // emptyContainerReturnLocation — единственное поле, которое можно редактировать вручную
    if (data.emptyContainerReturnLocation !== undefined) updateData.emptyContainerReturnLocation = data.emptyContainerReturnLocation;

    // Notes
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.carrierNotes !== undefined) updateData.carrierNotes = data.carrierNotes;
    if (data.reviewComment !== undefined) updateData.reviewComment = data.reviewComment;

    // Finance/Payment fields
    if (data.branchId !== undefined) updateData.branchId = data.branchId;
    if (data.carrierPrepayment !== undefined) updateData.carrierPrepayment = data.carrierPrepayment;
    if (data.carrierPrepaymentDate !== undefined) updateData.carrierPrepaymentDate = data.carrierPrepaymentDate;
    if (data.carrierOffset !== undefined) updateData.carrierOffset = data.carrierOffset;
    if (data.carrierOffsetAmount !== undefined) updateData.carrierOffsetAmount = data.carrierOffsetAmount;
    if (data.carrierOffsetDescription !== undefined) updateData.carrierOffsetDescription = data.carrierOffsetDescription;
    if (data.clientExpectedPaymentDate !== undefined) updateData.clientExpectedPaymentDate = data.clientExpectedPaymentDate;
    if (data.clientActualPaymentDate !== undefined) updateData.clientActualPaymentDate = data.clientActualPaymentDate;
    if (data.carrierExpectedPaymentDate !== undefined) {
      // Если дата попадает на праздник/выходной — переносим на следующий рабочий день
      updateData.carrierExpectedPaymentDate = data.carrierExpectedPaymentDate
        ? ensureRussianWorkingDay(data.carrierExpectedPaymentDate)
        : null;
    }
    if (data.carrierActualPaymentDate !== undefined) {
      updateData.carrierActualPaymentDate = data.carrierActualPaymentDate;
    }

    // Manager assignment (admin only, or users with canReassignManager permission)
    if (data.assignedManagerId !== undefined) {
      const newManagerId = data.assignedManagerId === "NO_MANAGER" ? null : data.assignedManagerId;
      const isChangingManager = newManagerId !== existingOrder.assignedManagerId;

      if (isChangingManager && user.role === "ADMIN") {
        updateData.assignedManagerId = newManagerId;
      } else if (isChangingManager && user.role !== "ADMIN") {
        const hasReassignPerm = await canReassignManager(user);
        if (!hasReassignPerm) {
          return NextResponse.json({ error: "У вас нет права переназначать менеджера" }, { status: 403 });
        }
        updateData.assignedManagerId = newManagerId;
      }
    }

    // Legacy fields
    if (data.loadingDatetime !== undefined) updateData.loadingDatetime = data.loadingDatetime;
    if (data.loadingCity !== undefined) updateData.loadingCity = data.loadingCity;
    if (data.loadingAddress !== undefined) updateData.loadingAddress = data.loadingAddress;
    if (data.unloadingDatetime !== undefined) updateData.unloadingDatetime = data.unloadingDatetime;
    if (data.unloadingCity !== undefined) updateData.unloadingCity = data.unloadingCity;
    if (data.unloadingAddress !== undefined) updateData.unloadingAddress = data.unloadingAddress;

    // Manager actions - забрать заявку (доступно админу и менеджеру по логистике)
    if (data.takeOrder || data.assignToMe) {
      const isLogisticsManager = user.role === "LOGISTICS_MANAGER";
      if (isAdmin || isLogisticsManager) {
        // Проверяем, что заявка еще не назначена
        if (!existingOrder.assignedManagerId) {
          updateData.assignedManagerId = user.id;
        }
      }
    }
    if (data.completeOrder) {
      updateData.isCompleted = true;
      // Определяем статус по этапам, а не слепо ставим COMPLETED.
      // Если есть SUBMITTED_DOCS → WAITING_PAYMENT, PAID → PAID, иначе COMPLETED
      try {
        const stages = await db.transportStage.findMany({
          where: { orderId: id },
          select: { stageType: true },
        });
        const stageToStatusMap: Record<string, string> = {
          LOADED: "IN_PORT",
          LEFT_PORT: "IN_TRANSIT",
          ARRIVED_CUSTOMS: "AT_CUSTOMS",
          LEFT_CUSTOMS: "IN_TRANSIT",
          ARRIVED_UNLOADING: "AT_UNLOADING",
          LEFT_UNLOADING: "ON_RETURN",
          RETURNED_EMPTY: "COMPLETED",
          SUBMITTED_DOCS: "WAITING_PAYMENT",
          PAID: "PAID",
          PROBLEM: "PROBLEM",
        };
        const stagePriority = [
          "PAID", "SUBMITTED_DOCS", "RETURNED_EMPTY", "LEFT_UNLOADING",
          "ARRIVED_UNLOADING", "LEFT_CUSTOMS", "ARRIVED_CUSTOMS",
          "LEFT_PORT", "LOADED", "PROBLEM",
        ];
        if (stages.some(s => s.stageType === "PROBLEM")) {
          updateData.status = "PROBLEM";
        } else {
          for (const stageType of stagePriority) {
            if (stages.some(s => s.stageType === stageType)) {
              updateData.status = stageToStatusMap[stageType];
              break;
            }
          }
        }
        console.log("[orders PUT] completeOrder: recalculated status from stages:", updateData.status);
      } catch (stageErr: any) {
        console.error("[orders PUT] Error recalculating status on completeOrder:", stageErr.message);
        // Не ставим COMPLETED как fallback — проверяем есть ли SUBMITTED_DOCS/PAID этапы
        try {
          const fallbackStages = await db.transportStage.findMany({ where: { orderId: id }, select: { stageType: true } });
          if (fallbackStages.some(s => s.stageType === "PAID")) {
            updateData.status = "PAID";
          } else if (fallbackStages.some(s => s.stageType === "SUBMITTED_DOCS")) {
            updateData.status = "WAITING_PAYMENT";
          } else {
            updateData.status = "COMPLETED";
          }
        } catch {
          updateData.status = "COMPLETED";
        }
      }
    }

    // === ФИНАЛЬНАЯ ПРОВЕРКА ВСЕХ ВНЕШНИХ КЛЮЧЕЙ ПЕРЕД ОБНОВЛЕНИЕМ ===
    logger.log("=== FINAL CHECK BEFORE UPDATE ===");
    logger.log("updateData to be applied:", JSON.stringify(updateData, null, 2));
    
    // Проверяем carrierId перед обновлением
    if (updateData.carrierId !== undefined && updateData.carrierId !== null) {
      const finalCarrierCheck = await db.counterparty.findUnique({
        where: { id: updateData.carrierId },
      });
      logger.log("Final carrier check for", updateData.carrierId, ":", finalCarrierCheck ? `EXISTS (type=${finalCarrierCheck.type})` : "NOT FOUND IN DATABASE");
      
      if (!finalCarrierCheck) {
        return NextResponse.json(
          { 
            error: `Перевозчик с ID "${updateData.carrierId}" не найден в базе данных. Возможные причины: перевозчик был удалён или деактивирован. Обновите страницу и выберите перевозчика заново.`,
            code: "CARRIER_NOT_FOUND",
            carrierId: updateData.carrierId
          },
          { status: 400 }
        );
      }
    }

    // --- Логика проверки и согласования (только для Администратора) ---
    if (isAdmin && data.reviewAction) {
      if (data.reviewAction === "approve") {
        // Проверено → Сдан, но пересчитываем статус по этапам
        // (если уже есть SUBMITTED_DOCS — статус должен быть WAITING_PAYMENT)
        updateData.isCompleted = true;
        updateData.reviewComment = null;

        // Пересчитываем статус по транспортным этапам
        try {
          const stages = await db.transportStage.findMany({
            where: { orderId: id },
            select: { stageType: true },
          });

          // Определяем статус по этапам (isCompleted=true чтобы не отправлять на FOR_REVIEW)
          const stageToStatusMap: Record<string, string> = {
            LOADED: "IN_PORT",
            LEFT_PORT: "IN_TRANSIT",
            ARRIVED_CUSTOMS: "AT_CUSTOMS",
            LEFT_CUSTOMS: "IN_TRANSIT",
            ARRIVED_UNLOADING: "AT_UNLOADING",
            LEFT_UNLOADING: "ON_RETURN",
            RETURNED_EMPTY: "COMPLETED", // после проверки — не отправлять повторно
            SUBMITTED_DOCS: "WAITING_PAYMENT",
            PAID: "PAID",
            PROBLEM: "PROBLEM",
          };
          const stagePriority = [
            "PAID", "SUBMITTED_DOCS", "RETURNED_EMPTY", "LEFT_UNLOADING",
            "ARRIVED_UNLOADING", "LEFT_CUSTOMS", "ARRIVED_CUSTOMS",
            "LEFT_PORT", "LOADED", "PROBLEM",
          ];

          if (stages.some(s => s.stageType === "PROBLEM")) {
            updateData.status = "PROBLEM";
          } else {
            for (const stageType of stagePriority) {
              if (stages.some(s => s.stageType === stageType)) {
                updateData.status = stageToStatusMap[stageType];
                break;
              }
            }
          }
          console.log("[orders PUT] Approve: recalculated status from stages:", updateData.status);
        } catch (stageErr: any) {
          console.error("[orders PUT] Error recalculating status on approve:", stageErr.message);
          // Не ставим COMPLETED как fallback — проверяем есть ли SUBMITTED_DOCS/PAID этапы
          try {
            const fallbackStages = await db.transportStage.findMany({ where: { orderId: id }, select: { stageType: true } });
            if (fallbackStages.some(s => s.stageType === "PAID")) {
              updateData.status = "PAID";
            } else if (fallbackStages.some(s => s.stageType === "SUBMITTED_DOCS")) {
              updateData.status = "WAITING_PAYMENT";
            } else {
              updateData.status = "COMPLETED";
            }
          } catch {
            updateData.status = "COMPLETED";
          }
        }
      } else if (data.reviewAction === "reject" && data.reviewComment) {
        // На доработку → Проблема
        updateData.status = "PROBLEM";
        updateData.reviewComment = data.reviewComment;
      }
    }

    // --- Повторная отправка на проверку после доработки (для менеджера) ---
    if (data.reviewAction === "resubmit" && !isAdmin) {
      if (existingOrder.status !== "PROBLEM") {
        return NextResponse.json(
          { error: "Повторная отправка на проверку возможна только для заявок на доработке" },
          { status: 400 }
        );
      }
      updateData.status = "FOR_REVIEW";
    }

    // Сохраняем carrierId до транзакции (внутри транзакции он может быть удалён из updateData)
    const carrierIdBeforeTx = updateData.carrierId !== undefined ? updateData.carrierId : undefined;
    const carrierIdOldBeforeTx = existingOrder.carrierId;

    // Use transaction for atomic update with route points and expenses
    logger.log("=== STARTING TRANSACTION ===");
    logger.log("updateData being sent to Prisma:", JSON.stringify(updateData, null, 2));
    
    const order = await db.$transaction(async (tx) => {
      // Проверяем перевозчика прямо перед обновлением
      if (updateData.carrierId) {
        const checkCarrier = await tx.counterparty.findUnique({
          where: { id: updateData.carrierId },
        });
        logger.log("CARRIER CHECK INSIDE TRANSACTION:", updateData.carrierId, "->", checkCarrier ? `FOUND: ${checkCarrier.name}` : "NOT FOUND");
        
        // Получаем информацию о FK constraint перед обновлением
        let fkInfo: any[] = [];
        try {
          fkInfo = await tx.$queryRaw<any[]>`
            SELECT 
              tc.constraint_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_name = 'Order'
              AND tc.constraint_name = 'Order_carrierId_fkey'
          `;
          logger.log("FK CONSTRAINT INFO:", JSON.stringify(fkInfo));
        } catch (fkError) {
          console.error("Failed to get FK info:", fkError);
        }
        
        // Используем raw SQL для обновления carrierId, чтобы обойти возможные проблемы с FK
        logger.log("Attempting direct SQL update for carrierId...");
        try {
          await tx.$executeRaw`UPDATE "Order" SET "carrierId" = ${updateData.carrierId} WHERE "id" = ${id}`;
          logger.log("Direct SQL update for carrierId succeeded");
          // Удаляем carrierId из updateData, так как уже обновили его через SQL
          delete updateData.carrierId;
        } catch (sqlError: any) {
          console.error("Direct SQL update failed:", sqlError);
          // Возвращаем диагностику в ошибке
          throw new Error(JSON.stringify({
            message: sqlError.message,
            code: sqlError.code,
            fkInfo: fkInfo,
            carrierId: updateData.carrierId,
            carrierExists: checkCarrier ? true : false
          }));
        }
      }
      
      // Update the order
      const updatedOrder = await tx.order.update({
        where: { id },
        data: updateData,
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
          assignedManager: {
            select: { id: true, name: true, email: true, managerColor: true, dismissalDate: true, phones: { where: { isPrimary: true }, select: { phone: true, label: true }, take: 1 } },
          },
          branch: {
            select: { id: true, name: true },
          },
          user: {
            select: { id: true, name: true, email: true },
          },
          routePoints: {
            orderBy: { pointOrder: "asc" },
          },
          expenses: {
            include: { contractor: true },
          },
        },
      });

      // Handle route points updates with change tracking
      if (data.routePoints) {
        logger.log("=== ROUTE POINTS UPDATE ===");
        logger.log("Route points data:", JSON.stringify(data.routePoints, null, 2));
        
        for (const point of data.routePoints) {
          const isTempId = point.id && point.id.startsWith('temp-');
          logger.log(`Processing point ${point.id}: isTempId=${isTempId}, _deleted=${point._deleted}, city=${point.city}, address=${point.address}`);
          
          if (point._deleted && point.id && !isTempId) {
            // Delete existing point
            const existingPoint = existingOrder.routePoints.find(p => p.id === point.id);
            await tx.routePoint.delete({
              where: { id: point.id },
            });
            logger.log(`Deleted point ${point.id}`);
            
            // Записываем удаление точки в историю
            if (existingPoint) {
              const pointTypeLabel = existingPoint.pointType === "LOADING" ? "Загрузка" :
                                    existingPoint.pointType === "UNLOADING" ? "Выгрузка" : "Транзит";
              await tx.orderChangeHistory.create({
                data: {
                  orderId: id,
                  fieldName: "routePoint",
                  fieldLabel: `${pointTypeLabel} (${existingPoint.city || 'без города'})`,
                  oldValue: `${existingPoint.datetime ? formatValueForHistory('loadingDatetime', existingPoint.datetime) : 'без времени'}`,
                  newValue: "Удалено",
                  changedBy: user.id,
                },
              });
            }
          } else if (point.id && !isTempId) {
            // Update existing point - отслеживаем изменения
            const existingPoint = existingOrder.routePoints.find(p => p.id === point.id);
            const pointUpdateData = {
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
            };
            logger.log(`Updating point ${point.id} with:`, pointUpdateData);
            
            // Записываем изменения в историю
            if (existingPoint) {
              const pointTypeLabel = existingPoint.pointType === "LOADING" ? "Загрузка" :
                                    existingPoint.pointType === "UNLOADING" ? "Выгрузка" : "Транзит";
              
              // Проверяем изменение даты/времени
              const oldDatetime = existingPoint.datetime;
              const newDatetime = point.datetime;
              if (oldDatetime !== newDatetime && !(oldDatetime === null && newDatetime === null)) {
                const oldFormatted = oldDatetime ? formatValueForHistory('loadingDatetime', oldDatetime) : '—';
                const newFormatted = newDatetime ? formatValueForHistory('loadingDatetime', newDatetime) : '—';
                
                await tx.orderChangeHistory.create({
                  data: {
                    orderId: id,
                    fieldName: "routePointDatetime",
                    fieldLabel: `Дата и время ${pointTypeLabel.toLowerCase()}`,
                    oldValue: oldFormatted,
                    newValue: newFormatted,
                    changedBy: user.id,
                  },
                });
              }
              
              // Проверяем изменение города
              if (existingPoint.city !== point.city) {
                await tx.orderChangeHistory.create({
                  data: {
                    orderId: id,
                    fieldName: "routePointCity",
                    fieldLabel: `Город ${pointTypeLabel.toLowerCase()}`,
                    oldValue: existingPoint.city || '—',
                    newValue: point.city || '—',
                    changedBy: user.id,
                  },
                });
              }
              
              // Проверяем изменение адреса
              if (existingPoint.address !== point.address) {
                await tx.orderChangeHistory.create({
                  data: {
                    orderId: id,
                    fieldName: "routePointAddress",
                    fieldLabel: `Адрес ${pointTypeLabel.toLowerCase()}`,
                    oldValue: existingPoint.address || '—',
                    newValue: point.address || '—',
                    changedBy: user.id,
                  },
                });
              }
            }
            
            await tx.routePoint.update({
              where: { id: point.id },
              data: pointUpdateData,
            });
            logger.log(`Updated point ${point.id}`);
          } else if (!point._deleted) {
            // Create new point
            const createData = {
              orderId: id,
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
            };
            logger.log(`Creating new point:`, createData);
            
            await tx.routePoint.create({
              data: createData,
            });
            logger.log(`Created new point`);
            
            // Записываем создание точки в историю
            const pointTypeLabel = point.pointType === "LOADING" ? "Загрузка" :
                                  point.pointType === "UNLOADING" ? "Выгрузка" : "Транзит";
            await tx.orderChangeHistory.create({
              data: {
                orderId: id,
                fieldName: "routePoint",
                fieldLabel: `${pointTypeLabel} (${point.city || 'без города'})`,
                oldValue: "—",
                newValue: point.datetime ? formatValueForHistory('loadingDatetime', point.datetime) : 'добавлено',
                changedBy: user.id,
              },
            });
          }
        }
      }

      // Handle expenses updates
      if (data.expenses) {
        for (const expense of data.expenses) {
          // Skip expenses with no amount or temporary IDs for creation
          const isTempId = expense.id && expense.id.startsWith('temp-');
          
          if (expense._deleted && expense.id && !isTempId) {
            // Delete existing expense
            await tx.orderExpense.delete({
              where: { id: expense.id },
            });
          } else if (expense.id && !isTempId) {
            // Update existing expense
            await tx.orderExpense.update({
              where: { id: expense.id },
              data: {
                contractorId: expense.contractorId,
                expenseType: expense.expenseType,
                description: expense.description,
                amount: expense.amount,
                vatType: expense.vatType || "NO_VAT",
              },
            });
          } else if (!expense._deleted) {
            // Create new expense (skip if marked as deleted)
            await tx.orderExpense.create({
              data: {
                orderId: id,
                contractorId: expense.contractorId,
                expenseType: expense.expenseType,
                description: expense.description,
                amount: expense.amount || 0,
                vatType: expense.vatType || "NO_VAT",
              },
            });
          }
        }
      }

      // Record status history if status changed (including auto-transitions and review actions)
      if (updateData.status && updateData.status !== existingOrder.status) {
        const notes = data.reviewAction === "reject"
          ? data.reviewComment
          : data.reviewAction === "resubmit"
            ? "Повторная отправка на проверку после доработки"
            : (data.notes || null);
        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            status: updateData.status,
            changedBy: user.id,
            notes,
          },
        });
      }

      // --- Создание уведомлений ---
      // При переходе в FOR_REVIEW — уведомление для всех администраторов
      if (updateData.status === "FOR_REVIEW" && existingOrder.status !== "FOR_REVIEW") {
        const admins = await tx.user.findMany({
          where: { role: "ADMIN" },
          select: { id: true },
        });
        await createNotificationsBatch(
          admins.map(admin => ({
            userId: admin.id,
            orderId: id,
            type: "REVIEW_REQUESTED",
            title: "Заявка на проверке",
            message: `Заявка ${existingOrder.orderNumber || "(без номера)"} ожидает проверки администратором`,
          })),
          tx
        );
      }

      // При возврате на доработку — уведомление для менеджера заявки
      if (updateData.status === "PROBLEM" && data.reviewAction === "reject" && existingOrder.assignedManagerId) {
        await createNotification({
          userId: existingOrder.assignedManagerId,
          orderId: id,
          type: "SENT_FOR_REWORK",
          title: "Заявка на доработке",
          message: `Заявка ${existingOrder.orderNumber || "(без номера)"} отправлена на доработку. Комментарий: ${data.reviewComment}`,
        }, tx);
      }

      // При назначении нового менеджера на заявку с проблемными документами — уведомление для нового менеджера
      if (updateData.assignedManagerId && 
          updateData.assignedManagerId !== existingOrder.assignedManagerId &&
          existingOrder.paymentIssueType === "DOCUMENT_ISSUE") {
        const issueLabel = existingOrder.paymentIssueStatus === "STOP" ? "СТОП" :
                          existingOrder.paymentIssueStatus === "NO_ACTS" ? "НЕТ АКТОВ" :
                          existingOrder.paymentIssueStatus === "NO_RECEIPTS" ? "НЕТ ПОСТУПЛЕНИЙ" :
                          existingOrder.paymentIssueStatus === "NO_DSN" ? "НЕТ ДСН" :
                          existingOrder.paymentIssueStatus === "PROBLEM" ? "ПРОБЛЕМА" :
                          existingOrder.paymentIssueStatus === "CLAIM" ? "ПРЕТЕНЗИЯ" : "Проблема";
        
        const orderDisplayName = existingOrder.orderNumber || existingOrder.containerNumber || id.slice(0, 8);
        const carrierName = existingOrder.carrier?.name || "Перевозчик";
        
        await createNotification({
          userId: updateData.assignedManagerId,
          orderId: id,
          type: "PAYMENT_ISSUE_ASSIGNED",
          title: `Проблема с заявкой: ${issueLabel}`,
          message: `Заявка ${orderDisplayName} (${carrierName}) передана вам для исправления проблемы "${issueLabel}"${existingOrder.paymentIssueComment ? `: ${existingOrder.paymentIssueComment}` : ""}`,
          data: {
            orderId: id,
            orderNumber: existingOrder.orderNumber,
            containerNumber: existingOrder.containerNumber,
            carrierName: carrierName,
            paymentIssueStatus: existingOrder.paymentIssueStatus,
            paymentIssueComment: existingOrder.paymentIssueComment,
          },
        }, tx);
      }

      // === Запись истории изменений полей ===
      // Поля, которые являются FK и требуют преобразования в читаемые названия
      const fkDisplayFields: Record<string, { model: string; nameField: string; include?: string }> = {
        clientId: { model: "counterparty", nameField: "name" },
        carrierId: { model: "counterparty", nameField: "name" },
        clientContractId: { model: "clientContract", nameField: "contractNumber" },
        carrierContractId: { model: "carrierContract", nameField: "contractNumber" },
        driverId: { model: "driver", nameField: "fullName" },
        truckId: { model: "truck", nameField: "vehicleNumber" },
        trailerId: { model: "trailer", nameField: "vehicleNumber" },
        containerTypeId: { model: "containerType", nameField: "name" },
        portId: { model: "port", nameField: "name" },
        assignedManagerId: { model: "user", nameField: "name" },
        branchId: { model: "branch", nameField: "name" },
      };

      const changeEntries: Array<{ fieldName: string; oldValue: any; newValue: any }> = [];

      // Собираем изменения из updateData
      for (const [key, newVal] of Object.entries(updateData)) {
        const oldVal = (existingOrder as any)[key];

        // Пропускаем, если значение не изменилось (с учётом дат)
        if (!isValueChanged(oldVal, newVal, key)) continue;

        // Для FK полей — подготовим к разрешению названий
        if (fkDisplayFields[key]) {
          changeEntries.push({ fieldName: key, oldValue: oldVal, newValue: newVal });
        } else {
          // Обычные поля — записываем сразу
          await recordChangeHistory(tx, id, user.id, key, oldVal, newVal);
        }
      }

      // Для FK полей — разрешаем названия в пакетном режиме
      for (const entry of changeEntries) {
        const fkConfig = fkDisplayFields[entry.fieldName]!;
        const oldName = entry.oldValue
          ? await (tx[fkConfig.model] as any).findUnique({
              where: { id: entry.oldValue as string },
              select: { [fkConfig.nameField]: true },
            })
          : null;
        const newName = entry.newValue
          ? await (tx[fkConfig.model] as any).findUnique({
              where: { id: entry.newValue as string },
              select: { [fkConfig.nameField]: true },
            })
          : null;

        const displayOld = oldName ? (oldName as any)[fkConfig.nameField] : null;
        const displayNew = newName ? (newName as any)[fkConfig.nameField] : null;

        await tx.orderChangeHistory.create({
          data: {
            orderId: id,
            fieldName: entry.fieldName,
            fieldLabel: fieldLabels[entry.fieldName] || entry.fieldName,
            oldValue: displayOld || "—",
            newValue: displayNew || "—",
            changedBy: user.id,
          },
        });
      }

      // Записываем изменение назначенного менеджера (если через takeOrder)
      if ((data.takeOrder || data.assignToMe) && (isAdmin || isLogisticsManager) && !existingOrder.assignedManagerId) {
        await tx.orderChangeHistory.create({
          data: {
            orderId: id,
            fieldName: "assignedManagerId",
            fieldLabel: "Ответственный менеджер",
            oldValue: "—",
            newValue: user.name || user.email,
            changedBy: user.id,
          },
        });
      }

      // Записываем завершение заявки
      if (data.completeOrder && !existingOrder.isCompleted) {
        await tx.orderChangeHistory.create({
          data: {
            orderId: id,
            fieldName: "status",
            fieldLabel: "Статус",
            oldValue: formatValueForHistory("status", existingOrder.status),
            newValue: "Сдан (завершена)",
            changedBy: user.id,
          },
        });
      }

      return updatedOrder;
    });

    // Маппинг FK полей для разрешения ID в читаемые названия (для AuditLog.description)
    const fkDisplayFields: Record<string, { model: string; nameField: string }> = {
      clientId: { model: "counterparty", nameField: "name" },
      carrierId: { model: "counterparty", nameField: "name" },
      clientContractId: { model: "clientContract", nameField: "contractNumber" },
      carrierContractId: { model: "carrierContract", nameField: "contractNumber" },
      driverId: { model: "driver", nameField: "fullName" },
      truckId: { model: "truck", nameField: "vehicleNumber" },
      trailerId: { model: "trailer", nameField: "vehicleNumber" },
      containerTypeId: { model: "containerType", nameField: "name" },
      portId: { model: "port", nameField: "name" },
      assignedManagerId: { model: "user", nameField: "name" },
      branchId: { model: "branch", nameField: "name" },
    };

    // Собираем детальную информацию об изменениях для описания
    const changeDescriptions: string[] = [];
    for (const [key, newVal] of Object.entries(updateData)) {
      const oldVal = (existingOrder as any)[key];
      if (!isValueChanged(oldVal, newVal, key)) continue;

      const fieldLabel = fieldLabels[key] || key;
      let oldFormatted: string;
      let newFormatted: string;

      // Для FK полей — разрешаем ID в читаемые названия
      if (fkDisplayFields[key]) {
        const fkConfig = fkDisplayFields[key]!;
        const oldName = oldVal
          ? await (db[fkConfig.model] as any).findUnique({
              where: { id: oldVal as string },
              select: { [fkConfig.nameField]: true },
            })
          : null;
        const newName = newVal
          ? await (db[fkConfig.model] as any).findUnique({
              where: { id: newVal as string },
              select: { [fkConfig.nameField]: true },
            })
          : null;
        oldFormatted = oldName ? (oldName as any)[fkConfig.nameField] : "—";
        newFormatted = newName ? (newName as any)[fkConfig.nameField] : "—";
      } else {
        oldFormatted = formatValueForHistory(key, oldVal);
        newFormatted = formatValueForHistory(key, newVal);
      }

      // Формируем детальное описание изменения
      changeDescriptions.push(`${fieldLabel}: с "${oldFormatted}" на "${newFormatted}"`);
    }

    // Если carrierId был удалён из updateData внутри транзакции (raw SQL), добавляем вручную
    if (carrierIdBeforeTx !== undefined && !(updateData as any).carrierId) {
      const oldVal = carrierIdOldBeforeTx;
      const newVal = carrierIdBeforeTx;
      if (oldVal !== newVal) {
        const oldCarrier = oldVal
          ? await db.counterparty.findUnique({ where: { id: oldVal }, select: { name: true } })
          : null;
        const newCarrier = newVal
          ? await db.counterparty.findUnique({ where: { id: newVal }, select: { name: true } })
          : null;
        changeDescriptions.push(`Перевозчик: с "${oldCarrier?.name || "—"}" на "${newCarrier?.name || "—"}"`);
      }
    }

    // Добавляем изменения маршрутных точек в описание
    if (data.routePoints) {
      for (const point of data.routePoints) {
        const isTempId = point.id && point.id.startsWith('temp-');
        const existingPoint = !isTempId && point.id ? existingOrder.routePoints.find(p => p.id === point.id) : null;
        
        if (point._deleted && existingPoint) {
          const pointTypeLabel = existingPoint.pointType === "LOADING" ? "Загрузка" :
                                existingPoint.pointType === "UNLOADING" ? "Выгрузка" : "Транзит";
          changeDescriptions.push(`Точка "${pointTypeLabel}" (${existingPoint.city || 'без города'}): удалена`);
        } else if (existingPoint) {
          const pointTypeLabel = existingPoint.pointType === "LOADING" ? "Загрузка" :
                                existingPoint.pointType === "UNLOADING" ? "Выгрузка" : "Транзит";
          
          // Изменение даты/времени
          if (existingPoint.datetime !== point.datetime && !(existingPoint.datetime === null && point.datetime === null)) {
            const oldFormatted = existingPoint.datetime ? formatValueForHistory('loadingDatetime', existingPoint.datetime) : '—';
            const newFormatted = point.datetime ? formatValueForHistory('loadingDatetime', point.datetime) : '—';
            changeDescriptions.push(`Дата и время ${pointTypeLabel.toLowerCase()}: с "${oldFormatted}" на "${newFormatted}"`);
          }
          
          // Изменение города
          if (existingPoint.city !== point.city) {
            changeDescriptions.push(`Город ${pointTypeLabel.toLowerCase()}: с "${existingPoint.city || '—'}" на "${point.city || '—'}"`);
          }
        } else if (!point._deleted && isTempId) {
          // Новая точка
          const pointTypeLabel = point.pointType === "LOADING" ? "Загрузка" :
                                point.pointType === "UNLOADING" ? "Выгрузка" : "Транзит";
          changeDescriptions.push(`Добавлена точка "${pointTypeLabel}" (${point.city || 'без города'})`);
        }
      }
    }

    // Формируем описание изменений
    let changeDescription = "";
    if (changeDescriptions.length === 0) {
      // Если явных изменений нет, просто указываем что была открыта заявка
      changeDescription = `Просмотрена/сохранена заявка`;
    } else if (changeDescriptions.length === 1) {
      changeDescription = `Изменена ${changeDescriptions[0]}`;
    } else if (changeDescriptions.length <= 3) {
      changeDescription = changeDescriptions.map(d => `Изменена ${d}`).join("; ");
    } else {
      changeDescription = changeDescriptions.slice(0, 3).map(d => `Изменена ${d}`).join("; ") + ` и ещё ${changeDescriptions.length - 3} изменений`;
    }

    // Формируем имя сущности: "Заявка 123" или "Заявка -, контейнер XXX"
    let entityName: string;
    if (order.orderNumber) {
      entityName = `Заявка ${order.orderNumber}`;
    } else if (order.containerNumber) {
      entityName = `Заявка -, контейнер ${order.containerNumber}`;
    } else {
      entityName = `Заявка -`;
    }

    // Логируем действие в аудит (кроме админа)
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "ORDER",
      entityId: id,
      entityName: entityName,
      description: changeDescription,
      ipAddress: extractIpAddress(request),
      userAgent: extractUserAgent(request),
    });

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Zod validation error:", error.errors);
      return NextResponse.json(
        { error: error.errors[0].message, details: error.errors },
        { status: 400 }
      );
    }

    // Проверка на ошибку внешнего ключа
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code;
    const errorMeta = (error as any)?.meta;
    console.error("Update order error:", errorMessage);
    console.error("Error code:", errorCode);
    console.error("Error meta:", JSON.stringify(errorMeta, null, 2));
    
    // Пытаемся распарсить JSON из ошибки (если это наша диагностика)
    try {
      const parsedError = JSON.parse(errorMessage);
      if (parsedError.fkInfo) {
        return NextResponse.json(
          { 
            error: "Ошибка FK constraint - детальная диагностика",
            code: "FK_DIAGNOSTIC",
            debug: parsedError
          },
          { status: 400 }
        );
      }
    } catch (e) {
      // Не JSON, продолжаем обычную обработку
    }
    
    if (errorMessage.includes("Foreign key constraint violated") || errorCode === "P2003") {
      if (errorMessage.includes("Order_carrierId_fkey") || errorMessage.includes("carrierId")) {
        return NextResponse.json(
          { 
            error: "Выбранный перевозчик не найден в базе данных. Обновите страницу и выберите перевозчика заново.",
            code: "CARRIER_FK_ERROR",
            debug: {
              errorCode,
              errorMeta,
              carrierId: body.carrierId
            }
          },
          { status: 400 }
        );
      }
      if (errorMessage.includes("Order_driverId_fkey")) {
        return NextResponse.json(
          { 
            error: "Выбранный водитель не найден в базе данных. Обновите страницу и выберите водителя заново.",
            code: "DRIVER_FK_ERROR"
          },
          { status: 400 }
        );
      }
      if (errorMessage.includes("Order_truckId_fkey")) {
        return NextResponse.json(
          { 
            error: "Выбранный тягач не найден в базе данных. Обновите страницу и выберите тягач заново.",
            code: "TRUCK_FK_ERROR"
          },
          { status: 400 }
        );
      }
      if (errorMessage.includes("Order_trailerId_fkey")) {
        return NextResponse.json(
          { 
            error: "Выбранный прицеп не найден в базе данных. Обновите страницу и выберите прицеп заново.",
            code: "TRAILER_FK_ERROR"
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Ошибка обновления заявки", details: errorMessage },
      { status: 500 }
    );
  }
}

// PATCH - Partial update (e.g., payment date from KPI page)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const updateData: any = {};

    // Дата фактической оплаты клиентом
    if (body.clientActualPaymentDate !== undefined) {
      updateData.clientActualPaymentDate = body.clientActualPaymentDate || null;
    }

    // --- Поля для инлайн-редактирования (Для ТТН) ---
    const ttnFields = [
      { field: "tareWeight", parser: (v: any) => (v !== null && v !== "" && !isNaN(Number(v))) ? Number(v) : null },
      { field: "sealNumber", parser: (v: any) => v === "" ? null : v },
      { field: "declarationNumber", parser: (v: any) => v === "" ? null : v },
      { field: "packageCount", parser: (v: any) => (v !== null && v !== "" && !isNaN(Number(v))) ? Number(v) : null },
      { field: "cargoName", parser: (v: any) => v === "" ? null : v },
      { field: "shipper", parser: (v: any) => v === "" ? null : v },
      { field: "consignee", parser: (v: any) => v === "" ? null : v },
    ];

    for (const { field, parser } of ttnFields) {
      if (body[field] !== undefined) {
        updateData[field] = parser(body[field]);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    const order = await db.order.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("[PATCH /api/orders/:id] error:", error);
    return NextResponse.json(
      { error: "Ошибка частичного обновления заявки", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser(request);

    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;

    const existingOrder = await db.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    // Only Admin can delete
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    // Delete with cascade (route points and expenses will be deleted automatically)
    await db.order.delete({
      where: { id },
    });

    // Логируем действие в аудит (кроме админа)
    await logAudit({
      userId: user.id,
      action: "DELETE",
      entityType: "ORDER",
      entityId: id,
      entityName: existingOrder.orderNumber ? `Заявка #${existingOrder.orderNumber}` : `Заявка ${id.slice(0, 8)}`,
      description: `Удалена заявка ${existingOrder.orderNumber || id.slice(0, 8)}`,
      ipAddress: extractIpAddress(request),
      userAgent: extractUserAgent(request),
    });

    return NextResponse.json({ message: "Заявка успешно удалена" });
  } catch (error) {
    console.error("Delete order error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления заявки" },
      { status: 500 }
    );
  }
}
