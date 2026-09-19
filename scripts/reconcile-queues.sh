#!/bin/sh
# scripts/reconcile-queues.sh — remove stale queue consumers before a deploy
# (TASK-017).
#
# Wrangler's consumer reconciliation matches the existing consumer's script
# name against the script being deployed. A consumer owned by any other script
# (a worker renamed between iterations, or a leftover from a manual deploy)
# makes wrangler POST a second consumer, which the Cloudflare API rejects with
# code 11004 ("already has a consumer") and fails the deploy step.
#
# This script removes every consumer on the queues declared in an app's
# wrangler config whose owning script differs from the script being deployed,
# so the deploy's consumer attach is always a clean create. Idempotent: a
# consumer owned by the deployed script is left untouched; a foreign one is
# removed exactly once.
#
# Queues are account-level resources, so this needs no --env flag; the queue
# names are identical across the config's environment sections.
#
# Usage (invoked by .github/workflows/deploy.yml, or manually before a deploy):
#   scripts/reconcile-queues.sh <app-dir> <script-name>
#   e.g. scripts/reconcile-queues.sh apps/email-worker classprints-email
#
# Required env:
#   CLOUDFLARE_API_TOKEN   deploy token for THIS account (SEC-001)
#   CLOUDFLARE_ACCOUNT_ID  the account whose queues are reconciled
#
# Never prints secret values (SEC-004).

set -eu

APP_DIR="${1:-}"
SCRIPT_NAME="${2:-}"

[ -n "$APP_DIR" ] && [ -n "$SCRIPT_NAME" ] || {
  echo "usage: scripts/reconcile-queues.sh <app-dir> <script-name>" >&2
  exit 1
}
[ -f "$APP_DIR/wrangler.jsonc" ] || [ -f "$APP_DIR/wrangler.json" ] || {
  echo "error: no wrangler config in $APP_DIR" >&2
  exit 1
}

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN must be set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"

# wrangler lives in each app's node_modules (pnpm workspace), not on PATH.
WRANGLER="$APP_DIR/node_modules/.bin/wrangler"
[ -x "$WRANGLER" ] || WRANGLER=wrangler

# Queue names declared in the config's queues.consumers arrays. The sed range
# spans each consumers block (top-level and per-env); the substitution only
# fires on lines with a bare "queue": key, so producers and dead_letter_queue
# keys are not captured.
QUEUES=$(sed -n '/"consumers":/,/]/s/.*"queue": *"\([^"]*\)".*/\1/p' \
  "$APP_DIR"/wrangler.json* 2>/dev/null | sort -u || true)

if [ -z "$QUEUES" ]; then
  echo "reconcile   : no consumers declared in $APP_DIR (nothing to do)"
  exit 0
fi

removed=0
for queue in $QUEUES; do
  # wrangler queues info prints "Consumers: worker:<script>,worker:<script>"
  # (comma-joined) only when consumers exist; other consumer types (http_pull,
  # r2_bucket) print free-form text — those are never auto-removed.
  consumers=$("$WRANGLER" queues info "$queue" 2>/dev/null \
    | sed -n 's/^Consumers: *//p' | tr ',' ' ' || true)
  [ -n "$consumers" ] || continue

  for consumer in $consumers; do
    case "$consumer" in
      worker:*) ;;
      *) continue ;;
    esac
    consumer=${consumer#worker:}
    [ "$consumer" = "$SCRIPT_NAME" ] && continue
    echo "reconcile   : removing stale consumer '$consumer' on queue '$queue' (deploying '$SCRIPT_NAME')"
    if "$WRANGLER" queues consumer remove "$queue" "$consumer" >/dev/null 2>&1; then
      removed=$((removed + 1))
    else
      echo "reconcile   : WARN could not remove consumer '$consumer' on queue '$queue'" >&2
      echo "reconcile   : deploy may fail with 'already has a consumer' [11004]" >&2
    fi
  done
done

[ "$removed" -gt 0 ] && echo "reconcile   : removed $removed stale consumer(s)"
exit 0
