# Единая команда проверки (docs/12-dev-loop-jury.md §7)
.PHONY: check up down migrate load sync api bot worker test openapi compose seed

check:
	pnpm -r --if-present run typecheck
	pnpm exec biome check apps/api packages
	pnpm --filter @afisha/api run depcruise
	pnpm -r --if-present run test
	pnpm --filter @afisha/api run openapi && git diff --exit-code -- packages/contract/openapi.json || (echo "OpenAPI изменился — закоммитьте packages/contract/openapi.json"; exit 1)

# Демо-стек одной командой: db+valkey, миграции, сид, api, web, admin, worker (README «Быстрый старт»)
compose:
	docker compose up --build
up:
	docker compose up -d --build db valkey
down:
	docker compose down
migrate:
	pnpm --filter @afisha/api cli db:migrate
# Восстановить демо-данные вручную (идемпотентно: непустая база не трогается). Нужны `make up` + `make migrate`
seed:
	docker compose run --rm seed
load:
	pnpm --filter @afisha/api cli ingest:load
sync:
	pnpm --filter @afisha/api cli ingest:sync
api:
	pnpm --filter @afisha/api start
bot:
	pnpm --filter @afisha/api bot
worker:
	pnpm --filter @afisha/api worker
test:
	pnpm -r --if-present run test
openapi:
	pnpm --filter @afisha/api run openapi
