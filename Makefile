# Classprints — convenience targets.
# Secrets flow: fill a gitignored env file (e.g. .env.staging), then push the
# secrets to the GitHub Environment and mirror them into Cloudflare Workers.

# Usage: make envs-staging <env-file>   (or FILE=<env-file>)
FILE ?= $(word 2,$(MAKECMDGOALS))

envs-staging:
	@test -n "$(FILE)" || { echo "usage: make envs-staging <env-file>" >&2; exit 1; }
	@test -f "$(FILE)" || { echo "env file not found: $(FILE)" >&2; exit 1; }
	case '$(FILE)' in \
	  *.example) \
	    echo "==> example file detected: dry-run only, no secrets are pushed"; \
	    ALLOW_EMPTY=1 scripts/sync-secrets.sh staging --file '$(FILE)'; \
	    ;; \
	  *) \
	    scripts/set-env-secrets.sh staging --file '$(FILE)'; \
	    scripts/sync-secrets.sh staging --file '$(FILE)'; \
	    ;; \
	esac

.PHONY: envs-staging

# Swallow the positional env-file argument so make does not error with
# "No rule to make target '<file>'".
ifneq ($(filter envs-staging,$(MAKECMDGOALS)),)
.PHONY: $(filter-out envs-staging,$(MAKECMDGOALS))
$(filter-out envs-staging,$(MAKECMDGOALS)):
	@:
endif
