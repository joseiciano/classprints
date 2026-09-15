<!--
Branch model (see CONTRIBUTING → Deployments):
- Feature branches fork from `staging` (repo default). PRs merge into `staging`
  → auto-deploys to the staging Cloudflare account.
- Production is promoted ONLY via the evergreen PR `staging` → `main`
  (title it "Promote staging to production"). Merges to `main` auto-deploy
  to the production account after the required-reviewer gate.
- NEVER squash-merge the promotion PR — it rewrites history and pollutes all
  future promotion diffs (CON-003). Use merge commits or rebase.
-->

## What does this PR do?

<!-- One or two sentences: user-visible behavior or infra change. -->

## Which branch target applies?

- [ ] Merging into `staging` (feature work / fix → deploys to staging)
- [ ] This is the evergreen promotion PR (`staging` → `main` → deploys to production)

## Checklist

- [ ] Typecheck + tests pass locally (`pnpm typecheck && pnpm test`)
- [ ] New/changed resources are pinned by ID in wrangler.jsonc (both env sections)
- [ ] No secrets in code, wrangler.jsonc, or `.env*` files
- [ ] Schema changes ship as a new `database/migrations/YYYYMMDDHHMMSS_*.sql` file
      (backward-compatible with the currently-deployed worker version)
