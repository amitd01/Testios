PLIST_NAME  = com.newsletter.digest.plist
PLIST_SRC   = deploy/$(PLIST_NAME)
PLIST_DEST  = $(HOME)/Library/LaunchAgents/$(PLIST_NAME)
INSTALL_DIR = $(shell pwd)

.PHONY: help install uninstall test lint format dry-run

help:          ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:       ## Install launchd agent (macOS only — runs daily at 11:00 AM)
	@echo "Installing Newsletter Agent launchd job..."
	@sed 's|INSTALL_DIR|$(INSTALL_DIR)|g' $(PLIST_SRC) > $(PLIST_DEST)
	@launchctl load $(PLIST_DEST)
	@echo "Installed and loaded: $(PLIST_DEST)"
	@echo "To verify: launchctl list | grep newsletter"

uninstall:     ## Unload and remove the launchd agent
	@launchctl unload $(PLIST_DEST) 2>/dev/null || true
	@rm -f $(PLIST_DEST)
	@echo "Uninstalled launchd agent."

test:          ## Run pytest test suite
	pytest tests/ -v

lint:          ## Run ruff linter
	ruff check .

format:        ## Auto-format with black
	black .

dry-run:       ## Print HTML digest to stdout without sending email
	python run.py --dry-run
