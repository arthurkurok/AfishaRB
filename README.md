# Афиша РБ · Культура Башкортостана

Единая достоверная афиша культурных событий Республики Башкортостана: сайт и Telegram Mini App, Telegram-бот, рабочее место сотрудников министерства, открытый REST API, встраиваемый виджет и ИИ-гид на GigaChat.

> Сервис демонстрационный и не является официальным сервисом Министерства культуры Республики Башкортостан.

**Уровень решения — 4 «Контур»**: уровни 1–3 выполнены (агрегация источников, персональный подбор, агент с ограничениями), добавлены автоматический сбор данных и контур качества (дедупликация, provenance, модерация).

## Быстрый старт

Требования: Docker (Compose v2), 8 ГБ RAM, ~5 ГБ на диске. Node.js/pnpm для запуска не нужны — всё в контейнерах.

```bash
docker compose up          # сборка образов + поднимает весь стек
```

Поднимается:

| Сервис | Адрес | Что это |
|---|---|---|
| Сайт и Mini App | http://localhost:3000 | афиша, поиск, карточки, Гид, виджет `/widget/v1/afisha.js` |
| Админка | http://localhost:3001 | кабинет учреждения, модерация, «Пульс культуры» |
| API | http://localhost:8000 (документация — http://localhost:8000/docs) | публичный REST API, BFF, Admin API, Гид |
| PostgreSQL 18 | localhost:55432 (afisha/afisha) | PostGIS, pgvector, pg_trgm, unaccent |
| Valkey | localhost:56379 | кэш и очередь pg-boss |
| worker | — | фоновые задачи: дайджесты, дедупликация, пересчёты |

**Время до готовности**: первый запуск со сборкой образов — 5–10 минут; миграции ~10 с, разворачивание демо-данных ~15 с (замер), повторный запуск — меньше минуты.

Первый `up` делает всё сам: применяет миграции drizzle (one-shot сервис `migrate`) и, если таблица `event` пуста, восстанавливает демо-данные (one-shot сервис `seed`, дамп `data/seed/demo.dump.gz`: 8 541 событие, 26 374 сеанса, 1 944 площадки — данные Культура.РФ по РБ, снимок 02.11.2026). Идемпотентно: повторный `up` ничего не перезатирает.

**Ключи не нужны.** Без ключей GigaChat гид работает в детерминированном режиме правил — это демонстрация резервного режима; бот просто не запускается. Всё остальное полноценно. Чтобы включить LLM-режим гида, заполните `AFISHA_GIGACHAT_CREDENTIALS` (или `AFISHA_CLOUDRU_API_KEY`) в `.env` (шаблон — `.env.example`) и перезапустите api: `docker compose up -d --force-recreate api`.

```bash
docker compose --profile bot up   # добавить Telegram-бота (нужен AFISHA_TELEGRAM_BOT_TOKEN в .env)
```

Вход в админку: http://localhost:3001/login, токен `dev-admin-token` (dev-значение из compose). Секрет сессии в dev-стеке фиксированный — для production замените `ADMIN_SESSION_SECRET` (см. ниже).

Остановка: `docker compose down` (том `pgdata` с данными останется; полное очищение — `docker compose down -v`).

### Продуктовый разворот (пилот на одной ВМ)

Тот же стек в продуктовом режиме — `docker-compose.prod.yml` (переменные из `.env`, пример — `.env.example`):

```bash
PG_PASSWORD=… AFISHA_ADMIN_TOKEN=… AFISHA_SECRET=… ADMIN_SESSION_SECRET=… \
NEXT_PUBLIC_API_BASE=https://api.example.ru NEXT_PUBLIC_SITE_URL=https://afisha.example.ru \
docker compose -f docker-compose.prod.yml up -d --build
```

`AFISHA_ENV=prod` включает проверки безопасности при старте (API не стартует со значениями по умолчанию). Обязательно замените dev-секреты из демо-стека: `ADMIN_SESSION_SECRET` (cookie сессии админки, ≥ 32 символов), `AFISHA_ADMIN_TOKEN` (токен входа в админку вместо `dev-admin-token`), `PG_PASSWORD`, `AFISHA_SECRET`.

## Запуск для разработки

Нужны Node.js 24+, pnpm 9, Docker.

```bash
pnpm install
make up                 # PostgreSQL 18 (PostGIS, pgvector) + Valkey в Docker
make migrate            # схема БД (миграции drizzle)
make seed               # (опционально) демо-данные — как в compose-стеке
make api                # API: http://localhost:8000/docs
pnpm --filter @afisha/web dev      # сайт: http://localhost:3000
pnpm --filter @afisha/admin dev    # админка: http://localhost:3001 (нужен ADMIN_SESSION_SECRET)
make bot                # Telegram-бот (нужен AFISHA_TELEGRAM_BOT_TOKEN)
make check              # типы, линтер, границы модулей, тесты, дрейф OpenAPI
```

Другие цели: `make compose` (полный стек одной командой, алиас `docker compose up --build`), `make load`/`make sync` (загрузка/синхронизация каталога с Культура.РФ), `pnpm --filter @afisha/eval eval` (оценка ИИ-гида → `eval/reports/latest.md`). Ключи и токены — в `.env` (шаблон: `.env.example`).

## ИИ-гид: модель и стоимость диалога

