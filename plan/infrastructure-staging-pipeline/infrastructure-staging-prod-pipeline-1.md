---
goal: Staging → Production Pipeline for ClassPrints (Workers + Neon + GitHub)
date_created: 2026-09-15
last_updated: 2026-09-15
status: 'Planned'
tags: [infrastructure, process, ci-cd, cloudflare-workers, github-actions]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This plan establishes a **staging → production promotion pipeline** for the ClassPrints
monorepo (4 apps: `seating-backend`, `email-worker`, `optimizer-worker`, `seating-frontend`,
plus `packages/*` shared code and `database/migrations/*` SQL migrations).

Core decisions captured from discussion (2026-09-15):

- **Two separate Cloudflare accounts** — one for staging, one for production. Full isolation
  of Workers, Queues, Hyperdrive, KV, rate-limit bindings. No cross-account bindings possible.
- **GitHub flow**: `staging` is the default branch; feature branches fork from `staging`;
  PRs merge into `staging` (auto-deploys to staging); a single **evergreen PR
  `staging` → `main`** is the promotion vehicle to production (auto-deploys to production).
- **No Terraform.** Infrastructure is managed by: committed `wrangler.jsonc` per app
  (source of truth for non-secret config), GitHub Environments holding per-account secrets,
  and a one-time committed `scripts/bootstrap.sh` runbook per CF account.
- **Two Neon databases** — one per environment (separate projects or branches). Connection
  strings live as `DATABASE_URL` secrets in the matching GitHub Environment. Schema
  migrations run in the deploy workflow, identical step for both envs.
- **Third-party SaaS split per environment**: Stripe (test vs live keys), Resend
  (staging subdomain vs prod domain), Neon (per-env DB).

This plan is self-contained: an implementing agent or engineer needs nothing outside it
plus the repository. Completion of all phases = completion of the overarching goal
(no follow-up plan required for the pipeline itself; optional future work is listed as
alternatives/risks, not tasks).

## 1. Requirements & Constraints

- **REQ-001**: `staging` branch must be the repository default branch; feature branches fork
  from and PR into `staging`.
- **REQ-002**: Merges to `staging` must automatically deploy all Workers to the staging
  Cloudflare account and run DB migrations against the staging database.
- **REQ-003**: Merges to `main` must automatically deploy all Workers to the production
  Cloudflare account and run DB migrations against the production database.
- **REQ-004**: Production deploys must only be reachable via the evergreen PR
  (`staging` → `main`), enforced by branch protection on `main`.
- **REQ-005**: The evergreen PR must automatically stay up to date: GitHub's PR diff is
  head-to-head, so every merge into `staging` updates the diff, status checks, and
  Files-changed view without any automation.
- **REQ-006**: Each Cloudflare account must be addressed via its own GitHub Environment
  (`staging` / `production`) holding that account's `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, and app secrets. One reusable deploy workflow; two thin callers.
- **REQ-007**: The default `wrangler deploy` (no `-e` flag) must target **staging**.
  Production always requires explicit `--env production`. This makes bare invocations safe.
- **REQ-008**: Each app gets a committed `wrangler.jsonc` where top-level config = staging
  and `env.production` = production overrides (routes, vars, binding IDs). Secrets are
  never in these files.
- **REQ-009**: Schema migrations (`database/migrations/*.sql`) must run in the deploy
  workflow against the target env's `DATABASE_URL` (GitHub Environment secret) — identical
  step for both envs.
- **REQ-010**: All environment-differing third-party configuration (Stripe price IDs,
  `FRONTEND_URL`, `ALLOWED_ORIGINS`, Resend domain/key, Hyperdrive/queue IDs) must live in
  `wrangler.jsonc` per env or GitHub Environment secrets — never hardcoded or defaulted
  to prod values in code.
- **REQ-011**: Staging environment must be resettable / disposable in spirit: staging DB is
  a separate Neon project or branch, safe to wipe and restore from prod shape at any time.
- **SEC-001**: Cloudflare API tokens must be least-privilege per account (Workers
  Scripts:Edit, Queues, Hyperdrive:Edit — only what deploys touch) and scoped to one
  account each. No shared tokens across environments.
- **SEC-002**: Secrets (`BETTER_AUTH_SECRET`, Stripe keys, Resend keys, `DATABASE_URL`,
  CF tokens) must exist only as GitHub Environment secrets or via
  `wrangler secret put <KEY> --env <environment>`; never committed, never in `vars`.
