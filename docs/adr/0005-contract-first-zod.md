# ADR-005. Contract-first через zod-схемы в packages/contract

Статус: принято

**Решение.** Схемы API — в `packages/contract` (zod 4). Fastify валидирует запросы и сериализует ответы по ним же; из них экспортируется `packages/contract/openapi.json` (OpenAPI 3.1, `operationId` у всех операций, именованные схемы в `components`). Swift и Kotlin генерируют клиентов из `openapi.json`; веб, виджет и админка импортируют типы напрямую. `make check` падает при дрейфе `openapi.json`.

**Уточнение (02.11.2026).** Булевы параметры строки запроса разбираются строго (`qbool`): `z.coerce.boolean` превращал `"false"` в `true`.
