#!/bin/sh
# scripts/sync-secrets.sh — push GitHub Environment secret values into the
# matching Cloudflare account via `wrangler secret put` (TASK-016, SEC-002).
#
# Reads secret VALUES from the local environment (export them from a trusted
# source, e.g. `gh secret list`/your password manager) — never from files in
# the repo. Values are piped to wrangler via stdin, never as CLI arguments.
#
# Usage:
#   scripts/sync-secrets.sh staging|production [app ...]
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

ENVIRONMENT="${1:-}"
shift || true

case "$ENVIRONMENT" in
  staging|production) ;;
  *)
    echo "usage: scripts/sync-secrets.sh staging|production [app ...]" >&2
    echo "  apps: seating-backend email-worker seating-worker (default: all)" >&2
    exit 1
    ;;
esac

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN must be set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

put_secret() {
  # put_secret <APP_DIR> <VAR_NAME> — reads the value from the environment.
  app_dir=$1
  var_name=$2
  eval "value=\${$var_name:-}"
  if [ -z "$value" ]; then
    echo "  $var_name: SKIPPED (not set in environment)"
    return 0
  fi
  printf '%s' "$value" | (cd "$REPO_ROOT/$app_dir" && wrangler secret put "$var_name" >/dev/null 2>&1) \
    && echo "  $var_name: set" \
    || { echo "  $var_name: FAILED" >&2; return 1; }
}

APPS="${*:-seating-backend email-worker seating-worker}"

for app in $APPS; do
  echo "==> $app ($ENVIRONMENT)"
  case "$app" in
    seating-backend)
      put_secret "$app" BETTER_AUTH_SECRET
      put_secret "$app" STRIPE_SECRET_KEY
      put_secret "$app" STRIPE_WEBHOOK_SECRET
      ;;
    email-worker)
      put_secret "$app" RESEND_API_KEY
      ;;
    seating-worker)
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
