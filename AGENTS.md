# AGENTS.md

pnpm monorepo of Cloudflare Workers. `apps/` holds the deployables (`seating-frontend` = `classprints-web`, `seating-backend` = `classprints-api`, `email-worker`, `seating-worker` = optimizer, `assignment-worker` = transcriber); `packages/` holds shared code. Dev, build, lint, typecheck and test commands are in the root `package.json`.

## Environments

- Two Cloudflare accounts: staging and production. In every `apps/*/wrangler.jsonc`, the top-level config is **staging** and `env.production` is production. A bare `wrangler` command targets staging; production always needs `--env production`.
- Product name is per environment: staging shows "ClassPrints", production shows "Bellvel" on `bellvel.com`. Read it from `APPLICATION_NAME` (frontend `src/lib/constants.ts`) or `APP_DISPLAY_NAME` (API); it falls back to Bellvel when unset. Worker, queue and package names stay `classprints-*` in both environments.
- Email goes through Cloudflare Email Service (`send_email` binding, `EMAIL_FROM_*` vars) in both the API and the email worker.
- Secrets live in gitignored `.env.<env>` files, the GitHub Environments and Worker secrets, never in the repo. Templates: `.env.<env>.example`.

## Operations commands

Use the `Makefile` for anything that touches an environment's infrastructure, data or secrets. `<env>` is `staging` or `production`; each target loads `.env.<env>` (override with `FILE=path`) and is idempotent.

| Command | Does | Needs first |
|---|---|---|
| `make bootstrap-<env>` | Creates queues, R2 bucket, Email Sending + support forwarding, Hyperdrive; prints IDs | `npx wrangler login` into that env's account |
| `make migrate-<env>` | Applies pending `database/migrations/*.sql` to `DATABASE_URL` | `DATABASE_URL` in `.env.<env>` |
| `make stripe-<env>` | Creates the Plus product, prices and webhook; writes `STRIPE_WEBHOOK_SECRET` into `.env.<env>`; prints price IDs | `STRIPE_SECRET_KEY` (`sk_`/`rk_`, live for production, test for staging) |
| `make secrets-<env>` | Pushes `.env.<env>` to the GitHub Environment and the Worker secrets | Filled `.env.<env>` |
| `make secrets-list-<env>` | Lists the GitHub Environment's secrets | `gh` auth |
| `make setup-<env>` | bootstrap → migrate → stripe → secrets | All of the above |

Rules for running them:

- Run against **staging** freely. For **production**, hand the exact `make` command to the user to run (as `! make …`); production changes are theirs to execute.
- Dry-run secrets with `make secrets-<env> FILE=.env.<env>.example`, which pushes nothing.
- Pin every ID a target prints (Hyperdrive, Stripe prices) into the matching `wrangler.jsonc` section by hand, then confirm with `npx wrangler deploy --dry-run [--env production]` in that app's directory.
- Create Hyperdrive configs only through `make bootstrap-<env>`. A bare `wrangler hyperdrive create` inside an app directory rewrites that app's `wrangler.jsonc` and appends the binding to the staging section.
- After adding a binding or var, run `npx wrangler types` in `apps/seating-backend` to refresh `worker-configuration.d.ts`.

Deploys and migrations run in CI (`.github/workflows/deploy.yml`) on pushes to `staging` and merges to `main`; nothing above is needed for a routine change. Full runbook: `CONTRIBUTING.md` → "One-time setup".
