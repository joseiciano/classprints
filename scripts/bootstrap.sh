#!/bin/sh
# scripts/bootstrap.sh — one-time per-account resource creation runbook (TASK-006).
#
# Creates every Cloudflare resource that the wrangler.jsonc configs pin by ID
# (CON-002: no auto-provisioning in CI), and prints the IDs to paste into the
# configs. Idempotent: existing resources are detected and skipped.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... scripts/bootstrap.sh staging|production
#
# Required env:
#   CLOUDFLARE_API_TOKEN   least-privilege deploy token for THIS account (SEC-001)
#   CLOUDFLARE_ACCOUNT_ID  the account to provision
#
# Never prints or stores secret values (SEC-004) — only resource IDs.

set -eu

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  staging|production) ;;
  *)
    echo "usage: scripts/bootstrap.sh staging|production" >&2
    exit 1
    ;;
esac

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN must be set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"

command -v wrangler >/dev/null 2>&1 || {
  echo "error: wrangler not found (run: pnpm --filter @classprints/api exec wrangler --version)" >&2
  exit 1
}

echo "==> Bootstrapping Cloudflare resources for: $ENVIRONMENT"
echo "    account: $CLOUDFLARE_ACCOUNT_ID"
echo

# ---------------------------------------------------------------------------
# Queues: seating-jobs (API producer -> optimizer consumer -> DLQ),
#         email-jobs (optimizer producer -> email consumer)
# ---------------------------------------------------------------------------
for queue in seating-jobs seating-jobs-dlq email-jobs; do
  if wrangler queues list 2>/dev/null | grep -q "\"$queue\""; then
    echo "queue       : $queue (exists, skipped)"
  else
    wrangler queues create "$queue" >/dev/null 2>&1 \
      && echo "queue       : $queue (created)" \
      || echo "queue       : $queue (CREATE FAILED — check token permissions)" >&2
  fi
done
echo

# ---------------------------------------------------------------------------
# Analytics Engine datasets are implicit (created on first write); no action.
# Rate limiting bindings need no resource (namespace_id is self-chosen).
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Hyperdrive: requires the environment's Neon DATABASE_URL. Run separately per
# env with that env's pooled connection string (TASK-007 wires this up).
# ---------------------------------------------------------------------------
HYPERDRIVE_NAME="classprints-${ENVIRONMENT}"
if [ -n "${HYPERDRIVE_CONNECTION_STRING:-}" ]; then
  if wrangler hyperdrive list 2>/dev/null | grep -q "\"$HYPERDRIVE_NAME\""; then
    echo "hyperdrive  : $HYPERDRIVE_NAME (exists, skipped)"
    wrangler hyperdrive list 2>/dev/null | grep -A1 "\"$HYPERDRIVE_NAME\"" || true
  else
    wrangler hyperdrive create "$HYPERDRIVE_NAME" \
      --connection-string "$HYPERDRIVE_CONNECTION_STRING" 2>&1 \
      | sed -n 's/.*id: *\([a-f0-9]*\).*/hyperdrive  : \1 (created)/p' \
      || echo "hyperdrive  : CREATE FAILED — check connection string" >&2
  fi
else
  cat <<EOF
hyperdrive  : SKIPPED — set HYPERDRIVE_CONNECTION_STRING to the $ENVIRONMENT Neon
              pooled connection string to create the "$HYPERDRIVE_NAME" config:
              wrangler hyperdrive create $HYPERDRIVE_NAME --connection-string "\$HYPERDRIVE_CONNECTION_STRING"
EOF
fi
echo

# ---------------------------------------------------------------------------
# Summary + remaining manual steps
# ---------------------------------------------------------------------------
cat <<EOF
==> Bootstrap summary for $ENVIRONMENT

Next steps (manual, secrets never pass through this script — SEC-002):

  1. Paste the Hyperdrive ID into:
       - apps/seating-backend/wrangler.jsonc  (hyperdrive[0].id, both envs)
       - apps/email-worker/wrangler.jsonc     (hyperdrive[0].id, both envs)
       - apps/seating-worker/wrangler.jsonc   (hyperdrive[0].id, both envs)
     ($ENVIRONMENT values into the matching section: top-level = staging,
      env.production = production.)

  2. Set worker secrets for this account:
       wrangler secret put BETTER_AUTH_SECRET      --config apps/seating-backend/wrangler.jsonc
       wrangler secret put STRIPE_SECRET_KEY       --config apps/seating-backend/wrangler.jsonc
       wrangler secret put STRIPE_WEBHOOK_SECRET   --config apps/seating-backend/wrangler.jsonc
       wrangler secret put RESEND_API_KEY          --config apps/email-worker/wrangler.jsonc
       wrangler secret put LLM_API_KEY             --config apps/seating-worker/wrangler.jsonc
     (run from repo root with this account's token; or use scripts/sync-secrets.sh)

  3. Record the DATABASE_URL (Neon $ENVIRONMENT) + CLOUDFLARE_API_TOKEN +
     CLOUDFLARE_ACCOUNT_ID in the matching GitHub Environment (TASK-015).
EOF