- **SEC-003**: The `production` GitHub Environment must have required reviewers enabled
  (deploy-time approval gate after merge, independent of PR review).
- **SEC-004**: `.dev.vars*`, `.env*`, and any bootstrap output containing credentials must
  be gitignored. Bootstrap script may print IDs (non-secret) for pasting into
  `wrangler.jsonc`.
- **CON-001**: Wrangler environments: bindings and `vars` are **non-inheritable** — every
  binding used by an app must be declared in both top-level (staging) and `env.production`.
  Inheritable keys (`name`, `main`, `compatibility_date`, `routes`, `workers_dev`) may be
  inherited. `account_id` is inheritable but is supplied via `CLOUDFLARE_ACCOUNT_ID` env var
  in CI rather than committed.
- **CON-002**: Wrangler automatic resource provisioning must NOT be relied on in CI
  (IDs written back to config are lost with the checkout; a redeploy could create a second
  resource). All resources are created once in bootstrap and pinned by ID in
  `wrangler.jsonc`.
- **CON-003**: The evergreen PR must be merged with **merge commits or rebase — never
  squash**. Squash-merging `staging`→`main` rewrites history so `staging`'s commits stop
  being ancestors of `main`, polluting all future PR diffs with already-shipped changes.
- **CON-004**: Existing deploy scripts use bare CLI flags
  (`wrangler deploy src/index.ts --name classprints-api ...`). These are replaced by the
  wrangler.jsonc files; worker names must be preserved:
  `classprints-api`, `classprints-email`, `classprints-optimizer`.
- **CON-005**: GitHub allows only one open PR per head/base pair — this is desirable here
  (one promotion pipeline). Multiple concurrent release trains are out of scope.
- **GUD-001**: Hotfixes ride the same rails: branch off `staging`, PR to `staging`
  (deploys to staging), then promote via the evergreen PR. There is **no bypass path** to
  prod; this policy is what makes the pipeline trustworthy.
- **GUD-002**: Rollback policy: prefer `git revert` on `staging` + re-promote. Direct
  `wrangler rollback` per worker/account is the emergency escape hatch.
- **GUD-003**: Adding a new resource (queue, Hyperdrive config, KV) means: run bootstrap
  additions per account, pin the returned IDs in `wrangler.jsonc` for both envs, add the
  binding type to `SeatingWorkerBindings` (`apps/seating-backend/src/types/env.ts`).
- **PAT-001**: Follow the repo's existing pnpm workspace conventions: deploy commands run
  per-app via `pnpm --filter <pkg> exec wrangler deploy -e <env>` or `--cwd apps/<app>`;
  migrations live in `database/migrations/` with `YYYYMMDDHHMMSS_name.sql` naming.
- **PAT-002**: Bindings in code are typed once in
  `apps/seating-backend/src/types/env.ts` (`SeatingWorkerBindings`) — wrangler.jsonc files
  must declare exactly the bindings this type expects (HYPERDRIVE, SEATING_JOBS queue,
  API_RATELIMITER, ANALYTICS, plus vars/secrets) for both environments.

## 2. Implementation Steps

### Implementation Phase 1: Wrangler config adoption (per-app configs, staging-default)

- GOAL-001: Replace bare-flag deploys with committed `wrangler.jsonc` per app where
  top-level = staging and `env.production` = prod overrides, matching
  `SeatingWorkerBindings` exactly (PAT-002).

- [ ] **TASK-001**: Create `apps/seating-backend/wrangler.jsonc` with `name`
      `classprints-api`, `main` `src/index.ts`, `compatibility_date` `2026-09-14`,
      `workers_dev` true. Top-level `vars` = staging values (`ENVIRONMENT` `staging`,
      staging `FRONTEND_URL` / `ALLOWED_ORIGINS`, Stripe **test** price IDs,
      checkout/portal URLs pointing at staging). Top-level bindings: `hyperdrive`
      (staging ID), `queues.producers` + `queues.consumers` (staging queue ID),
      `rate_limiting` (API_RATELIMITER), `analytics_engine_datasets` (ANALYTICS) if used.
      Declare `secrets.required` for `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET`. `env.production` mirrors the full binding set with prod
      routes (`api.classprints.app` custom domain, `workers_dev` false), prod vars
      (`ENVIRONMENT` `production`, prod URLs, live Stripe price IDs), prod binding IDs.
      (REQ-007, REQ-008, CON-001, CON-004)