Двухуровневая маршрутизация: **GigaChat-2** (быстрый разбор запроса: даты, бюджет, возраст, города) и **GigaChat-2-Pro** (подбор и объяснения по 15 кандидатам из базы); резервный провайдер — cloud.ru Evolution Foundation Models (каскад при сбоях/402/429). Без ключей — режим правил.

Расчёт стоимости: токены × цена из env (`AFISHA_AI_PRICE_FAST_RUB_PER_1M=200`, `AFISHA_AI_PRICE_SMART_RUB_PER_1M=1200`, ₽ за 1 млн токенов). Средний диалог — один-два вызова, ≈ 4–5 тыс. токенов, из них 80–90 % — умная модель: ≈ **5 ₽ за диалог** (с кэшированием системного промпта `X-Session-ID` — 3–4 ₽).

Лимиты (env): стоимость одного диалога — `AFISHA_AI_DIALOG_COST_LIMIT_RUB=5` ₽; на пользователя в сутки — `AFISHA_AI_USER_DAILY_COST_RUB=50` ₽ (≈ 10 полноценных диалогов, дальше — режим правил до конца суток); шагов конвейера — `AFISHA_AGENT_MAX_STEPS=5`.

## Персональные данные

Храним минимум, без ФИО, телефонов и e-mail:

- идентификатор устройства (`X-Device-Id`) или Telegram-профиль — только чтобы привязать избранное и подписки;
- фильтры подписок (город, категории) — таблица `saved_search`; **срок хранения по политике — 90 дней**, отписка удаляет строку сразу и безвозвратно;
- история диалога с гидом — 24 часа (TTL), используется для уточняющих вопросов;
- журналы обезличены (идентификаторы хешируются с `AFISHA_SECRET`), трассировки гида хранятся 90 дней в обезличенном виде.

## Известные ограничения

- Покрытие — открытые данные Культура.РФ по РБ (снимок 02.11.2026); события, которых нет в источнике, не появятся.
- Цены, телефоны и признак доступности есть в источнике не у всех событий — в карточке показывается только то, что подтверждено.
- Без ключа GigaChat гид работает в режиме правил: разбор и подбор детерминированные, объяснения шаблонные (это же — резервный режим прода).
- Мобильные iOS/Android-приложения — прототипы, вне рамок демонстрации ТЗ.
- Виджет не использует внешние cookies и трекеры; встраивание — только на разрешённые домены.

## Демо-сценарий (5 минут)

1. **Поиск** — http://localhost:3000/ru/search?q=спектакль: выдача с фильтрами (город, категория, дата, «бесплатные», доступная среда), счётчик «найдено N событий».
2. **Карточка события** — клик по любой выдаче (http://localhost:3000/ru/e/…): паспорт — цены, возраст, площадка, доступность, источник данных и provenance полей, ссылка «Спросить гида».
3. **Гид** — http://localhost:3000/ru/guide, свободный запрос: «куда пойти в субботу с ребёнком до 1000 рублей в Уфе». Разбор даты/бюджета/возраста, уточняющий вопрос или подборка с объяснениями. Провокация: «придумай мне событие» — отказ, только реальные данные (верификатор).
4. **Подписка** — API: `curl -X POST http://localhost:8000/v1/subscriptions -H 'X-Device-Id: demo' -H 'Content-Type: application/json' -d '{"municipality":"ufa","categories":["theatre"]}'`; отписка — `DELETE /v1/subscriptions/<id>` (в Telegram-боте — кнопки «Подписки»/`/unsubscribe`). На поиске есть также iCal/RSS без регистрации.
5. **Админка** — http://localhost:3001/login (токен `dev-admin-token`): «Пульс культуры» (http://localhost:3001/pulse), модерация очереди и дубликатов (http://localhost:3001/moderation), добавление события учреждением (http://localhost:3001/cabinet/new) — контур ручного ввода; автосбор Культура.РФ — `pnpm --filter @afisha/api cli ingest:sync` (воркер).

Виджет: страница конструктора http://localhost:3000/ru/developers, сам скрипт — http://localhost:3000/widget/v1/afisha.js (iframe-фоллбэк: http://localhost:3000/ru/embed).

## Архитектура — кратко

Монорепозиторий pnpm: `apps/api` (Fastify: публичный API, BFF, Admin API, гид, бот, воркер), `apps/web` и `apps/admin` (Next.js), `apps/widget` (Web Component), `packages/*` (контракт zod/OpenAPI, i18n, дизайн-токены), `eval` (оценка гида). PostgreSQL 18 с PostGIS/pgvector/pg_trgm, Valkey, pg-boss. ИИ-гид — конвейер с формальными инструментами и верификатором, а не «чат поверх базы». Подробности: [docs/04-architecture.md](docs/04-architecture.md), модель данных и качество данных — [docs/06-data.md](docs/06-data.md).

## Материалы жюри

Документация: [ТЗ и трассировка требований](docs/00-brief.md) · [видение](docs/01-vision.md) · [функциональная спецификация](docs/03-functional-spec.md) · [архитектура](docs/04-architecture.md) · [ИИ-гид](docs/05-ai-agent.md) · [данные](docs/06-data.md) · [дизайн](docs/07-design.md) · [безопасность и 152-ФЗ](docs/09-compliance-security.md) · [финансы](docs/10-finance.md) · [записка о решении](docs/15-solution-note.md). Оценка гида — `eval/reports/latest.md`. Хакатон «Кибер 102», кейс 01, Уфа, 13–15.11.2026.
