ANCHOR_DIR := $(shell cd "$$(dirname "$(MAKEFILE_LIST)")" && pwd -P)

install:
	pnpm install
	@$(MAKE) -s link
	@[ ! -f "$(ANCHOR_DIR)/hooks/post-push-reminder.sh" ] || chmod +x "$(ANCHOR_DIR)/hooks/post-push-reminder.sh"
	@echo ""
	@echo "Anchor installed. To initialize a codebase map for a repo:"
	@echo "  cd <your-repo> && claude   # then run /anchor init"
	@echo ""
	@echo "To install the pre-push reminder hook in a specific repo:"
	@echo "  cd <your-repo> && claude   # then run /anchor hook install"
	@echo ""

link:
	@mkdir -p ~/bin
	@ln -sf "$(ANCHOR_DIR)/bin/anchor.mjs" ~/bin/anchor
	@mkdir -p ~/.claude/skills/anchor ~/.claude/commands
	@ln -sf "$(ANCHOR_DIR)/skill/SKILL.md" ~/.claude/skills/anchor/SKILL.md
	@ln -sf "$(ANCHOR_DIR)/commands/anchor.md" ~/.claude/commands/anchor.md
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

.PHONY: install link build test test-integration test-golden clean
