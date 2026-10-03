#!/bin/sh
# scripts/check-queues.sh — preflight: fail fast when a queue declared in any
# app's wrangler config does not exist in the target account (deploy.yml).
#
# Wrangler does not auto-provision queues, so a missing one surfaces as
# `Queue "x" does not exist` partway through a deploy. This checks up front and
# points at the fix. Queues are account-level, so no --env flag is needed.
#
# Usage (invoked by .github/workflows/deploy.yml, or manually):
#   scripts/check-queues.sh
#
# Required env:
#   CLOUDFLARE_API_TOKEN   deploy token for THIS account
#   CLOUDFLARE_ACCOUNT_ID  the account whose queues are checked
#
# Never prints secret values (SEC-004).

set -eu

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN must be set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"

# wrangler lives in each app's node_modules (pnpm workspace), not on PATH.
WRANGLER=apps/seating-backend/node_modules/.bin/wrangler
[ -x "$WRANGLER" ] || WRANGLER=wrangler

# Every queue name referenced by a producer, consumer or dead_letter_queue key.
QUEUES=$(grep -hE '^[[:space:]]*"(queue|dead_letter_queue)":' apps/*/wrangler.json* \
  | sed 's/.*: *"\([^"]*\)".*/\1/' | sort -u)
[ -n "$QUEUES" ] || {
  echo "error: no queues found in apps/*/wrangler.json*" >&2
  exit 1
}

missing=""
for queue in $QUEUES; do
  if "$WRANGLER" queues info "$queue" >/dev/null 2>&1; then
    echo "queue       : $queue (ok)"
  else
    echo "queue       : $queue (MISSING)" >&2
    missing="$missing $queue"
  fi
done

if [ -n "$missing" ]; then
  echo "error: queues missing in account $CLOUDFLARE_ACCOUNT_ID:$missing" >&2
  echo "       run scripts/bootstrap.sh <staging|production> to create them" >&2
  exit 1
fi
