ANCHOR_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))

link:
	@mkdir -p ~/bin
	@ln -sf $(ANCHOR_DIR)/bin/anchor.mjs ~/bin/anchor
	@mkdir -p ~/.claude/skills/anchor ~/.claude/commands
	@ln -sf $(ANCHOR_DIR)/skill/SKILL.md ~/.claude/skills/anchor/SKILL.md
	@ln -sf $(ANCHOR_DIR)/commands/anchor.md ~/.claude/commands/anchor.md
	@echo "Anchor linked."

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

.PHONY: link build test test-integration test-golden clean
