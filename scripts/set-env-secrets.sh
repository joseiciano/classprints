#!/bin/sh
# scripts/set-env-secrets.sh — push every secret from a filled .env.<env> file
# into the matching GitHub Environment (SEC-002).
#
# Usage:
#   scripts/set-env-secrets.sh staging|production [--file .env.staging]
#
# The env file is gitignored; values never appear in the repo. After this, run
# scripts/sync-secrets.sh <env> to mirror the same values into the Cloudflare
# account's Worker secrets.
#
# Requires: gh CLI authenticated with repo admin (secret write) access.

set -eu

ENVIRONMENT="${1:-}"
FILE_ARG="${2:-}"

case "$ENVIRONMENT" in
  staging|production) ;;
  *)
    echo "usage: scripts/set-env-secrets.sh staging|production [--file <path>]" >&2
    exit 1
    ;;
esac

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$REPO_ROOT/.env.$ENVIRONMENT"

if [ "$FILE_ARG" = "--file" ]; then
  ENV_FILE="${3:-}"
  [ -n "$ENV_FILE" ] || { echo "error: --file requires a path" >&2; exit 1; }
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "error: env file not found: $ENV_FILE" >&2
  echo "       copy .env.$ENVIRONMENT.example to $ENV_FILE and fill in values" >&2
  exit 1
fi

command -v gh >/dev/null 2>&1 || { echo "error: gh CLI not found" >&2; exit 1; }

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || {
  echo "error: not in a gh-authenticated repository" >&2
  exit 1
}

# Secrets managed by this pipeline.
SECRETS="CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID DATABASE_URL \
BETTER_AUTH_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET RESEND_API_KEY LLM_API_KEY"

# Load KEY=VALUE pairs from the env file into the current shell (values may
# contain '=' and quotes; blank lines and comments are skipped).
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

echo "==> Setting GitHub Environment secrets: $ENVIRONMENT (repo: $REPO)"
failed=0
for key in $SECRETS; do
  eval "value=\${$key:-}"
  if [ -z "$value" ]; then
    echo "  $key: SKIPPED (empty in $ENV_FILE)"
    continue
  fi
  if gh secret set "$key" --env "$ENVIRONMENT" --repo "$REPO" --body "$value" >/dev/null 2>&1; then
    echo "  $key: set"
  else
    echo "  $key: FAILED" >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "==> some secrets failed to set" >&2
  exit 1
fi

echo
echo "==> Done. Next: mirror Worker secrets into Cloudflare with"
echo "    CLOUDFLARE_API_TOKEN=... scripts/sync-secrets.sh $ENVIRONMENT"
echo "    (or re-run it with the env file loaded: set -a; . $ENV_FILE; set +a; scripts/sync-secrets.sh $ENVIRONMENT)"
