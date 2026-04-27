import { NextRequest, NextResponse } from "next/server";
import { getServerUser, hasPermission } from "@/lib/server-auth";
import { db, ensureMigrations } from "@/lib/db";
import { createNotification, createNotificationsBatch } from "@/lib/notification-service";
import { countRussianWorkingDays, addRussianWorkingDays, isRussianWorkingDay, ensureRussianWorkingDay, ensureProductionCalendar, clearProductionCalendarCache } from "@/lib/russian-calendar";

// GET - Платежный календарь: заявки со статусом WAITING_PAYMENT, отсортированные по планируемой дате оплаты
export async function GET(request: NextRequest) {
  try {
    await ensureMigrations();
    const user = await getServerUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Load production calendar from DB for accurate working day calculations
    await ensureProductionCalendar();

    const canView = await hasPermission(user, "ORDERS", "canView");
    if (!canView) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get("countOnly") === "true";
    const search = searchParams.get("search")?.trim() || "";
    const paymentDate = searchParams.get("paymentDate") || "";
    const paymentDateFrom = searchParams.get("paymentDateFrom") || "";
    const paymentDateTo = searchParams.get("paymentDateTo") || "";
    // Новый параметр: тип даты для фильтрации (expected = планируемая, actual = фактическая)
    const dateType = searchParams.get("dateType") || "expected";
    // Новый параметр: фильтр по перевозчику
    const carrierId = searchParams.get("carrierId") || "";

    const where: any = {
      status: "WAITING_PAYMENT",
    };

    // Фильтр по поиску (номер заявки, контейнер, перевозчик, заказчик)
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { containerNumber: { contains: search, mode: "insensitive" } },
        { carrier: { name: { contains: search, mode: "insensitive" } } },
        { client: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Фильтр по перевозчику
    if (carrierId) {
      where.carrierId = carrierId;
    }

    // Фильтр по дате оплаты (выбираем поле в зависимости от dateType)
    const dateField = dateType === "actual" ? "carrierActualPaymentDate" : "carrierExpectedPaymentDate";
    if (paymentDate) {
      where[dateField] = {
        gte: new Date(paymentDate + "T00:00:00Z"),
        lte: new Date(paymentDate + "T23:59:59Z"),
      };
    } else if (paymentDateFrom || paymentDateTo) {
      // Обратная совместимость: диапазон дат
      where[dateField] = {};
      if (paymentDateFrom) {
        where[dateField].gte = new Date(paymentDateFrom + "T00:00:00Z");
      }
      if (paymentDateTo) {
        where[dateField].lte = new Date(paymentDateTo + "T23:59:59Z");
      }
    }

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
            return NextResponse.json(countOnly ? { count: 0 } : { orders: [] });
          }
          where.clientId = { in: clientAccess.map(ca => ca.clientId) };
        } catch {
          return NextResponse.json(countOnly ? { count: 0 } : { orders: [] });
        }
      } else {
        if (!user.branchId) {
          return NextResponse.json({ error: "У вас не назначен филиал" }, { status: 403 });
        }
        where.branchId = user.branchId;
      }
    } else {
      // Администратор может фильтровать по филиалу
      const branchFilter = searchParams.get("branchId");
      if (branchFilter) {
        where.branchId = branchFilter;
      }
    }

    // Только количество — для бейджа в сайдбаре
    if (countOnly) {
      const count = await db.order.count({ where });
      return NextResponse.json({ count });
    }

    const orders = await db.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        containerNumber: true,
        containerType: { select: { id: true, name: true } },
        cargoWeight: true,
        cargoName: true,
        loadingCity: true,
        loadingAddress: true,
        loadingDatetime: true,
        unloadingCity: true,
        unloadingAddress: true,
        unloadingDatetime: true,
        clientRate: true,
        clientRateVat: true,
        carrierRate: true,
        carrierRateVat: true,
        carrierPaymentDays: true,
        carrierActualPaymentDays: true,
        carrierPrepayment: true,
        carrierPrepaymentDate: true,
        carrierOffset: true,
        carrierOffsetAmount: true,
        carrierExpectedPaymentDate: true,
        carrierActualPaymentDate: true,
        clientExpectedPaymentDate: true,
        clientActualPaymentDate: true,
        documentSubmissionDate: true,
        emptyContainerReturnDate: true,
        createdAt: true,
        notes: true,
        paymentIssueType: true,
        paymentIssueStatus: true,
        paymentIssueComment: true,
        paymentIssueResolution: true,
        paymentIssueManagerComment: true,
        routePoints: {
          select: { id: true, pointType: true, pointOrder: true, city: true, datetime: true, address: true },
        },
        carrier: { select: { id: true, name: true, isBlocked: true } },
        client: { select: { id: true, name: true } },
        assignedManager: { select: { id: true, name: true } },
        driver: { select: { id: true, fullName: true } },
        truck: { select: { id: true, vehicleNumber: true } },
        branch: { select: { id: true, name: true, documentGraceDays: true } },
        expenses: {
          select: {
            id: true,
            contractorId: true,
            expenseType: true,
            amount: true,
          },
        },
      },
      orderBy: {
        carrierExpectedPaymentDate: {
          sort: "asc",
          nulls: "last",
        },
      },
      take: 200,
    });

    // Автоматическая синхронизация дат из транспортных этапов
    // Если emptyContainerReturnDate/documentSubmissionDate пустые, но этапы существуют — подтягиваем
    const syncPromises = orders.map(async (o) => {
      const needsSync: string[] = [];
      if (!o.emptyContainerReturnDate) needsSync.push("RETURNED_EMPTY");
      if (!o.documentSubmissionDate) needsSync.push("SUBMITTED_DOCS");

      if (needsSync.length === 0) return;

      try {
        const stages = await db.transportStage.findMany({
          where: { orderId: o.id, stageType: { in: needsSync } },
          select: { stageType: true, stageDatetime: true },
        });
        const updateData: any = {};
        for (const s of stages) {
          if (s.stageDatetime) {
            const d = new Date(s.stageDatetime);
            const dateOnly = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
            if (s.stageType === "RETURNED_EMPTY") {
              o.emptyContainerReturnDate = dateOnly;
              updateData.emptyContainerReturnDate = dateOnly;
            } else if (s.stageType === "SUBMITTED_DOCS") {
              o.documentSubmissionDate = dateOnly;
              updateData.documentSubmissionDate = dateOnly;
            }
          }
        }
        if (Object.keys(updateData).length > 0) {
          await db.order.update({ where: { id: o.id }, data: updateData });
          console.log("[payment-calendar GET] Synced dates for", o.orderNumber, Object.keys(updateData));
        }
      } catch (err: any) {
        console.error("[payment-calendar GET] Sync error for", o.orderNumber, err.message);
      }
    });

    // Fire-and-forget для синхронизации
    if (syncPromises.length > 0) {
      Promise.all(syncPromises).catch(() => {});
    }

    // Синхронный пересчёт и корректировка дат в ответе
    // Пересчитываем carrierExpectedPaymentDate для всех заказов с нужными данными
    // и сразу обновляем объекты в памяти перед отправкой ответа
    for (const o of orders) {
      if (!o.carrierExpectedPaymentDate) continue;
      const storedDate = new Date(o.carrierExpectedPaymentDate);
      // Если дата уже выпадает на рабочий день и actualDays совпадает — пропускаем
      const storedDateIsWorkingDay = isRussianWorkingDay(storedDate);
      if (storedDateIsWorkingDay) continue;

      // Дата выпадает на выходной/праздник — пересчитываем
      try {
        let actualDays = o.carrierPaymentDays || 0;
        const docDate = o.documentSubmissionDate ? new Date(o.documentSubmissionDate) : null;
        const returnDate = o.emptyContainerReturnDate ? new Date(o.emptyContainerReturnDate) : null;
        const graceDays = (o.branch as any)?.documentGraceDays;

        if (docDate && o.carrierPaymentDays) {
          if (returnDate && graceDays !== null && graceDays !== undefined) {
            const workDaysBetween = countRussianWorkingDays(returnDate, docDate);
            const extraDays = Math.max(0, workDaysBetween - graceDays);
            actualDays = o.carrierPaymentDays + extraDays;
          }

          const expectedPaymentDate = addRussianWorkingDays(docDate, actualDays);
          const dateOnly = new Date(Date.UTC(
            expectedPaymentDate.getFullYear(),
            expectedPaymentDate.getMonth(),
            expectedPaymentDate.getDate()
          ));

          // Обновляем объект в памяти — пользователь увидит правильную дату сразу
          o.carrierExpectedPaymentDate = dateOnly;
          o.carrierActualPaymentDays = actualDays;

          // Асинхронно сохраняем в БД (fire-and-forget)
          db.order.update({
            where: { id: o.id },
            data: {
              carrierExpectedPaymentDate: dateOnly,
              carrierActualPaymentDays: actualDays,
            },
          }).then(() => {
            console.log("[payment-calendar] Auto-recalculated for", o.orderNumber, "actualDays:", actualDays, "date:", dateOnly.toISOString());
          }).catch((err: any) => {
            console.error("[payment-calendar] Recalc DB error for", o.orderNumber, err.message);
          });
        } else if (!docDate) {
          // Нет documentSubmissionDate — просто переносим на следующий рабочий день
          const correctedDate = new Date(storedDate);
          while (!isRussianWorkingDay(correctedDate)) {
            correctedDate.setDate(correctedDate.getDate() + 1);
          }
          const dateOnly = new Date(Date.UTC(correctedDate.getFullYear(), correctedDate.getMonth(), correctedDate.getDate()));
          o.carrierExpectedPaymentDate = dateOnly;

          db.order.update({
            where: { id: o.id },
            data: { carrierExpectedPaymentDate: dateOnly },
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error("[payment-calendar] Recalc error for", o.orderNumber, err.message);
      }
    }

    return NextResponse.json({ orders });
  } catch (error: any) {
    console.error("[payment-calendar] Error:", error);
    return NextResponse.json(
      { error: "Ошибка получения данных", details: error?.message },
      { status: 500 }
    );
  }
}

// PATCH - Обновление полей платежного календаря
// - фактическая дата оплаты
// - статус проблемы с документами / взаимозачёт
export async function PATCH(request: NextRequest) {
  try {
    await ensureMigrations();
    const user = await getServerUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Load production calendar from DB for accurate working day calculations
    await ensureProductionCalendar();

    // Проверяем права: админ или пользователь с правом редактирования ORDERS
    const canEdit = user.role === "ADMIN" || await hasPermission(user, "ORDERS", "canEdit");
    if (!canEdit) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, carrierActualPaymentDate, paymentIssueType, paymentIssueStatus, paymentIssueComment, carrierPaymentDays, carrierExpectedPaymentDate, paymentIssueResolution, resolutionComment, managerComment, emptyContainerReturnDate, documentSubmissionDate } = body;

    if (!orderId) {
      return NextResponse.json({ error: "Не указан ID заявки" }, { status: 400 });
    }

    // Проверяем, что заявка существует
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        branchId: true,
        orderNumber: true,
        carrierPaymentDays: true,
        carrierActualPaymentDays: true,
        carrierExpectedPaymentDate: true,
        documentSubmissionDate: true,
        emptyContainerReturnDate: true,
        containerNumber: true,
        carrier: { select: { id: true, name: true } },
        branch: { select: { documentGraceDays: true } },
        assignedManager: {
          select: {
            id: true,
            name: true,
            email: true,
            dismissalDate: true,
            phones: { where: { isPrimary: true }, select: { phone: true, label: true }, take: 1 },
          }
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    // Не-админы могут редактировать только заявки своего филиала
    if (user.role !== "ADMIN" && order.branchId !== user.branchId) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    // Формируем данные для обновления
    const updateData: any = {
      updatedAt: new Date(),
    };

    // Обновляем фактическую дату оплаты если передана
    if (carrierActualPaymentDate !== undefined) {
      updateData.carrierActualPaymentDate = carrierActualPaymentDate ? new Date(carrierActualPaymentDate) : null;
    }

    // Редактирование даты сдачи порожнего и даты сдачи документов (только для админа)
    if (user.role === "ADMIN") {
      if (emptyContainerReturnDate !== undefined) {
        const dateVal = emptyContainerReturnDate ? new Date(emptyContainerReturnDate) : null;
        if (dateVal) {
          updateData.emptyContainerReturnDate = new Date(Date.UTC(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate()));
        } else {
          updateData.emptyContainerReturnDate = null;
        }
        // Синхронизируем datetime в этапе RETURNED_EMPTY
        // stageDatetime хранится как строка в формате "YYYY-MM-DDTHH:mm"
        try {
          const returnStage = await db.transportStage.findFirst({
            where: { orderId: order.id, stageType: "RETURNED_EMPTY" },
          });
          if (returnStage) {
            // Берём только дату, время оставляем как было в этапе или ставим 00:00
            const existingTime = returnStage.stageDatetime?.match(/T(\d{2}:\d{2})/)?.[1] || "00:00";
            const newDatetime = dateVal
              ? `${dateVal.getUTCFullYear()}-${String(dateVal.getUTCMonth() + 1).padStart(2, '0')}-${String(dateVal.getUTCDate()).padStart(2, '0')}T${existingTime}`
              : null;
            console.log("[payment-calendar PATCH] Syncing RETURNED_EMPTY stage:", returnStage.id, "newDatetime:", newDatetime, "oldDatetime:", returnStage.stageDatetime);
            await db.transportStage.update({
              where: { id: returnStage.id },
              data: { stageDatetime: newDatetime },
            });
          } else if (dateVal) {
            // Этап не существует — создаём его
            const newDatetime = `${dateVal.getUTCFullYear()}-${String(dateVal.getUTCMonth() + 1).padStart(2, '0')}-${String(dateVal.getUTCDate()).padStart(2, '0')}T00:00`;
            console.log("[payment-calendar PATCH] Creating RETURNED_EMPTY stage for order:", order.id, "datetime:", newDatetime);
            await db.transportStage.create({
              data: {
                orderId: order.id,
                stageType: "RETURNED_EMPTY",
                stageDatetime: newDatetime,
                recordedBy: user.id,
              },
            });
          }
        } catch (syncErr: any) {
          console.error("[payment-calendar PATCH] Error syncing RETURNED_EMPTY stage:", syncErr.message);
        }
      }
      if (documentSubmissionDate !== undefined) {
        const dateVal = documentSubmissionDate ? new Date(documentSubmissionDate) : null;
        if (dateVal) {
          updateData.documentSubmissionDate = new Date(Date.UTC(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate()));
        } else {
          updateData.documentSubmissionDate = null;
        }
        // Синхронизируем datetime в этапе SUBMITTED_DOCS
        // stageDatetime хранится как строка в формате "YYYY-MM-DDTHH:mm"
        try {
          const docStage = await db.transportStage.findFirst({
            where: { orderId: order.id, stageType: "SUBMITTED_DOCS" },
          });
          if (docStage) {
            const existingTime = docStage.stageDatetime?.match(/T(\d{2}:\d{2})/)?.[1] || "00:00";
            const newDatetime = dateVal
              ? `${dateVal.getUTCFullYear()}-${String(dateVal.getUTCMonth() + 1).padStart(2, '0')}-${String(dateVal.getUTCDate()).padStart(2, '0')}T${existingTime}`
              : null;
            console.log("[payment-calendar PATCH] Syncing SUBMITTED_DOCS stage:", docStage.id, "newDatetime:", newDatetime, "oldDatetime:", docStage.stageDatetime);
            await db.transportStage.update({
              where: { id: docStage.id },
              data: { stageDatetime: newDatetime },
            });
          } else if (dateVal) {
            // Этап не существует — создаём его
            const newDatetime = `${dateVal.getUTCFullYear()}-${String(dateVal.getUTCMonth() + 1).padStart(2, '0')}-${String(dateVal.getUTCDate()).padStart(2, '0')}T00:00`;
            console.log("[payment-calendar PATCH] Creating SUBMITTED_DOCS stage for order:", order.id, "datetime:", newDatetime);
            await db.transportStage.create({
              data: {
                orderId: order.id,
                stageType: "SUBMITTED_DOCS",
                stageDatetime: newDatetime,
                recordedBy: user.id,
              },
            });
          }
        } catch (syncErr: any) {
          console.error("[payment-calendar PATCH] Error syncing SUBMITTED_DOCS stage:", syncErr.message);
        }
      }
    }

    // Обработка статуса решения проблемы с документами
    // (доступно для менеджеров и админов)
    if (paymentIssueResolution !== undefined) {
      updateData.paymentIssueResolution = paymentIssueResolution || null;

      if (paymentIssueResolution === "PENDING_REVIEW") {
        // Менеджер отправляет на проверку — сохраняем комментарий менеджера
        updateData.paymentIssueResolution = "PENDING_REVIEW";
        if (managerComment) {
          updateData.paymentIssueManagerComment = managerComment;
        }
      } else if (paymentIssueResolution === "RESOLVED") {
        // Админ принимает — сбрасываем все поля проблемы
        updateData.paymentIssueType = null;
        updateData.paymentIssueStatus = null;
        updateData.paymentIssueComment = null;
        updateData.paymentIssueResolution = null;
        updateData.paymentIssueManagerComment = null;
      } else if (paymentIssueResolution === "SENT_BACK") {
        // Админ отправляет на доработку
        updateData.paymentIssueResolution = "SENT_BACK";
        // Добавляем комментарий админа если передан
        if (resolutionComment) {
          updateData.paymentIssueComment = resolutionComment;
        }
      }
    }

    // Обновляем срок оплаты и пересчитываем планируемую дату (только для админа)
    if (user.role === "ADMIN" && (carrierPaymentDays !== undefined || carrierExpectedPaymentDate !== undefined)) {
      if (carrierPaymentDays !== undefined) {
        updateData.carrierPaymentDays = carrierPaymentDays;

        // Синхронный пересчёт планируемой даты оплаты
        if (carrierPaymentDays !== null && order.documentSubmissionDate) {
          try {
            const docDate = new Date(order.documentSubmissionDate);
            let actualDays = carrierPaymentDays;

            const returnDate = order.emptyContainerReturnDate ? new Date(order.emptyContainerReturnDate) : null;
            const graceDays = order.branch?.documentGraceDays;

            if (returnDate && graceDays !== null && graceDays !== undefined) {
              const workDaysBetween = countRussianWorkingDays(returnDate, docDate);
              const extraDays = Math.max(0, workDaysBetween - graceDays);
              actualDays = carrierPaymentDays + extraDays;
            }

            const expectedPaymentDate = addRussianWorkingDays(docDate, actualDays);
            updateData.carrierExpectedPaymentDate = new Date(Date.UTC(
              expectedPaymentDate.getFullYear(),
              expectedPaymentDate.getMonth(),
              expectedPaymentDate.getDate()
            ));
            updateData.carrierActualPaymentDays = actualDays;

            console.log("[payment-calendar PATCH] Recalculated carrierExpectedPaymentDate:", updateData.carrierExpectedPaymentDate.toISOString(), "actualDays:", actualDays);
          } catch (calcError: any) {
            console.error("[payment-calendar PATCH] Error recalculating payment date:", calcError.message);
          }
        }
      }
      if (carrierExpectedPaymentDate !== undefined) {
        if (carrierExpectedPaymentDate) {
          const ensured = ensureRussianWorkingDay(new Date(carrierExpectedPaymentDate));
          updateData.carrierExpectedPaymentDate = new Date(Date.UTC(ensured.getFullYear(), ensured.getMonth(), ensured.getDate()));
        } else {
          updateData.carrierExpectedPaymentDate = null;
        }
      }
    }

    // Если админ принимает решение — сбрасываем resolution-related поля
    if (user.role === "ADMIN" && paymentIssueResolution === "RESOLVED") {
      updateData.paymentIssueType = null;
      updateData.paymentIssueStatus = null;
      updateData.paymentIssueComment = null;
      updateData.paymentIssueResolution = null;
      updateData.paymentIssueManagerComment = null;
    }

    // Флаг для отправки уведомления
    let shouldNotifyManager = false;
    let notifyManagerId: string | null = null;
    let managerDismissed = false;
    let issueStatusText = "";

    // Обновляем статус проблемы с документами (только для админа)
    if (user.role === "ADMIN") {
      if (paymentIssueType !== undefined) {
        updateData.paymentIssueType = paymentIssueType || null;

        // Если выбран Взаимозачёт - автоматически ставим дату и выбираем для утверждения
        if (paymentIssueType === "OFFSET") {
          // Устанавливаем фактическую дату = планируемой
          if (order.carrierExpectedPaymentDate) {
            updateData.carrierActualPaymentDate = order.carrierExpectedPaymentDate;
          }
          updateData.paymentIssueStatus = null;
          updateData.paymentIssueComment = null;
        }
        // Если выбрана Проблема с документами
        else if (paymentIssueType === "DOCUMENT_ISSUE") {
          // paymentIssueStatus должен быть передан
          if (paymentIssueStatus !== undefined) {
            updateData.paymentIssueStatus = paymentIssueStatus || null;

            // Карта статусов для текста уведомления
            const statusLabels: Record<string, string> = {
              "STOP": "Стоп",
              "NO_ACTS": "Нет актов",
              "NO_RECEIPTS": "Нет чеков",
              "NO_DSN": "Нет ДСН",
              "PROBLEM": "Проблема",
              "CLAIM": "Претензия",
            };
            issueStatusText = statusLabels[paymentIssueStatus || ""] || paymentIssueStatus || "";
          }
          if (paymentIssueComment !== undefined) {
            updateData.paymentIssueComment = paymentIssueComment || null;
          }

          // Отмечаем, что нужно отправить уведомление
          shouldNotifyManager = true;

          // Проверяем ответственного менеджера
          if (order.assignedManager) {
            if (order.assignedManager.dismissalDate) {
              // Менеджер уволен - нужно уведомить администратора
              managerDismissed = true;
            } else {
              // Менеджер активен - отправляем уведомление ему
              notifyManagerId = order.assignedManager.id;
            }
          } else {
            // Нет ответственного менеджера - уведомляем администраторов
            managerDismissed = true;
          }
        }
        // Если сбрасываем статус
        else {
          updateData.paymentIssueStatus = null;
          updateData.paymentIssueComment = null;
        }
      }
    }

    // Отправляем уведомления для workflow решения проблемы
    if (paymentIssueResolution === "PENDING_REVIEW") {
      // Менеджер отправил на проверку → уведомляем всех активных админов
      const orderDisplayName = order.orderNumber || order.containerNumber || orderId.slice(0, 8);
      const carrierName = order.carrier?.name || "Перевозчик";
      const admins = await db.user.findMany({
        where: { role: "ADMIN", dismissalDate: null },
        select: { id: true },
      });
      if (admins.length > 0) {
        await createNotificationsBatch(
          admins.map(admin => ({
            userId: admin.id,
            type: "PAYMENT_ISSUE_REVIEW",
            title: "Документы исправлены",
            message: `Менеджер отправил заявку ${orderDisplayName} (${carrierName}) на проверку`,
            data: {
              orderId,
              orderNumber: order.orderNumber,
              containerNumber: order.containerNumber,
              carrierName,
            },
          }))
        );
      }
    }

    if (paymentIssueResolution === "SENT_BACK" && order.assignedManager && !order.assignedManager.dismissalDate) {
      // Админ отправил на доработку → уведомляем менеджера
      const orderDisplayName = order.orderNumber || order.containerNumber || orderId.slice(0, 8);
      await createNotification({
        userId: order.assignedManager.id,
        type: "PAYMENT_ISSUE_SENT_BACK",
        title: "Документы не приняты",
        message: `Заявка ${orderDisplayName} отправлена на доработку${resolutionComment ? `: ${resolutionComment}` : ""}`,
        data: {
          orderId,
          orderNumber: order.orderNumber,
          containerNumber: order.containerNumber,
          resolutionComment,
        },
      });
    }

    const updated = await db.order.update({
      where: { id: orderId },
      data: updateData,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        carrierActualPaymentDate: true,
        paymentIssueType: true,
        paymentIssueStatus: true,
        paymentIssueComment: true,
        paymentIssueResolution: true,
        paymentIssueManagerComment: true,
      },
    });

    // Отправляем уведомления после успешного обновления
    if (shouldNotifyManager) {
      const orderDisplayName = order.orderNumber || order.containerNumber || orderId.slice(0, 8);
      const carrierName = order.carrier?.name || "Перевозчик";

      if (managerDismissed) {
        // Менеджер уволен или не назначен - уведомляем всех администраторов
        const admins = await db.user.findMany({
          where: {
            role: "ADMIN",
            dismissalDate: null, // Только активные администраторы
          },
          select: { id: true },
        });

        if (admins.length > 0) {
          await createNotificationsBatch(
            admins.map(admin => ({
              userId: admin.id,
              type: "PAYMENT_ISSUE_FIRED_MANAGER",
              title: "Проблемная заявка: менеджер уволен",
              message: `Заявка ${orderDisplayName} (${carrierName}) переведена в "${issueStatusText}", но ответственный менеджер уволен. Кому направить заявку на исправление?`,
              data: {
                orderId: orderId,
                orderNumber: order.orderNumber,
                containerNumber: order.containerNumber,
                carrierName: carrierName,
                paymentIssueStatus: paymentIssueStatus,
                paymentIssueComment: paymentIssueComment,
                firedManagerId: order.assignedManager?.id || null,
                firedManagerName: order.assignedManager?.name || null,
              },
            })),
          );
        }
      } else if (notifyManagerId) {
        // Отправляем уведомление только ответственному менеджеру
        await createNotification({
          userId: notifyManagerId,
          type: "PAYMENT_ISSUE_ASSIGNED",
          title: `Проблема с заявкой: ${issueStatusText}`,
          message: `Заявка ${orderDisplayName} (${carrierName}) переведена в статус "${issueStatusText}"${paymentIssueComment ? `: ${paymentIssueComment}` : ""}`,
          data: {
            orderId: orderId,
            orderNumber: order.orderNumber,
            containerNumber: order.containerNumber,
            carrierName: carrierName,
            paymentIssueStatus: paymentIssueStatus,
            paymentIssueComment: paymentIssueComment,
          },
        });
      }
    }

    return NextResponse.json({ success: true, order: updated });
  } catch (error: any) {
    console.error("[payment-calendar PATCH] Error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления данных", details: error?.message },
      { status: 500 }
    );
  }
}

