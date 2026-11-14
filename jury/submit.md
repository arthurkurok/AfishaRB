# Сдача проекта — «Афиша культуры Башкортостана»

Хакатон «Кибер 102» · кейс 01 · Уфа · 13–15.11.2026

## Краткое описание

**«Афиша РБ»** — единая достоверная афиша событий культуры всего
Башкортостана. Продукт объединяет то, что сейчас разбросано по десяткам
сайтов и соцсетей: **8 703 события, 27 193 будущих сеанса, 2 303 площадки
в 65 городах и районах**, синхронизация с Культура.РФ и учреждениями
республики — каждый час, автоматически.

Пять точек входа на одной базе: **сайт** (афиша, поиск, карточки-паспорта,
ИИ-гид на GigaChat, русский и башкирский языки, выбор города), **Telegram-бот
с Mini App** (афиша, подписки, дайджесты), **админка для министерства**
(«Пульс культуры», модерация дубликатов, кабинет учреждения), **открытый
REST API** (OpenAPI 3.1) и **виджет** для сайтов учреждений. У каждого
события — «паспорт»: источники, уровень доверия, история изменений.

Живые цифры на вечер 14.11.2026 (обновляются каждый час):
<https://api.antihype.best/v1/stats>.

Стек: PostgreSQL 18 (PostGIS, pgvector) · Fastify · Next.js · pg-boss ·
GigaChat · Caddy (TLS) · Docker. Архитектура зафиксирована в 10 ADR.

## Все ссылки

| Что | Ссылка | Комментарий |
|---|---|---|
| **Сайт (главная)** | <https://antihype.best> | первый заход — окно выбора города |
| Башкирская версия | <https://antihype.best/ba> | полный перевод интерфейса |
| Поиск | <https://antihype.best/ru/search> | фильтры, RSS и iCal-экспорт |
| ИИ-гид | <https://antihype.best/ru/guide> | диалоговый подбор событий |
| Карта города | <https://antihype.best/ru/m/ufa> | площадки на Leaflet + OSM |
| **REST API** | <https://api.antihype.best/docs> | интерактивная OpenAPI 3.1 |
| Пример API-запроса | <https://api.antihype.best/v1/occurrences?limit=5> | лента сеансов, ETag-кэширование |
| **Админка** | <https://admin.antihype.best/login> | вход по токену (ниже) |
| Токен админки | `89de712f6630beee43f542fe0e14401c319301c8d005c436` | пилотный, в `~/stacks/afisha/.env` |
| «Пульс культуры» | <https://admin.antihype.best/pulse> | после входа: метрики, модерация |
| **Telegram-бот** | <https://t.me/AfishaRB102bot> | афиша, подписки, дайджесты |
| Telegram Mini App | <https://antihype.best/tma> | открывается из бота |
| Виджет для сайтов | <https://antihype.best/ru/developers> | конструктор + сниппет |
| **Код (GitHub)** | <https://github.com/3r0ha/AfishaRB> | монорепо, main |
| README | <https://github.com/3r0ha/AfishaRB#readme> | решения, ADR, деплой, демо-сценарий |
| Презентация (PDF) | [`jury/presentation/presentation.pdf`](presentation/presentation.pdf) | 10 слайдов, 3 минуты |
| Текст выступления | [`jury/presentation/speech.md`](presentation/speech.md) | тайминг по слайдам |

## Быстрая проверка, что всё живое

```bash
curl -sI https://antihype.best | head -1                  # 200
curl -s "https://api.antihype.best/v1/stats" | head -c 300 # живые цифры
curl -sI https://admin.antihype.best/login | head -1       # 200
```

Сервер: 201.58.190.98 (`ssh gvps`), стек — `~/stacks/afisha`,
6 контейнеров (web, api, admin, bot, postgres, caddy), health — `docker ps`.

> Сервис демонстрационный и не является официальным сервисом
> Министерства культуры Республики Башкортостан.
