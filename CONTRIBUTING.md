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
     the matching GitHub Environment (secrets + the `VITE_SEATING_API_URL`
     variable).
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