- [ ] **TASK-002**: Create `apps/email-worker/wrangler.jsonc` and
      `apps/seating-worker/wrangler.jsonc` with `name` `classprints-email` /
      `classprints-optimizer`, same staging-default + `env.production` structure, binding
      sets per their `package.json` build scripts (HYPERDRIVE + queue producer/consumer
      roles as implemented in their `src/index.ts`). (REQ-008, CON-004)
- [ ] **TASK-003**: For `apps/seating-frontend`: decide static-assets hosting per env
      (Workers static assets recommended — add `assets` + routes; or keep Vite build
      deployed via `wrangler pages deploy` with two Pages projects). Write the chosen
      config alongside the other apps; frontend env-specific config is the API base URL
      baked at build time (staging vs prod API origin). (REQ-008)
- [ ] **TASK-004**: Update all three worker `package.json` `build` scripts to
      `wrangler deploy --dry-run --outdir dist` (config now supplies name/date/entry) so
      CI can validate config without deploying. (CON-004)
- [ ] **TASK-005**: Validate each config locally: `pnpm --filter <pkg> exec wrangler
      deploy --dry-run -e staging` and `-e production` (with `CLOUDFLARE_ACCOUNT_ID` set to
      any placeholder value for dry-run) — zero exit code and no
      "binding not found"/config errors for either env. (CON-001)

### Implementation Phase 2: Resource bootstrap runbook + DB setup

- GOAL-002: One committed script that, run once per CF account, creates every pinned
  resource and prints the IDs to paste into the wrangler configs; plus Neon DB provisioning
  for both environments.

- [ ] **TASK-006**: Write `scripts/bootstrap.sh` (POSIX sh): for a target env argument
      (`staging|production`), uses that account's `CLOUDFLARE_API_TOKEN` +
      `CLOUDFLARE_ACCOUNT_ID` from the shell env, and runs (idempotently — check-then-create):
      `wrangler hyperdrive create`, `wrangler queues create` (with DLQ if used),
      `wrangler r2 bucket create` / KV if bindings require, and prints a summary table of
      all resource IDs. Also prints the exact `wrangler secret put <KEY> --env <env>`
      commands still needed (without values). (SEC-001, SEC-004, CON-002, GUD-003)
- [ ] **TASK-007**: Provision the two Neon databases: staging project (or branch of prod
      project) and production project. Record each connection string (incl. pooled
      endpoint) — these become `DATABASE_URL` per GitHub Environment. Create one Hyperdrive
      config per CF account pointing at its own DB. (REQ-011, SEC-002)
- [ ] **TASK-008**: Apply all `database/migrations/*.sql` to both databases in filename
      order (this bootstraps schema; the workflow re-runs them idempotently going forward —
      see TASK-012). Verify staging and prod schemas match. (REQ-009)
- [ ] **TASK-009**: In each CF account: create the least-privilege deploy API token
      (Workers Scripts:Edit, Queues, Hyperdrive:Edit, plus Account Settings:Read as
      required by wrangler). Record tokens for GitHub Environment setup in Phase 3. (SEC-001)
- [ ] **TASK-010**: Configure third-party per env: Stripe — test-mode product/prices for
      staging, live prices for prod (IDs into wrangler vars, keys into secrets); Resend —
      verify staging subdomain and prod domain, one API key per env. (REQ-010)

### Implementation Phase 3: GitHub repository + workflow wiring

- GOAL-003: Branch topology, GitHub Environments with secrets/protection, and the
  three-file workflow setup (one reusable, two callers) implementing REQ-001…REQ-006.

- [ ] **TASK-011**: Create `staging` branch from current default; set it as the repo
      default branch in GitHub settings; protect `main` (and `staging`: require PR + CI).
      On `main`: require PR (the evergreen PR satisfies this), require status checks
      (the production deploy workflow), forbid force pushes, and document merge-commit
      policy (CON-003) in the PR template / CONTRIBUTING. (REQ-001, REQ-004, CON-003)
- [ ] **TASK-012**: Write the migration runner `scripts/migrate.sh` (POSIX sh):
      applies pending `database/migrations/*.sql` in filename order against
      `$DATABASE_URL`, tracking applied files in a `_migrations` table
      (idempotent across runs). Use it for TASK-008 bootstrap too. (REQ-009, PAT-001)
