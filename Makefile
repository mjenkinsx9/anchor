ANCHOR_DIR := $(shell makefile_path="$(MAKEFILE_LIST)"; cd "$${makefile_path%/*}" && pwd -P)

install:
	pnpm install
	@$(MAKE) -s link
	@[ ! -f "$(ANCHOR_DIR)/hooks/pre-push" ] || chmod +x "$(ANCHOR_DIR)/hooks/pre-push"
	@node "$(ANCHOR_DIR)/bin/install-posttool-hook.mjs" 2>/dev/null || true
	@echo ""
	@echo "Anchor installed. To initialize a codebase map for a repo:"
	@echo "  cd <your-repo> && claude   # then run /anchor init"
	@echo ""
	@echo "To install the pre-push reminder hook in a specific repo:"
	@echo "  cd <your-repo> && make -f $(ANCHOR_DIR)/Makefile install-hook"
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

# Installs the pre-push reminder hook into the .git of the *current* directory.
# Run from inside a target repo:  make -f <anchor-repo>/Makefile install-hook
install-hook:
	@test -d .git || { echo "anchor: install-hook must be run from inside a git repo."; exit 1; }
	@if [ -f .git/hooks/pre-push ] && [ "$(FORCE)" != "1" ]; then \
		echo "anchor: .git/hooks/pre-push already exists. Re-run with FORCE=1 to overwrite."; exit 1; \
	fi
	@mkdir -p .git/hooks
	@cp "$(ANCHOR_DIR)/hooks/pre-push" .git/hooks/pre-push
	@chmod +x .git/hooks/pre-push
	@echo "Anchor pre-push hook installed in $$(pwd)"

uninstall-hook:
	@if [ ! -f .git/hooks/pre-push ]; then \
		echo "no pre-push hook installed"; \
	elif grep -q '# Anchor pre-push reminder' .git/hooks/pre-push; then \
		rm -f .git/hooks/pre-push; \
		echo "Anchor pre-push hook removed from $$(pwd)"; \
	else \
		echo "existing .git/hooks/pre-push is not Anchor's — leaving it alone"; \
		exit 1; \
	fi

.PHONY: install link build test test-integration test-golden clean install-hook uninstall-hook
