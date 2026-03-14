# 🚛 Система учета контейнерных автоперевозок

Полнофункциональное веб-приложение для управления контейнерными автоперевозками с поддержкой авторизации, двухфакторной аутентификации (2FA), управления заявками и аналитики.

## 📋 Содержание

- [Технологический стек](#технологический-стек)
- [Функционал](#функционал)
- [Структура проекта](#структура-проекта)
- [Установка и запуск](#установка-и-запуск)
- [Настройка окружения](#настройка-окружения)
- [Настройка 2FA](#настройка-2fa)
- [Роли пользователей](#роли-пользователей)
- [API документация](#api-документация)

---

## 🔧 Технологический стек

### Почему выбран этот стек:

| Технология | Обоснование выбора |
|------------|-------------------|
| **Next.js 16** | Full-stack фреймворк с SSR, API routes, отличной производительностью. Позволяет разрабатывать фронтенд и бэкенд в одном проекте. |
| **TypeScript** | Статическая типизация для безопасности кода, лучшей поддержки IDE и предотвращения ошибок на этапе разработки. |
| **Prisma ORM** | Современный ORM с типобезопасностью, автоматической генерацией типов, миграциями и отличным DX (Developer Experience). |
| **SQLite** | Встраиваемая БД, не требует отдельного сервера, идеально для демонстрации. Легко мигрировать на PostgreSQL для production. |
| **NextAuth.js** | Готовое решение для аутентификации с поддержкой сессий, JWT, OAuth и 2FA. Безопасно и проверено временем. |
| **shadcn/ui** | Качественные React компоненты на базе Radix UI с полной кастомизацией. Современный дизайн без лишних зависимостей. |
| **Tailwind CSS** | Utility-first CSS фреймворк для быстрой верстки с поддержкой адаптивности и тем. |
| **Recharts** | React библиотека для графиков, построенная на D3. Простой API и отличная производительность. |
| **Zod** | Схема валидации с автоматической генерацией TypeScript типов. |

---

## ✨ Функционал

### 🔐 Авторизация и безопасность

- **Вход в систему** — логин по email и паролю
- **Регистрация** — создание новых аккаунтов с подтверждением email
- **Двухфакторная аутентификация (2FA)** — поддержка TOTP (Google Authenticator, Authy)
- **Восстановление пароля** — сброс пароля через email
- **Роли** — Администратор и Менеджер с разграничением прав

### 📦 Управление заявками

- Создание, просмотр, редактирование и удаление заявок
- Автоматическая генерация уникального номера заявки
- Фильтрация по статусу, дате, водителю
- Поиск по номеру заявки и контейнера
- Статусы: Новая, В пути, Доставлена, Отменена

### 📚 Справочники (только для Администратора)

- Водители (ФИО, телефон, паспортные данные)
- Транспортные средства (госномер, марка, тип)
- Типы контейнеров (20 футов, 40 футов, рефрижератор и др.)

### 📊 Аналитика и отчеты

- Круговая диаграмма: заявки по статусам
- Линейный график: динамика перевозок за 30 дней
- Экспорт данных в CSV формат

---

## 📁 Структура проекта

```
container-transport/
├── prisma/
│   └── schema.prisma          # Схема базы данных
├── src/
│   ├── app/
│   │   ├── (auth)/            # Группа страниц авторизации
│   │   │   ├── login/         # Страница входа
│   │   │   ├── register/      # Страница регистрации
│   │   │   └── verify-2fa/    # Страница 2FA
│   │   ├── (dashboard)/       # Группа страниц с навигацией
│   │   │   ├── dashboard/     # Главная страница
│   │   │   ├── orders/        # Управление заявками
│   │   │   ├── reports/       # Аналитика и отчеты
│   │   │   ├── directories/   # Справочники
│   │   │   └── profile/       # Профиль пользователя
│   │   ├── api/               # API routes
│   │   │   ├── auth/[...nextauth]/  # NextAuth.js
│   │   │   ├── orders/        # API заявок
│   │   │   ├── drivers/       # API водителей
│   │   │   ├── vehicles/      # API транспорта
│   │   │   └── container-types/ # API типов контейнеров
│   │   ├── layout.tsx         # Корневой layout
│   │   └── page.tsx           # Главная страница
│   ├── components/
│   │   ├── ui/                # shadcn/ui компоненты
│   │   ├── layout/            # Компоненты layout
│   │   │   ├── Sidebar.tsx    # Боковое меню
│   │   │   └── Header.tsx     # Шапка
│   │   └── forms/             # Формы
│   ├── lib/
│   │   ├── db.ts              # Prisma клиент
│   │   ├── auth.ts            # Настройки NextAuth
│   │   ├── utils.ts           # Утилиты
│   │   └── validations.ts     # Zod схемы
│   └── hooks/                 # React hooks
├── public/                    # Статические файлы
├── .env                       # Переменные окружения
├── package.json
└── tsconfig.json
```

---

## 🚀 Установка и запуск

### Предварительные требования

- Node.js 18+ или Bun
- npm, yarn или bun

### Шаги установки

```bash
# 1. Клонировать репозиторий
git clone <repository-url>
cd container-transport

# 2. Установить зависимости
bun install
# или
npm install

# 3. Создать файл .env и настроить переменные окружения
cp .env.example .env

# 4. Инициализировать базу данных
bun run db:push
# или
npm run db:push

# 5. Запустить сервер разработки
bun run dev
# или
npm run dev
```

Приложение будет доступно по адресу: `http://localhost:3000`

---

## ⚙️ Настройка окружения

Создайте файл `.env` в корне проекта:

```env
# База данных
DATABASE_URL="file:./dev.db"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key-here-generate-with-openssl"

# Email (для подтверждения и восстановления пароля)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
EMAIL_FROM="noreply@your-domain.com"

# Опционально: OAuth провайдеры
# GOOGLE_CLIENT_ID=""
# GOOGLE_CLIENT_SECRET=""
```

### Генерация NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

### Настройка Gmail SMTP

1. Включите двухфакторную аутентификацию в Google аккаунте
2. Создайте пароль приложения: Google Account → Security → App passwords
3. Используйте этот пароль в `SMTP_PASSWORD`

---

## 🔐 Настройка двухфакторной аутентификации (2FA)

### Как работает 2FA в приложении

1. **Включение 2FA:**
   - Пользователь заходит в профиль
   - Нажимает "Включить 2FA"
   - Приложение генерирует секретный ключ (TOTP)
   - QR-код отображается для сканирования в Google Authenticator
   - Пользователь сканирует код и вводит первый OTP для подтверждения

2. **Вход с 2FA:**
   - Пользователь вводит email и пароль
   - Если 2FA включена, перенаправляется на страницу ввода кода
   - Вводит 6-значный код из Google Authenticator
   - При успехе — вход в систему

3. **Отключение 2FA:**
   - В профиле нажимает "Отключить 2FA"
   - Вводит текущий OTP код для подтверждения

### Приложения-аутентификаторы

- Google Authenticator (iOS, Android)
- Authy (iOS, Android, Desktop)
- Microsoft Authenticator
- 1Password

### Техническая реализация

2FA реализована с использованием протокола **TOTP (Time-based One-Time Password)** по стандарту RFC 6238:

- Алгоритм: HMAC-SHA1
- Длина кода: 6 цифр
- Период обновления: 30 секунд
- Библиотека: `otplib`

---

## 👥 Роли пользователей

### Администратор

- Полный доступ ко всем функциям
- Управление справочниками (водители, транспорт, типы контейнеров)
- Просмотр и редактирование всех заявок
- Доступ к аналитике и отчетам
- Управление пользователями

### Менеджер

- Создание и редактирование заявок
- Просмотр справочников (только чтение)
- Просмотр своих заявок
- Доступ к аналитике (только чтение)
- Управление своим профилем

---

## 📊 Схема базы данных

### Основные таблицы

```sql
-- Пользователи
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password TEXT,
  role TEXT DEFAULT 'MANAGER',
  is_email_verified BOOLEAN DEFAULT FALSE,
  is_two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret TEXT,
  image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Заявки
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  loading_datetime DATETIME NOT NULL,
  loading_city TEXT NOT NULL,
  loading_address TEXT NOT NULL,
  unloading_city TEXT NOT NULL,
  unloading_address TEXT NOT NULL,
  container_number TEXT NOT NULL,
  container_type_id TEXT NOT NULL,
  cargo_weight REAL NOT NULL,
  status TEXT DEFAULT 'NEW',
  driver_id TEXT,
  vehicle_id TEXT,
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Водители
CREATE TABLE drivers (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  license_number TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Транспортные средства
CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  vehicle_number TEXT NOT NULL,
  trailer_number TEXT,
  brand TEXT,
  vehicle_type TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Типы контейнеров
CREATE TABLE container_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📖 API документация

### Аутентификация

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/register` | Регистрация нового пользователя |
| POST | `/api/auth/forgot-password` | Запрос на восстановление пароля |
| POST | `/api/auth/reset-password` | Сброс пароля по токену |
| POST | `/api/auth/verify-email` | Подтверждение email |
| POST | `/api/auth/2fa/enable` | Включение 2FA |
| POST | `/api/auth/2fa/disable` | Отключение 2FA |
| POST | `/api/auth/2fa/verify` | Проверка OTP кода |

### Заявки

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/orders` | Получить список заявок |
| GET | `/api/orders/:id` | Получить заявку по ID |
| POST | `/api/orders` | Создать новую заявку |
| PUT | `/api/orders/:id` | Обновить заявку |
| DELETE | `/api/orders/:id` | Удалить заявку |
| GET | `/api/orders/export` | Экспорт заявок в CSV |

### Справочники

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/drivers` | Список водителей |
| POST | `/api/drivers` | Добавить водителя (Admin) |
| PUT | `/api/drivers/:id` | Редактировать водителя (Admin) |
| DELETE | `/api/drivers/:id` | Удалить водителя (Admin) |
| GET | `/api/vehicles` | Список транспорта |
| POST | `/api/vehicles` | Добавить транспорт (Admin) |
| GET | `/api/container-types` | Список типов контейнеров |
| POST | `/api/container-types` | Добавить тип (Admin) |

---

## 🎨 Дизайн

Приложение выполнено в светлых тонах с минималистичным дизайном:

- **Цветовая схема:** Светлый фон, акцентные цвета для действий
- **Типографика:** Inter font для текста, четкая иерархия заголовков
- **Компоненты:** shadcn/ui с базовой кастомизацией
- **Адаптивность:** Полная поддержка мобильных устройств
- **Уведомления:** Toast-уведомления для обратной связи

---

## 📝 Лицензия

MIT License

---

## 🤝 Автор

Разработано с использованием современных best practices в веб-разработке.
