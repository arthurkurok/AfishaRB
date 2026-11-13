# Тамаша · Android

Нативное приложение «Тамаша · Афиша культуры Башкортостана»: Kotlin, Jetpack Compose, MVVM + UDF, Hilt, Room, DataStore, WorkManager, Glance. Архитектура — `docs/08-mobile.md` §3.2, дизайн — `docs/07-design.md`.

## Сборка

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # JDK 21 (системная Java 27 слишком новая для AGP)
./gradlew assembleDebug testDebugUnitTest
./gradlew --stop                                                                  # освободить память после сборки
```

- APK: `app/build/outputs/apk/debug/app-debug.apk`.
- Base URL API задаётся при сборке: `-Pafisha.apiBaseUrl=https://api.example.ru` (по умолчанию `http://10.0.2.2:8000` — localhost хоста с эмулятора). Для устройства по USB: `adb reverse tcp:8000 tcp:8000` и `-Pafisha.apiBaseUrl=http://localhost:8000`.
- Память: `gradle.properties` ограничивает демона (`-Xmx1536m`, без параллельности) — на машине 8 ГБ рядом работают Docker и другие сборки.

## Модули

| Модуль | Что внутри |
|---|---|
| `build-logic` | convention-плагины (`afisha.android.*`, `afisha.jvm.library`) и задача `GenerateDesignTokensTask` |
| `core:model` | доменная модель, правила дат в `Asia/Yekaterinburg`, форматирование ru/ba, маппинг статусов (чистый JVM) |
| `core:network` | клиент, сгенерированный `openapi-generator` из `packages/contract/openapi.json` (kotlin + jvm-ktor + kotlinx.serialization), фасад `AfishaApi`, мапперы в домен |
| `core:database` | Room: избранное (офлайн), кэш паспортов и лент, напоминания |
| `core:data` | репозитории (сеть → офлайн-кэш), настройки (DataStore), сеть, геопозиция, DI |
| `core:designsystem` | `Tokens.kt` и цвета XML генерируются из `packages/design-tokens/tokens.json`; тема, формы ромб/ҡусҡар, карточка события, «зонтик курая», бейджи статусов, маскот Бал (Canvas-плейсхолдеры), шрифты Golos Text и Commissioner (OFL) |
| `feature:home` | главная: Сегодня/Завтра/Выходные, зонтик курая, подборки, город, режим «Просто» |
| `feature:search` | поиск с фильтрами (ModalBottomSheet), выдача по дням, пагинация, «рядом со мной» |
| `feature:event` | паспорт события, страница площадки, «Спросить Гида» о событии, «Сообщить о неточности» |
| `feature:assistant` | Гид: чипы понимания, уточнения, карточки с причинами, режим без ИИ, голосовой ввод |
| `feature:favorites` | избранное из Room (без сети) |
| `feature:settings` | язык ru/ba, город, тема, крупный текст, «Просто», правила рекомендаций, «О приложении» |
| `app` | Activity, навигация (типобезопасные маршруты, диплинки `afisha://…`), Glance-виджет, ярлыки, WorkManager, уведомления |

## Клиент API

`./gradlew :core:network:openApiGenerate` — генерация в `core/network/build/generated/openapi`. Сгенерированный код не правится руками. Обходы для OpenAPI 3.1 из zod описаны комментариями в `core/network/build.gradle.kts`: отключена валидация (нет `info.license.identifier`), `{}` → `JsonElement`, `uuid` → `String`, ответ `202 { ok: true }` → `JsonObject`, в клиент попадают только публичные операции (фильтр по тегам).

Фикстуры для тестов — реальные ответы локального API (`core/network/src/test/resources/fixtures`). Обновить: запросы в `curl` к `http://localhost:8000` с теми же параметрами, что в имени файла.

## Диплинки

`afisha://event/{id}`, `afisha://venue/{id}`, `afisha://today`, `afisha://search?category=theatre&query=…`, `afisha://assistant?prompt=…`, `afisha://favorites`, `afisha://settings`.

## Базовый профиль

`app/src/main/baseline-prof.txt` — рукописный стартовый профиль (подхватывается `profileinstaller`). Полный профиль снимается Macrobenchmark-модулем на эталонном устройстве (Android с 3 ГБ ОЗУ) — нужен эмулятор или устройство.
