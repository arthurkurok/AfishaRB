# Единая команда проверки (docs/12-dev-loop-jury.md §7)
.PHONY: check up down migrate load api bot worker test openapi

check:
	pnpm -r --if-present run typecheck
	pnpm exec biome check apps/api packages
	pnpm --filter @afisha/api run depcruise
	pnpm -r --if-present run test
	pnpm --filter @afisha/api run openapi && git diff --exit-code -- packages/contract/openapi.json || (echo "OpenAPI изменился — закоммитьте packages/contract/openapi.json"; exit 1)

up:
	docker compose up -d --build
down:
	docker compose down
migrate:
	pnpm --filter @afisha/api cli db:migrate
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
