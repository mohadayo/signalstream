.PHONY: test test-python test-go test-ts lint up down build clean

test: test-python test-go test-ts

test-python:
	cd services/ingest-api && pip install -q -r requirements.txt && pytest -v

test-go:
	cd services/processor && go test -v ./...

test-ts:
	cd services/dashboard-api && npm install --silent && npm test

lint: lint-python lint-go lint-ts

lint-python:
	cd services/ingest-api && flake8 --max-line-length=120 app.py

lint-go:
	cd services/processor && go vet ./...

lint-ts:
	cd services/dashboard-api && npx eslint src/ --ext .ts

up:
	docker compose up -d --build

down:
	docker compose down

build:
	docker compose build

clean:
	docker compose down -v --rmi local
