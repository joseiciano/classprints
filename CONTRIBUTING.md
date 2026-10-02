# Contributing to ClassPrints

## Deployments

The repo runs a **staging → production promotion pipeline** (plan:
`plan/infrastructure-staging-prod-pipeline-1.md`).

### Branch model

```
feature/*  ──PR──▶  staging (default)  ──evergreen PR──▶  main
                         │                                     │
                    deploy-staging                      deploy-production
                    (CF staging acct)                   (CF production acct,
                     + staging DB                        reviewer-gated)
```

- **`staging` is the default branch.** Fork feature branches from it; PRs merge
  back into it. Every merge to `staging` auto-deploys all Workers to the
  staging Cloudflare account and runs DB migrations against the staging Neon DB.
- **Production is reachable only via the evergreen PR** `staging` → `main`
  (title: *"Promote staging to production"*). Its diff always shows
  everything not yet promoted. Merging it triggers the production deploy,
  which pauses at the `production` GitHub Environment's **required reviewer**
  before touching prod.
- **No bypass path to prod** — hotfixes ride the same rails: branch off
  `staging`, PR to `staging`, then promote via the evergreen PR.

### Merge rules

- The promotion PR (`staging` → `main`) must be merged with a **merge commit or
  rebase — never squash**. Squashing breaks commit ancestry: `staging`'s
  commits stop being ancestors of `main`, and every future promotion PR would
  re-show already-shipped changes.
- Regular feature PRs into `staging` may use any merge style.

### Rollback policy

1. **Preferred:** `git revert` the offending change on `staging` (merge the
   revert PR) → staging redeploys clean → promote via the evergreen PR.
2. **Emergency escape hatch:** `wrangler rollback` per Worker/account
   (undoes the last Worker version without a git change).

### One-time setup (per environment)

Infrastructure is created once by a runbook and pinned by ID in the
per-app `wrangler.jsonc` files — CI never auto-provisions resources.

1. **Cloudflare resources** (queues, Hyperdrive): run
   `scripts/bootstrap.sh staging|production` with that account's
   `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, plus
   `HYPERDRIVE_CONNECTION_STRING` set to the matching Neon pooled connection
   string. The script prints IDs to paste into the `wrangler.jsonc` files.
2. **Databases:** provision two Neon projects (or branches) — one per
   environment; their pooled connection strings become the `DATABASE_URL`
   secrets. The first deploy applies `database/migrations/*.sql` automatically.
3. **Secrets:** copy `.env.<env>.example` to `.env.<env>` (gitignored), fill in
   values, then:
   - `scripts/set-env-secrets.sh staging|production` — pushes the values into
     the matching GitHub Environment.
   - `scripts/sync-secrets.sh staging|production` — mirrors the same values
     into that Cloudflare account's Worker secrets (`wrangler secret put`).
   Values never live in the repo or in shell history.
4. **GitHub settings:** protect `main` and `staging` (require PR + status
   checks, no force pushes), enable required reviewers on the `production`
   environment only, restrict environments to their branches
   (staging ↔ `staging`, production ↔ `main`).

### Safe deploy defaults

- Top-level `wrangler.jsonc` config = **staging**. A bare `wrangler deploy`
  always targets staging; production always requires the explicit
  `--env production` flag.
- All resources are pinned by ID in `wrangler.jsonc`; never rely on wrangler
  automatic provisioning in CI.
- Adding a resource: run `scripts/bootstrap.sh` for both accounts, pin the
  returned IDs in both env sections of the app's `wrangler.jsonc`, and extend
  the binding types (`apps/*/src/types*`).

## Development

```sh
pnpm install
pnpm dev        # frontend + local worker tooling
pnpm typecheck  # all workspaces
pnpm test       # vitest
```

Migrations live in `database/migrations/` with `YYYYMMDDHHMMSS_name.sql`
naming. Apply them locally with
`DATABASE_URL=... sh scripts/migrate.sh` (idempotent; tracks applied files
in a `_migrations` table).

## Operations (Assignment Reader)

TASK-027 (REQ-025): what to run when something looks stuck, before
changing the configured transcription model, and how to compute the
baseline metrics without a dashboard.

### Queue/DLQ recovery

`classprints-transcriber` consumes `transcription-jobs` /
`document-cleanup-jobs` and their own `-dlq` queues (`wrangler.jsonc`'s
`queues.consumers`); a message lands on the DLQ only after the primary
consumer's `max_retries` (3) is exhausted. The worker's own DLQ handler
(`handleTranscriptionDlqMessage` / `apps/assignment-worker/src/index.ts`)
already turns a DLQ'd transcription message into the page's `failed` state
with a retry-eligible flag — a teacher's own "Retry" action re-queues it,
so a non-empty DLQ is not by itself an incident.

- **Check depth** (per account; run from the owning app directory, e.g.
  `apps/assignment-worker`, so `wrangler` resolves):
  `wrangler queues info transcription-jobs-dlq` /
  `wrangler queues info document-cleanup-jobs-dlq`. TASK-030's launch
  acceptance requires every DLQ be empty or explained — a persistently
  growing DLQ means the consumer is failing before it can classify the
  message (e.g. `LLM_API_KEY` missing/invalid), not that messages need
  manual replay.
- **Stale consumer after a redeploy** (error 11004, "already has a
  consumer"): `scripts/reconcile-queues.sh <app-dir> <script-name>` removes
  consumers owned by a different script name than the one deploying; the
  deploy workflow already runs this, so this is for a manual
  `wrangler deploy` only.
- **Config-missing retry storm**: `runTranscriptionBatch` retries every
  message (never ack, never DLQ) when `TRANSCRIPTION_MODEL`/
  `TRANSCRIPTION_FALLBACK_MODELS` are unset, logging
  `transcription config missing: ...` — check Worker logs for that string
  before assuming provider failures; the fix is setting the vars, not
  purging the queue.

### Model capability validation

Before changing `TRANSCRIPTION_MODEL` / `TRANSCRIPTION_FALLBACK_MODELS` /
`TRANSCRIPTION_STRUCTURED_OUTPUTS` in `apps/assignment-worker/wrangler.jsonc`
for either account, verify the candidate model against OpenRouter's current
model listing (`https://openrouter.ai/models` or `GET
https://openrouter.ai/api/v1/models`) — ASSUMPTION-003 is that deployment
fails rather than silently falling back when a model can't be verified:

