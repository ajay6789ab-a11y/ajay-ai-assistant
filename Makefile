# ---------------------------------------------------------------------------
# Ajay AI Assistant — developer shortcuts
# ---------------------------------------------------------------------------
.PHONY: help install backend test test-backend test-mobile mobile apk clean lint

help:            ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install:         ## Install backend + mobile dependencies
	cd backend && pip install -r requirements.txt
	cd mobile && flutter pub get

backend:         ## Run the API + web demo on :8000
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test: test-backend test-mobile  ## Run every test

test-backend:    ## pytest (NLU, API, auth, tools)
	cd backend && pytest -q

test-mobile:     ## flutter test (widgets + JSON contract)
	cd mobile && flutter test

mobile:          ## Run the app against a local backend (emulator)
	cd mobile && flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000

apk:             ## Build a release APK
	cd mobile && flutter build apk --release

lint:            ## Static analysis
	cd mobile && flutter analyze

clean:           ## Remove build artefacts and caches
	cd mobile && flutter clean
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf backend/.pytest_cache
