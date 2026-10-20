# Classprints — operations targets. Dev/build/test stay in package.json.
#
# Every target takes the environment in its name (staging|production) and
# reads the gitignored .env.<env> (override with FILE=path). One-time setup
# for a fresh account, in order:
#
#   make bootstrap-production   # Cloudflare queues, R2, email, Hyperdrive
#   make migrate-production     # apply database/migrations to DATABASE_URL
#   make stripe-production      # Stripe product, prices, webhook
#   make secrets-production     # push .env.production to GitHub + Workers
#
# `make setup-<env>` runs all four in that order. Each step is idempotent.

ENVS := staging production

# Positional env file kept for the older `make envs-<env> <file>` form.
LEGACY_FILE := $(if $(filter envs-%,$(MAKECMDGOALS)),$(word 2,$(MAKECMDGOALS)))
FILE ?= $(if $(LEGACY_FILE),$(LEGACY_FILE),.env.$*)

# Homebrew's libpq is keg-only, so psql is often not on PATH.
PSQL_PATH := /opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin

check-env = @case '$*' in staging|production) ;; *) echo "unknown environment '$*' (use: $(ENVS))" >&2; exit 1 ;; esac
check-file = @test -f '$(FILE)' || { echo "env file not found: $(FILE) (copy .env.$*.example)" >&2; exit 1; }
load-file = set -a && . './$(FILE)' && set +a

help:
	@echo "make bootstrap-<env>     Cloudflare resources (uses your wrangler login)"
	@echo "make migrate-<env>       apply pending database migrations"
	@echo "make stripe-<env>        Stripe product, prices and webhook"
	@echo "make secrets-<env>       push .env.<env> to GitHub + Cloudflare Workers"
	@echo "make secrets-list-<env>  list the GitHub Environment's secrets"
	@echo "make setup-<env>         all of the above setup steps, in order"
	@echo "<env> = staging | production; FILE=path overrides .env.<env>"

# Uses the interactive `wrangler login` session rather than the deploy token in
# the env file: the email steps need permissions the deploy token lacks.
bootstrap-%:
	$(check-env)
	$(check-file)
	@$(load-file) && env -u CLOUDFLARE_API_TOKEN sh scripts/bootstrap.sh $*

migrate-%:
	$(check-env)
	$(check-file)
	@$(load-file) && PATH="$$PATH:$(PSQL_PATH)" sh scripts/migrate.sh

stripe-%:
	$(check-env)
	$(check-file)
	@ENV_FILE='$(FILE)' sh scripts/stripe-setup.sh $*

# A *.example file is a dry run: nothing is pushed.
secrets-%:
	$(check-env)
	$(check-file)
	@case '$(FILE)' in \
	  *.example) \
	    echo "==> example file detected: dry-run only, no secrets are pushed"; \
	    ALLOW_EMPTY=1 sh scripts/sync-secrets.sh $* --file '$(FILE)'; \
	    ;; \
	  *) \
	    sh scripts/set-env-secrets.sh $* --file '$(FILE)' && \
	    sh scripts/sync-secrets.sh $* --file '$(FILE)'; \
	    ;; \
	esac

secrets-list-%:
	$(check-env)
	@gh secret list --env $*

setup-%:
	@$(MAKE) --no-print-directory bootstrap-$* migrate-$* stripe-$* secrets-$*

envs-%: secrets-%
	@:

.PHONY: help

# Swallow the positional env-file argument of `make envs-<env> <file>` so make
# does not error with "No rule to make target '<file>'".
ifneq ($(filter envs-%,$(MAKECMDGOALS)),)
$(LEGACY_FILE):
	@:
endif