- [ ] **TASK-013**: Create `.github/workflows/deploy.yml` (reusable,
      `workflow_call` with `environment` string input): checkout, pnpm setup
      (`pnpm/action-setup@v4`, frozen lockfile), `pnpm typecheck && pnpm test`, migration
      step running `scripts/migrate.sh` with `DATABASE_URL` from the GitHub Environment,
      then `wrangler deploy -e ${{ inputs.environment == 'production' && 'production' ||
      'staging' }}` for each worker app (`--cwd apps/<app>` or pnpm filter), passing
      `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` from GitHub Environment secrets.
      `runs-on: ubuntu-latest`, `environment: ${{ inputs.environment }}` on the job.
      (REQ-002, REQ-003, REQ-006, REQ-009)
- [ ] **TASK-014**: Create `.github/workflows/deploy-staging.yml`
      (`on: push: branches: [staging]` + `workflow_dispatch`) calling deploy.yml with
      `environment: staging`, `secrets: inherit`; and
      `.github/workflows/deploy-production.yml` (`on: push: branches: [main]` +
      `workflow_dispatch`) calling it with `environment: production`. (REQ-002, REQ-003)
- [ ] **TASK-015**: Create GitHub Environments `staging` and `production`: populate each
      with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`,
      `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `RESEND_API_KEY` (values per env from Phase 2). Enable required reviewers on
      `production` only. Restrict each environment to its triggering branch
      (staging ↔ `staging`, production ↔ `main`). (SEC-001, SEC-002, SEC-003)
- [ ] **TASK-016**: Set per-account Worker secrets via
      `wrangler secret put <KEY> --env <env>` for every key in `secrets.required`
      (TASK-001), run locally with each account's token — or import from GitHub
      Environment secrets via a small `scripts/sync-secrets.sh`. Verify with
      `wrangler secret list --env <env>`. (SEC-002)

### Implementation Phase 4: Verification & cutover

- GOAL-004: Prove the pipeline end-to-end on both environments and cut over the team's
  daily flow; retire the old deploy path.

- [ ] **TASK-017**: Staging end-to-end: open a feature branch off `staging` with a trivial
      observable change (e.g. a version echo endpoint or log line), PR into `staging`,
      merge — confirm deploy-staging workflow runs green: migrations applied to staging DB,
      workers deployed to staging account, `ENVIRONMENT` reads `staging`
      (check a config-echo route or `wrangler deployments list`). (REQ-002)
- [ ] **TASK-018**: Production gate test: open the evergreen PR `staging`→`main`
      (title "Promote staging to production"); confirm it shows the feature's diff and
      required checks; merge — confirm the deploy job pauses at the `production`
      environment's required reviewer, approve, confirm prod deploy + migrations complete,
      and the change is live on prod routes. (REQ-003, REQ-004, REQ-005, SEC-003)
- [ ] **TASK-019**: Config safety checks: from a clean checkout, run bare
      `wrangler deploy --dry-run` (no `-e`) in an app dir and confirm it resolves to the
      staging config (no production route/vars); run `-e production --dry-run` and confirm
      prod routes appear. Confirm `git status` is clean after both (no provisioned-ID
      write-back expected since IDs are pinned). (REQ-007, CON-002)
- [ ] **TASK-020**: Rollback drill (staging only): revert the TASK-017 change on `staging`
      (or merge a revert PR), confirm re-deploy removes the change; document in
      CONTRIBUTING: rollback = revert on staging + re-promote; `wrangler rollback` is the
      emergency escape hatch. (GUD-002)
- [ ] **TASK-021**: Remove obsolete deploy paths: strip the bare-flag `build` deploy
      remnants (TASK-004 covers scripts), delete any README/docs instructions referencing
      manual `wrangler deploy` without `-e`, and add a `Deployments` section to
      README/CONTRIBUTING documenting: branch model, evergreen PR, no-squash rule
      (CON-003), bootstrap + secret runbooks, and the rollback policy. (CON-004, GUD-001,
      GUD-002)

## 3. Alternatives

- **ALT-001**: Terraform (Cloudflare provider, two aliased providers) for all CF
  infrastructure including DNS/zones. Not chosen: current footprint (3 workers, one queue,
  one Hyperdrive per account, two Neon DBs) is fully covered by wrangler.jsonc + bootstrap
  script; Terraform adds state management and provider drift overhead with no current need.
  Revisit when resource count exceeds ~10–15, DNS/zones need codifying, or drift detection
  (`terraform plan` nightly) becomes valuable.
- **ALT-002**: Single Cloudflare account with wrangler `[env.staging]` / `[env.production]`
  separating environments. Not chosen: user requirement is separate accounts — full blast-radius
  isolation, independent billing, no risk of staging deploys touching prod bindings.
