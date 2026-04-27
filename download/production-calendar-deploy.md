# Производственный календарь — Deploy Instructions

## Что уже сделано (через PostgreSQL)
1. ✅ Создана таблица `ProductionCalendar` в БД
2. ✅ Заполнены праздничные и выходные дни РФ на 2025-2027 годы
3. ✅ Пересчитаны даты оплаты для всех заявок 2026 года (202 заказа обновлено)

## Что нужно задеплоить (нужен SSH-доступ)

### Файлы для загрузки на сервер (в /home/ubuntuuser/ct-app/):

1. `src/lib/production-calendar.ts` — утилита расчёта рабочих дней
2. `src/app/api/production-calendar/route.ts` — CRUD API календаря
3. `src/app/api/production-calendar/batch/route.ts` — пакетное обновление
4. `src/app/api/production-calendar/recalculate/route.ts` — пересчёт дат оплаты
5. `src/app/api/production-calendar/days/route.ts` — данные для клиента

### Изменения в существующих файлах:

1. `prisma/schema.prisma` — добавить модель ProductionCalendar
2. `src/app/api/orders/payment-calendar/route.ts` — использовать `addBusinessDays` из `@/lib/production-calendar`

### Порядок деплоя:

```bash
# 1. Скопировать все файлы на сервер
scp -r src/lib/production-calendar.ts ubuntuuser@195.209.208.114:/home/ubuntuuser/ct-app/src/lib/
scp -r src/app/api/production-calendar/ ubuntuuser@195.209.208.114:/home/ubuntuuser/ct-app/src/app/api/

# 2. Подключиться к серверу
ssh ubuntuuser@195.209.208.114

# 3. Добавить модель в Prisma schema
cd /home/ubuntuuser/ct-app

# 4. Сгенерировать Prisma клиент
npx prisma generate

# 5. Пометить миграцию
npx prisma migrate resolve --applied 20260427000000_add_production_calendar

# 6. Деплой
bash deploy-ct.sh
```

### Production Calendar — Данные в БД:

2025: 20 записей (18 нерабочих + 2 перенесённых рабочих)
2026: 18 записей (15 нерабочих + 3 перенесённых рабочих)
2027: 17 записей (15 нерабочих + 2 перенесённых рабочих)

### Праздники РФ 2026:
- 1-8 января: Новогодние каникулы + Рождество
- 23 февраля: День защитника Отечества
- 9 марта: Международный женский день (перенос с воскресенья)
- 1 мая: Праздник Весны и Труда
- 11 мая: День Победы (перенос с субботы)
- 12 июня: День России
- 4 ноября: День народного единства
- 31 декабря: Предновогодний выходной

### Перенесённые рабочие дни 2026:
- 21 февраля (суббота) — к 23 февраля
- 7 марта (суббота) — к 8 марта
- 7 ноября (суббота) — к 4 ноября
