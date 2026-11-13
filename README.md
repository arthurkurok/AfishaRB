# Афиша РБ · Культура Башкортостана

Единая достоверная афиша культурных событий Республики Башкортостан. Веб, Telegram-бот и Mini App, нативные iOS (Swift) и Android (Kotlin), открытый REST API, встраиваемый виджет, ИИ-гид на GigaChat — пчела Бал.

Кейс 01 Министерства культуры РБ на хакатоне **«Кибер 102»** (13–15.11.2026, Уфа). Делаем не MVP, а продукт, готовый к эксплуатации.

Стек: TypeScript на Node.js 24 для бэкенда (Fastify, Drizzle, pg-boss, grammY) и всех веб-частей (Next.js, виджет), Swift и Kotlin для мобильных приложений, PostgreSQL 18 с PostGIS и pgvector. Монорепозиторий на pnpm workspaces; подробности — [04-architecture](docs/04-architecture.md) §17.

## Ближайшие даты

| Дата | Событие |
|---|---|
| 02–12.11 | Разработка продукта: этапы M0–M3 с гейтами жюри, старт мобильных приложений; доступы, данные, eval-наборы, питч (`docs/11-roadmap.md`, фаза П) |
| 12.11 | Гейт жюри PREP |
| 13.11 | Старт, полное ТЗ и адаптация под него, чек-пойнт 1 |
| 14.11 | Чек-пойнты 2–3, заморозка в 21:00, загрузка до 23:00 |
| 15.11, 10:00–14:00 | Защита |

## План

| Документ | О чём |
|---|---|
| [00-brief](docs/00-brief.md) | ТЗ дословно и матрица трассировки требований |
| [01-vision](docs/01-vision.md) | Видение, персоны, 12 отличий, принципы |
| [02-market-research](docs/02-market-research.md) | Регион в цифрах, конкуренты, незанятые ниши |
| [03-functional-spec](docs/03-functional-spec.md) | Функции по каналам: поиск, паспорт события, бот, виджет, кабинет, дашборд |
| [04-architecture](docs/04-architecture.md) | Модули, модель данных, API, каналы, SLO, инфраструктура, ADR |
| [05-ai-agent](docs/05-ai-agent.md) | Гид на GigaChat: конвейер, уточнения, верификатор, модели и цены, eval |
| [06-data](docs/06-data.md) | Источники, нормализация, дедупликация, статусы, карты |
| [07-design](docs/07-design.md) | «Живой орнамент», маскот, палитра, шрифты, компоненты, голос, доступность |
| [08-mobile](docs/08-mobile.md) | Нативные iOS и Android |
| [09-compliance-security](docs/09-compliance-security.md) | 152-ФЗ, рекомендательные технологии, 41-ФЗ, 436-ФЗ, ПП 102, ФСТЭК № 117, безопасность |
| [10-finance](docs/10-finance.md) | Бюджет хакатона, стоимость разработки и владения, эффект, модель развития |
| [11-roadmap](docs/11-roadmap.md) | Разработка до хакатона по дням → хакатон по часам → промышленный запуск M0–M7, риски |
| [12-dev-loop-jury](docs/12-dev-loop-jury.md) | Цикл «сделали → жюри → доделали», DoR/DoD, тестирование |
| [13-owner-tasks](docs/13-owner-tasks.md) | **Что сделать лично**: доступы, ассеты и промпты для маскота |
| [14-pitch](docs/14-pitch.md) | Сценарий защиты, демо, ответы на вопросы |

## Жюри

10 агентов-присяжных в `.claude/agents/`, рубрика в `jury/RUBRIC.md`, сценарии `jury-review` и `jury-loop` в `.claude/workflows/`. Запуск в Claude Code:

```text
Запусти workflow jury-loop с args {"milestone": "CP1", "scope": "данные, API, каркас каналов"}
```

## Как запустить локально

Нужны: Docker, Node.js 24+ (LTS), pnpm 9.

```bash
pnpm install
make up                 # PostgreSQL 18 (PostGIS, pgvector) + Valkey в Docker
make migrate            # схема БД
pnpm --filter @afisha/api cli ingest:sync   # скачать афишу РБ с Культура.РФ и загрузить в каталог (~1 ч в первый раз)
make api                # API: http://localhost:8000, документация: http://localhost:8000/docs
make bot                # Telegram-бот (нужен AFISHA_TELEGRAM_BOT_TOKEN в .env)
make check              # типы, линтер, границы модулей, тесты, дрейф OpenAPI
pnpm build:admin && pnpm --filter @afisha/admin start   # рабочее место: http://localhost:3001 (нужен ADMIN_SESSION_SECRET)
pnpm --filter @afisha/eval eval   # оценка ИИ-гида → eval/reports/latest.md
```

Ключи и токены — в `.env` (шаблон: `.env.example`). Без ключа GigaChat Гид работает в режиме правил: даты, бюджет, возраст и города разбираются детерминированно, подбор — из базы, объяснения — шаблонные.

## Что где

| Путь | Что |
|---|---|
| `apps/api` | Бэкенд на TypeScript (Fastify): публичный API, Гид, Telegram-бот, воркер, кабинет и «Пульс культуры» |
| `apps/web` | Сайт и Telegram Mini App (Next.js) |
| `apps/admin` | Рабочее место сотрудников (Next.js, :3001): кабинет учреждения, модерация, «Пульс культуры» |
| `apps/widget` | Встраиваемый виджет `<afisha-rb>` |
| `apps/ios`, `apps/android` | Нативные приложения (Swift/SwiftUI, Kotlin/Compose) |
| `packages/contract` | Контракт API (zod) и `openapi.json` |
| `packages/design-tokens` | Дизайн-токены «Живой орнамент» |
| `eval` | Наборы и раннер оценки ИИ-гида |
| `infra` | Docker-образы, Postgres, сертификаты |