- **ALT-003**: Separate PRs per change from `staging` to `main` (release-train style).
  Not chosen: GitHub allows only one open PR per head/base pair, so this collapses to the
  evergreen PR anyway; multiple trains would require intermediate release branches — out of
  scope (CON-005).
- **ALT-004**: Separate wrangler config files per environment (e.g. `wrangler.staging.jsonc`
  + `wrangler.production.jsonc`, `--config` flag). Not chosen: `[env.production]` blocks in
  one committed file keep both environments visible in one diff; duplicate files drift.
- **ALT-005**: Wrangler automatic provisioning (ID-less bindings) instead of pinned IDs.
  Not chosen for CI: write-back is lost in ephemeral checkouts (CON-002) — nondeterministic
  resource creation. Acceptable locally only.
- **ALT-006**: Neon single project with two branches (vs two projects). Either satisfies
  REQ-011; two branches is preferred if Neon branching is enabled (zero-copy clone of prod
  shape, resettable), two projects if stricter isolation is wanted. Implementation may pick
  per TASK-007; the pipeline code does not change.
- **ALT-007**: Cloudflare Pages for the frontend (two projects). Kept as fallback in
  TASK-003; Workers static assets preferred to keep one deploy mechanism (wrangler) across
  all four apps.

## 4. Dependencies

- **DEP-001**: `wrangler` `4.57.0` (already in app devDependencies) — JSONC config +
  environments supported (JSON/JSONC configs supported since wrangler 3.91.0).
- **DEP-002**: GitHub Actions with `pnpm/action-setup@v4` (matches `packageManager`
  `pnpm@9.12.1`) and Node >= 20.12.1 setup.
- **DEP-003**: Two Cloudflare accounts with Paid Worker plan if custom domains /
  rate-limiting bindings are used (tier limits differ; confirm per account during TASK-009).
- **DEP-004**: Neon account with capacity for two projects/branches; pooled connection
  strings available per environment.
- **DEP-005**: `gh` CLI (or web UI) permissions to: change default branch, create branch
  protection rules, create GitHub Environments with required reviewers.
- **DEP-006**: Stripe + Resend accounts permitting multiple keys/domains
  (test vs live mode; sending domain verification).

## 5. Files

- **FILE-001**: `apps/seating-backend/wrangler.jsonc` — new; API worker config, staging
  default + `env.production`.
- **FILE-002**: `apps/email-worker/wrangler.jsonc` — new; email worker config.
- **FILE-003**: `apps/seating-worker/wrangler.jsonc` — new; optimizer worker config.
- **FILE-004**: `apps/seating-frontend/wrangler.jsonc` — new (or Pages config alternative
  per TASK-003 decision); frontend assets + build-time API origin per env.
- **FILE-005**: `apps/*/package.json` — modified; `build` scripts become config-driven
  `wrangler deploy --dry-run --outdir dist` (worker apps only).
- **FILE-006**: `scripts/bootstrap.sh` — new; per-account resource creation runbook
  (idempotent, prints IDs + remaining secret commands).
- **FILE-007**: `scripts/migrate.sh` — new; idempotent migration runner
  (`_migrations` ledger table, filename order, uses `$DATABASE_URL`).
- **FILE-008**: `scripts/sync-secrets.sh` — new; optional helper pushing GitHub
  Environment secret values into each CF account via `wrangler secret put --env`.
- **FILE-009**: `.github/workflows/deploy.yml` — new; reusable deploy + migrate + test
  workflow parameterized by `environment` input.
- **FILE-010**: `.github/workflows/deploy-staging.yml` — new; push-triggered caller for
  `staging`.
- **FILE-011**: `.github/workflows/deploy-production.yml` — new; push-triggered caller for
  `main`.
- **FILE-012**: `.github/pull_request_template.md` — new or modified; documents evergreen
  promotion PR usage + merge-commit (no-squash) rule.
- **FILE-013**: `README.md` / `CONTRIBUTING.md` — modified; Deployments section (branch
  model, runbooks, rollback policy).
- **FILE-014**: `apps/seating-backend/src/types/env.ts` — unchanged (reference: binding
  contract wrangler.jsonc must satisfy; modified only if new bindings are added later,
  per GUD-003).

## 6. Testing

- **TEST-001**: Config validation: `wrangler deploy --dry-run -e staging` and
  `-e production` exit 0 for all worker apps with no missing-binding errors, both locally
  and in CI (TASK-005, TASK-019).
- **TEST-002**: Staging promotion: feature-branch change merges to `staging` →
  deploy-staging workflow green; observable change present on staging worker; staging DB
  migration applied (ledger row in `_migrations`). (TASK-017)