1. The model accepts image input (an `image_url` content part) — not every
   listed model does.
2. If it advertises native structured-output / JSON-schema support, set
   `TRANSCRIPTION_STRUCTURED_OUTPUTS=true`; otherwise `false` so the worker
   uses the validated-JSON fallback path instead (functional spec §6) —
   never assume support `openrouter.repository.ts` can't itself detect.
3. Record the verified model, fallback list, structured-output capability,
   verifier, and source link in
   `docs/plans/assignment-reader/provider-privacy-evidence.md` §3 for that
   environment before deploying it — this is the same evidence TASK-028's
   production launch gate (REQ-026) reads.

### Operational metrics queries

`apps/seating-backend/src/assignment-reader/operational-metrics.repository.ts`
holds the canonical queries for every automatable REQ-025 baseline —
upload-to-draft latency, failure/retry rate, ready/graded conversion,
pages-ever-edited, and materials adoption, by document type and model —
over `transcription_attempts`/`pages`/`submissions`/
`assignment_material_versions`. They are deliberately not exposed over
HTTP (REQ-025's baselines are cross-tenant aggregates, and a
teacher-authenticated endpoint returning them would be a new cross-tenant
exposure); run them directly against the service database, e.g. from a
Node REPL or a throwaway script with `postgres` installed:

```ts
import postgres from 'postgres';
import { getLatencyAndFailureMetrics } from './apps/seating-backend/src/assignment-reader/operational-metrics.repository';

const sql = postgres(process.env.DATABASE_URL!);
console.log(await getLatencyAndFailureMetrics(sql, Date.now() - 7 * 24 * 60 * 60 * 1000));
```

Review duration and materials open rate (REQ-025's remaining two
baselines) are not columns in Postgres — they come from the
`review_session_start`/`review_session_end`/`materials_open` events the
unified workspace emits (TASK-027,
`apps/seating-backend/src/utils/metrics.ts`'s `AssignmentReaderMetrics`)
into the `ANALYTICS` Analytics Engine dataset bound in
`apps/seating-backend/wrangler.jsonc` (`classprints_api_staging` /
`classprints_api_production`). Query them with the [Analytics Engine SQL
API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/),
e.g.:

```sql
SELECT index1 AS event_type, blob1 AS document_type, avg(double2) AS avg_duration_ms
FROM classprints_api_staging
WHERE index1 = 'review_session_end' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blob1
```
