ANCHOR_DIR := $(shell cd "$$(dirname "$(MAKEFILE_LIST)")" && pwd -P)

bundle:
	pnpm run bundle
	@chmod +x "$(ANCHOR_DIR)/dist/anchor.mjs"
	@echo "bundled dist/anchor.mjs"

build:
	pnpm exec tsc --noEmit

test:
	pnpm test

test-integration:
	pnpm test:integration

test-golden:
	pnpm test:golden

clean:
	rm -rf node_modules

.PHONY: bundle build test test-integration test-golden clean
