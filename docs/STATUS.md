# Состояние работ (обновлено 02.11.2026, ночь)

> Читать первым после перезапуска сессии или машины.

## Как поднять окружение

```bash
open -a Docker && cd ~/Cyber102/Project1
make up                                   # PostgreSQL 18 + Valkey; каталог РБ уже загружен в томе pgdata
pnpm --filter @afisha/api start           # API :8000, документация /docs, админ-токен dev-admin-token
pnpm --filter @afisha/web dev             # сайт и Mini App :3000
pnpm --filter @afisha/admin dev           # кабинет, модерация, «Пульс культуры» :3001 (когда готов)
make check                                # типы, Biome, границы модулей, тесты (каждый прогон — своя временная БД)
```

## Готово

| Часть | Состояние | Проверки |
|---|---|---|
| Бэкенд `apps/api` | Каталог РБ (≈ 8,5 тыс. событий, 26 тыс. сеансов), ингест Культура.РФ, нормализация (+ раскодирование HTML-сущностей), provenance, журнал изменений, статусы, детектор исчезновений, дедупликация + разъединение, поиск (веса ранжирования — единый источник), API v1, справочники, «похожие», правила ранжирования, обратная связь, избранное без регистрации (устройство / Telegram initData), кабинет (статусы, создание события, ИИ-черновик), «Пульс культуры», модерация, Гид (правила + GigaChat-шлюз, верификатор, уточнения, маршрут дня, вопросы о событии, башкирский), Telegram-бот, уведомления, воркер на pg-boss, Valkey для диалогов | 100 тестов; dependency-cruiser чисто; eval 802/802 и 0 нарушений на провокациях; дедуп на 59 реальных парах — 0 ложных слияний |
| Сайт + Mini App + виджет `apps/web`, `apps/widget` | Все страницы плана, `/tma/*`, виджет 8,6 КБ gzip, конструктор, `/about` с правилами по 149-ФЗ | typecheck, 23+11 юнит, `next build`, 39 e2e + axe (0 нарушений); скриншоты `jury/reports/artifacts/web/` |
| iOS `apps/ios` | Swift 6 / SwiftUI, XcodeGen, экраны, виджет, Siri, ru/ba | 92 теста + 13 снапшотов; сборка `make build NO_ASSETS=1` (нет runtime симулятора) |
| Android `apps/android` | Kotlin / Compose, все экраны, Glance-виджет, ярлыки, ru/ba, локальные уведомления | `assembleDebug testDebugUnitTest` — 93 теста; APK `apps/android/app/build/outputs/apk/debug/app-debug.apk` |
| Документы | План 00–14, ADR в `docs/adr/`, этот файл | — |

## ⏸ ПАУЗА (02.11.2026) — все агенты остановлены по просьбе пользователя

Жюри M1, раунд 1: гейт **не пройден** (`jury/reports/M1-r1.md`, бэклог `jury/backlog/M1.md`). Шло исправление блокеров BL-1…BL-8 и major MJ-*.

### Ядро (делал сам) — код написан, но **не проверен**: tsc, Biome и тесты после правок не запускались

