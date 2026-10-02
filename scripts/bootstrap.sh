#!/bin/sh
# scripts/bootstrap.sh — one-time per-account resource creation runbook.
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
#         email-jobs (optimizer producer -> email consumer),
#         transcription-jobs (API producer -> transcriber consumer -> DLQ),
#         document-cleanup-jobs (API producer -> transcriber cleanup -> DLQ)
# ---------------------------------------------------------------------------
for queue in seating-jobs seating-jobs-dlq email-jobs \
  transcription-jobs transcription-jobs-dlq \
  document-cleanup-jobs document-cleanup-jobs-dlq; do
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
# R2: private page-image buckets, one per environment (REQ-020).
# No public development URL or custom public domain — objects are served only
# through the authenticated API worker.
# ---------------------------------------------------------------------------
for bucket in "assignment-reader-$ENVIRONMENT"; do
  if wrangler r2 bucket list 2>/dev/null | grep -q "\"$bucket\""; then
    echo "r2 bucket   : $bucket (exists, skipped)"
  else
    wrangler r2 bucket create "$bucket" >/dev/null 2>&1 \
      && echo "r2 bucket   : $bucket (created)" \
      || echo "r2 bucket   : $bucket (CREATE FAILED — check token permissions)" >&2
  fi
done
echo

# ---------------------------------------------------------------------------
# Analytics Engine datasets are implicit (created on first write); no action.
# Rate limiting bindings need no resource (namespace_id is self-chosen).
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Hyperdrive: requires the environment's Neon DATABASE_URL. Run separately per
# env with that env's pooled connection string (Phase 3 wires this up).
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
       - apps/assignment-worker/wrangler.jsonc (hyperdrive[0].id, both envs)
     ($ENVIRONMENT values into the matching section: top-level = staging,
      env.production = production.)

  2. Set worker secrets for this account:
       wrangler secret put RESEND_API_KEY          --config apps/email-worker/wrangler.jsonc
       wrangler secret put LLM_API_KEY             --config apps/seating-worker/wrangler.jsonc
       wrangler secret put LLM_API_KEY             --config apps/assignment-worker/wrangler.jsonc
     (run from repo root with this account's token; or use scripts/sync-secrets.sh)

  3. Record the DATABASE_URL (Neon $ENVIRONMENT) + CLOUDFLARE_API_TOKEN +
     CLOUDFLARE_ACCOUNT_ID in the matching GitHub Environment (deploy.yml).
EOF

if [ "$ENVIRONMENT" = "production" ]; then
  cat <<'EOF'

Production-only prerequisites (a deploy fails without these — see the
2026-09-17 staging outage where a stale queue consumer wedged CI):

  4. Verify the target account is DIFFERENT from staging's account ID
     (classprints-api/email names are identical across envs; deploying
     production into the staging account clobbers the staging workers):
       echo $CLOUDFLARE_ACCOUNT_ID   # compare with staging's

  5. Before the first production deploy, check for stale queue consumers
     owned by workers from earlier iterations (CI auto-removes these now,
     but a foreign consumer means the FIRST deploy creates a fresh one):
       wrangler queues info seating-jobs
       wrangler queues info seating-jobs-dlq
       wrangler queues info email-jobs
     Any "Consumers: worker:<old-name>" line with a name that is not
     classprints-api / classprints-optimizer / classprints-email must go:
       wrangler queues consumer remove <queue> <old-name>

  6. GitHub Environment "production" needs the same secrets as staging
     (set-env-secrets.sh production handles this):
       CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DATABASE_URL,
       BETTER_AUTH_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
       RESEND_API_KEY, LLM_API_KEY          (secrets)
EOF
fi