- **TEST-003**: Production promotion: evergreen PR diff updates automatically on merge to
  `staging`; merge triggers deploy; production environment reviewer gate fires; post-approve
  deploy green; change live on prod routes; prod DB migration applied. (TASK-018)
- **TEST-004**: Default-target safety: bare `wrangler deploy --dry-run` resolves staging
  config only — no prod routes/vars present in resolved config. (TASK-019)
- **TEST-005**: Migration idempotency: running `scripts/migrate.sh` twice in a row
  applies each file exactly once (second run is a no-op); out-of-order/missing files fail
  loudly. (TASK-012, TASK-008)
- **TEST-006**: Rollback: revert merge on `staging` redeploys and the change disappears
  from staging; production remains untouched. (TASK-020)
- **TEST-007**: Secret hygiene: `git grep` for known secret key names in committed files
  finds no values; `wrangler secret list --env <env>` shows required secrets per env;
  configs contain no secret values. (SEC-002, SEC-004)

## 7. Risks & Assumptions

- **RISK-001**: Config drift between the two CF accounts (no Terraform state to diff).
  Mitigation: wrangler.jsonc is the single committed source of truth for both envs;
  dry-run validation in CI (TEST-001); bootstrap script is the documented runbook for
  anything outside wrangler. Escalation path: adopt Terraform (ALT-001) if drift incidents
  occur.
- **RISK-002**: Squash-merging the evergreen PR breaks the diff lineage (CON-003) —
  future promotion PRs would show already-shipped commits. Mitigation: branch protection +
  PR template + CONTRIBUTING note; verify during TASK-018.
- **RISK-003**: Bare `wrangler deploy` (muscle memory, CON-004) deploys staging config to
  the prod account if run with prod credentials. Mitigation: staging-default configs
  (REQ-007); production requires explicit `-e production`; docs.
- **RISK-004**: Migration failures mid-deploy leave one environment on a different schema
  version than the other. Mitigation: migrations run before worker deploy in the same
  workflow run; expand-contract migration discipline for breaking changes (write migrations
  to be backward-compatible with the currently-deployed worker version).
- **RISK-005**: Rate-limit binding (`API_RATELIMITER`) and Analytics Engine availability /
  limits differ per account plan. Mitigation: confirm during TASK-009; adjust configs per
  account if a binding is unavailable on the staging plan (config divergence is confined to
  wrangler.jsonc, visible in review).
- **RISK-006**: GitHub Environment reviewer gate on `production` blocks automated hotfix
  deploys when no reviewer is available. Accepted tradeoff (SEC-003 intent); workaround is
  a designated backup reviewer.
- **ASSUMPTION-001**: The repo has no existing `.github/workflows` or wrangler configs
  (verified 2026-09-15 via glob) — this plan creates them from scratch; if any appear
  meanwhile, reconcile instead of overwrite.
- **ASSUMPTION-002**: `wrangler.jsonc` env-specific vars cover all differences the
  workers need at runtime; no worker code changes are required to support two environments
  (bindings are read from `env`, never hardcoded — confirmed in
  `apps/seating-backend/src/index.ts` usage of `env.ALLOWED_ORIGINS` / `env.FRONTEND_URL`).
- **ASSUMPTION-003**: The user controls both Cloudflare accounts and can create API tokens
  with the scopes in SEC-001 in each.
- **ASSUMPTION-004**: Custom domains (`classprints.app`, `api.classprints.app`) are (or can
  be) zoned in the production CF account; staging uses `*.workers.dev` or a staging
  subdomain zoned in the staging account.

## 8. Related Specifications / Further Reading

- [Wrangler Environments](https://developers.cloudflare.com/workers/wrangler/environments/) —
  non-inheritable keys, staging/production example, secret-per-env handling (CON-001).
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) —
  full key reference, inheritable vs top-level-only keys, automatic provisioning caveats
  (CON-002).
- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
  — prod route setup (TASK-001).
- [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) —
  `wrangler secret put --env`, `.dev.vars.<environment>` for local dev (SEC-002).
- [GitHub Environments](https://docs.github.com/en/actions/how-guides/review-deployments/managing-environments-for-deployment)
  — required reviewers, branch restrictions (SEC-003, TASK-015).
- [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
  — `workflow_call` + `secrets: inherit` pattern (TASK-013, TASK-014).
- [Neon branching](https://neon.com/docs/introduction/branching) — staging-as-branch of
  prod (REQ-011, ALT-006).