Сделано:
- `organizer/auth.ts` — субъекты из `AFISHA_ADMIN_TOKENS`, роли ministry/organization, timingSafeEqual (MJ-16, MJ-18).
- `lib/config.ts` — `validateConfig()` для prod, `AFISHA_SECRET`, `AFISHA_TRUST_PROXY`, `trustProxySetting()`.
- `organizer/routes.ts` — плагин с префиксом `/admin` (BL-7), изоляция учреждений, ministryOnly, resolve merge/distinct/confirm/cancel, `/events/:id/unmerge`, `/me`, маршруты скрыты из OpenAPI.
- `organizer/status.ts` — машина статусов с таблицей переходов, `StatusChangeError` 400/409, идемпотентность, сброс availability, повторный перенос, запрет переноса в прошлое, применение к сеансу канонического события (BL-3, BL-6).
- `organizer/create-event.ts` — `{error,status}`, проверка принадлежности площадки, ticket_url только http(s), очистка HTML (MJ-23).
- `db/schema.ts` + `drizzle/0002_match_decision.sql` — таблица решений модераторов (**миграция не применена к dev-БД**).
- `dedup/merge.ts` — слияние на уровне сеансов, выбор канонического по доверию, never_merge, unmerge; `dedup/service.ts` использует их; `dedup/unmerge.ts` — через `unmergeEvent` (BL-2, BL-3, MJ-8).
- `ingestion/pipeline.ts` — сеансы по префиксу source_key, новые сеансы слитого события → в каноническое, возврат «исчезнувших» при неизменной карточке (MJ-1), provenance сеансов и observed_at (MJ-4), время из mtime (MJ-5), источник не двигает перенесённый сеанс (BL-4), `validate()` + задачи модератору, age null → pending (MJ-22), `finishRun` с задачами `vanished` и `last_success` только при ok (MJ-3, MJ-14).
- `ingestion/runner.ts` — только события из `listed.json`, SAVEPOINT на карточку, порог ошибок 1 % (BL-1, MJ-2). `connectors/culture-ru.ts` — устаревшие карточки → `events-archive/`.
- `normalize-culture-ru.ts` — `normalizeAge("")→null`, снятие тегов до и после раскодирования (MJ-21).
- `notify/service.ts` — текст переноса по `old_value` (BL-4); проверить, что `old_value`/`starts_at` есть в выборке строки `r` (tsc покажет).
- `lib/ids.ts` (HMAC-псевдонимы); conversation_id в API — только UUID (BL-8); бот — `tg-<HMAC>`; trace — псевдоним; search_log — маскирование ПДн (MJ-19).
- `main/app.ts` — trustProxy из конфига, лимит 60/мин без allowList, логгер с redact, Problem 400 для валидации, ETag + Cache-Control (MJ-11, MJ-15, MJ-17). `lib/metrics.ts` — `/metrics` (MJ-14).

Следующие шаги по порядку:
1. `cd apps/api && npx tsc --noEmit`, `pnpm exec biome check --write .`, `node scripts/depcruise.mjs` — исправить ошибки.
2. Тесты на новые сценарии (MJ-10): переходы статусов, повторный перенос, слияние без потери сеансов, never_merge, unmerge, возврат «исчезнувших», BL-1 со старыми файлами, BL-7 `/%61dmin`, BL-8 `tg-…` в `/v1/assistant`, ETag/304. Прогнать `make check`.
3. `pnpm --filter @afisha/api cli db:migrate`, `cli openapi:export`, перезапустить API.
4. Повторный раунд жюри M1: skill `jury-review` с `{"milestone":"M1","round":2,...}`.

### Фоновые агенты — остановлены; можно возобновить через SendMessage по ID (контекст сохранён)

| Агент | ID | Где остановился |
|---|---|---|
| `apps/admin` (кабинет, модерация, «Пульс культуры») | `a230123fb90233cb1` | гонял e2e, один тест упал по таймауту `page.goto` — проверял, не тормозит ли API |
| CI и цепочка поставок (MJ-24) | `af87b13ed8480dff8` | собирал Docker-образ API и писал CI-скрипты |
| Разметка ≥ 300 пар дедупа вслепую (MJ-7) | `a532fafd54a8b0270` | фикстуры собраны, начинал писать тест метрик |
| Безопасность ИИ: маскирование, верификатор, таймауты (MJ-20/21/25) | `abf54491b8a232090` | изучил код и eval, к правкам ещё не приступил |

Если после перезапуска Claude Code агенты недоступны по ID — запустить заново с теми же зонами (см. `jury/backlog/M1.md`) и сначала проверить, что уже лежит в их файлах.

Экономия ресурсов (машина 8 ГБ): одновременно не больше двух тяжёлых агентов или сборок; демоны Gradle после сборки Android гасить `cd apps/android && ./gradlew --stop`.

## Известные пробелы (бэклог)

- Мобильные: перегенерировать клиенты после последних изменений контракта (iOS: `apps/ios/Scripts/generate-api.sh`; Android: сборка генерирует сама); push (RuStore/FCM/APNs) и регистрация устройств; `/app/config` (фичефлаги); Live Activity; Material 3 Expressive (нужен compileSdk 37).
- Веб: Service Worker (офлайн), избранное/профиль на сайте, «Маршрут дня» и представления карта/таймлайн/календарь.
- Данные: телефоны касс, детальная доступность, длительность — в источнике нет; партнёрский ключ PRO.Культура (письмо министерства).
- Контракт: схемы ответов админ-API (`/admin/dashboard` и др.) пока описаны локально в admin; дубли `*Input` в OpenAPI.
- Живая проверка GigaChat и Telegram — нужны ключи в `.env` (см. `.env.example`).
