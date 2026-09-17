#!/bin/sh
# scripts/sync-secrets.sh — push secret values into the matching Cloudflare
# account's Workers via `wrangler secret put` (TASK-016, SEC-002).
# Usage:
#   scripts/sync-secrets.sh staging|production [--file <path>] [app ...]
#
# Loads values from a gitignored env file when present:
#   .env.<environment> (default) or the path given to --file.
# Values are piped to wrangler via stdin, never as CLI arguments.
#
# Required env (values only; the script never echoes them):
#   CLOUDFLARE_API_TOKEN   deploy token for the target account
#   CLOUDFLARE_ACCOUNT_ID  target account ID
#   BETTER_AUTH_SECRET     API worker auth secret
#   STRIPE_SECRET_KEY      API worker Stripe key
#   STRIPE_WEBHOOK_SECRET  API worker Stripe webhook secret
#   RESEND_API_KEY         email worker key
#   LLM_API_KEY            optimizer worker key (optional)

set -eu

# ALLOW_EMPTY=1: tolerate an env file with empty/unset values (e.g. running
# against a *.example template to sanity-check the pipeline end to end).
# Empty values are then skipped instead of aborting.

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  staging|production) ;;
  *)
    echo "usage: scripts/sync-secrets.sh staging|production [--file <path>] [app ...]" >&2
    echo "  apps: seating-backend email-worker seating-worker (default: all)" >&2
    exit 1
    ;;
esac

# Remaining args: [--file <path>] [app ...]. Shift so the environment
# positional is never mistaken for an app name.
if [ "$#" -gt 0 ]; then shift; fi

APP_ARGS=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--file" ]; then ENV_FILE_ARG="$arg"; prev=""; continue; fi
  case "$arg" in
    --file) prev="--file" ;;
    *) APP_ARGS="$APP_ARGS $arg" ;;
  esac
done

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ -n "${ENV_FILE_ARG:-}" ]; then
  ENV_FILE="$ENV_FILE_ARG"
else
  ENV_FILE="$REPO_ROOT/.env.$ENVIRONMENT"
fi

# Load the gitignored env file if present. Shell-exported variables take
# precedence because sourcing happens after the export.
if [ -f "$ENV_FILE" ]; then
  echo "==> loading secrets from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
put_secret() {
  # put_secret <APP_DIR> <VAR_NAME> — reads the value from the environment.
  app_dir=$1
  var_name=$2
  eval "value=\${$var_name:-}"
  if [ -z "$value" ]; then
    echo "  $var_name: SKIPPED (not set in environment)"
    return 0
  fi
  # wrangler lives in each app's node_modules (pnpm workspace), not on PATH.
  WRANGLER="$REPO_ROOT/$app_dir/node_modules/.bin/wrangler"
  [ -x "$WRANGLER" ] || WRANGLER=wrangler
  printf '%s' "$value" | (cd "$REPO_ROOT/$app_dir" && "$WRANGLER" secret put "$var_name" >/dev/null 2>&1) \
    && echo "  $var_name: set" \
    || { echo "  $var_name: FAILED" >&2; return 1; }
}

if [ -n "${ALLOW_EMPTY:-}" ]; then
  # Skip wrangler entirely: a template cannot produce real Cloudflare calls.
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    export CLOUDFLARE_API_TOKEN="allow-empty-placeholder"
  fi
  put_secret() {
    # put_secret <APP_DIR> <VAR_NAME> — dry-run shape of the real put_secret.
    app_dir=$1
    var_name=$2
    eval "value=\${$var_name:-}"
    if [ -z "$value" ]; then
      echo "  $var_name: SKIPPED (not set in environment)"
    else
      echo "  $var_name: SKIPPED (ALLOW_EMPTY run — no secret pushed)"
    fi
    return 0
  }
else
  : "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN must be set (env or $ENV_FILE)}"
fi

APPS="${APP_ARGS:- apps/seating-backend apps/email-worker apps/seating-worker}"
for app in $APPS; do
  case "$app" in
    apps/seating-backend|seating-backend)
      put_secret "$app" BETTER_AUTH_SECRET
      put_secret "$app" STRIPE_SECRET_KEY
      put_secret "$app" STRIPE_WEBHOOK_SECRET
      ;;
    apps/email-worker|email-worker)
      put_secret "$app" RESEND_API_KEY
      ;;
    apps/seating-worker|seating-worker)
      put_secret "$app" LLM_API_KEY
      ;;
    *)
      echo "unknown app: $app" >&2
      exit 1
      ;;
  esac
done

echo
echo "Verify with: wrangler secret list --config <app>/wrangler.jsonc"