// POST - Массовое утверждение оплат (только для админа)
// Меняет статус выбранных заявок на PAID
// Требуется наличие фактической даты оплаты (carrierActualPaymentDate)
export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Load production calendar from DB for accurate working day calculations
    await ensureProductionCalendar();

    // Только админ может утверждать оплаты
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Только администратор может утверждать оплаты" }, { status: 403 });
    }

    const body = await request.json();
    const { orderIds } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "Не указаны заявки для утверждения" }, { status: 400 });
    }

    // Получаем заявки для проверки
    const orders = await db.order.findMany({
      where: {
        id: { in: orderIds },
        status: "WAITING_PAYMENT",
      },
      select: { 
        id: true, 
        orderNumber: true, 
        status: true,
        carrierActualPaymentDate: true,
      },
    });

    if (orders.length === 0) {
      return NextResponse.json({ 
        error: "Нет заявок для утверждения. Убедитесь что заявки имеют статус 'Ожидает оплату' и выбраны галочками." 
      }, { status: 400 });
    }

    // Разделяем на те, у которых есть дата оплаты и те, у которых нет
    const ordersWithDate = orders.filter(o => o.carrierActualPaymentDate);
    const ordersWithoutDate = orders.filter(o => !o.carrierActualPaymentDate);

    if (ordersWithoutDate.length > 0) {
      const numbers = ordersWithoutDate.map(o => o.orderNumber || o.id.slice(0, 8)).join(", ");
      return NextResponse.json({ 
        error: `Не указана фактическая дата оплаты для заявок: ${numbers}. Установите дату перед утверждением.` 
      }, { status: 400 });
    }

    // Меняем статус на PAID для всех выбранных заявок — атомарная операция
    const updatedOrderIds = ordersWithDate.map(o => o.id);
    
    const result = await db.$transaction(async (tx) => {
      return await tx.order.updateMany({
        where: { 
          id: { in: updatedOrderIds },
          status: "WAITING_PAYMENT", // Двойная проверка статуса
        },
        data: {
          status: "PAID",
          updatedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      updatedCount: ordersWithDate.length,
      updatedOrders: ordersWithDate,
    });
  } catch (error: any) {
    console.error("[payment-calendar POST] Error:", error);
    return NextResponse.json(
      { error: "Ошибка утверждения оплат", details: error?.message },
      { status: 500 }
    );
  }
}
