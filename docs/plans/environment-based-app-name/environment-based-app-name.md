---
goal: Environment-based app name — "ClassPrints" in staging, "Bellvel" in production (display name, sender identity, support email)
date_created: 2026-10-13
last_updated: 2026-10-19
status: 'Completed'
tags: [feature, branding, frontend, backend, email, ci-cd]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

The product is currently hard-coded as "ClassPrints" everywhere. This plan makes the user-facing product name, outbound email sender identity, and support email depend on the deploy environment: **staging keeps "ClassPrints"; production becomes "Bellvel"**.

This ticket is a **complete, self-contained unit**. Non-goals (explicitly left unchanged, no follow-up required by this plan): production domain `classprints.app`, Cloudflare worker names (`classprints-web|api|email|optimizer`), Analytics Engine dataset names, Hyperdrive names, `@classprints/*` package names, `__CLASSPRINTS_RUNTIME_ENV__`, `hidden@classprints.local`, `design/` and `plan/` docs, and the staging domains/addresses.

Environment signal per surface:

| Surface | How the environment is known | Mechanism introduced |
| --- | --- | --- |
| Frontend (Vite build) | `.github/workflows/deploy.yml` `inputs.environment` | Build-time env vars `VITE_APP_NAME`, `VITE_SUPPORT_EMAIL` |
| seating-backend worker | `wrangler.jsonc` top-level (staging) vs `env.production` | New var `APP_DISPLAY_NAME` (+ existing `EMAIL_FROM_*`) |
| email-worker | `wrangler.jsonc` top-level (staging) vs `env.production` | Existing var `RESEND_FROM_EMAIL` display-name part |

## 1. Requirements & Constraints

- **REQ-001**: Staging must render the name `ClassPrints` in all user-visible places, identical to current behavior.
- **REQ-002**: Production must render the name `Bellvel` in all user-visible places: header/brand, footer, `<title>`, Terms of Service, Privacy Policy, Overview, Customer Service, Sign-in, Settings plan label, verification email subject/body.
- **REQ-003**: Production outbound email display name is `Bellvel`; production sender address is `noreply@bellvel.com` (see ASSUMPTION-001).
- **REQ-004**: Production support email shown in the UI/legal pages is `support@bellvel.com`; staging keeps `MyClassPrints@gmail.com` (see ASSUMPTION-001).
- **REQ-005**: No component outside `apps/seating-frontend/src/lib/constants.ts` may hard-code the app name or support email in frontend source (`apps/seating-frontend/src`), except tests asserting both values.
- **REQ-006**: If env vars are unset (local dev, tests, or a misconfigured deploy), everything falls back to the production brand: frontend `Bellvel` / `support@bellvel.com`, backend `Bellvel`. Staging shows `ClassPrints` only because its config sets it explicitly.
- **CON-001**: Do not rename worker names, domains, datasets, packages, or queue/Hyperdrive resources (non-goals above).
- **CON-002**: `.env*` files are git-ignored except `.env.example` / `.env.*.example`; defaults must live in code, not in a committed `.env`.
- **CON-003**: `renderVerificationTemplate` exists as two identical copies (`packages/server/src/email/verification-template.ts`, `packages/server/src/auth/better-auth/verification-template.ts`); both must receive the same change.
- **GUD-001**: Follow existing repo style (single quotes, 2-space indent, Prettier config in `.prettierrc`).
- **PAT-001**: Single source of truth per runtime: frontend `constants.ts`; backend `env.APP_DISPLAY_NAME`; email-worker `RESEND_FROM_EMAIL`.

## 2. Implementation Steps

### Implementation Phase 1: Frontend name and support-email source of truth

- GOAL-001: All frontend code reads the app name and support email from `constants.ts`, driven by build-time env vars.

- [x] **TASK-001**: Edit `apps/seating-frontend/src/lib/constants.ts`
  - Replace line 1 with `export const APPLICATION_NAME = import.meta.env.VITE_APP_NAME || 'Bellvel';`
  - Replace line 2 with `export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@bellvel.com';`
- [x] **TASK-002**: Edit `apps/seating-frontend/src/env.d.ts`
  - Append `interface ImportMetaEnv { readonly VITE_APP_NAME?: string; readonly VITE_SUPPORT_EMAIL?: string; }` and `interface ImportMeta { readonly env: ImportMetaEnv; }` after the existing `/// <reference types="vite/client" />`.
- [x] **TASK-003**: Edit `apps/seating-frontend/src/components/ui/footer-bar.tsx`
  - Remove the literal default `brand = 'ClassPrints'`; import `APPLICATION_NAME` from `../../lib/constants` and use `brand = APPLICATION_NAME`.
- [x] **TASK-004**: Replace hard-coded `ClassPrints` with `{APPLICATION_NAME}` (import from `../lib/constants`; use template literals where the string is inside an attribute/array) in each file:
  - `apps/seating-frontend/src/pages/overview.tsx` (lines 89, 202)
  - `apps/seating-frontend/src/pages/customer-service.tsx` (lines 13, 57; line 43 already uses the constant)
  - `apps/seating-frontend/src/pages/sign-in.tsx` (line 73)
  - `apps/seating-frontend/src/pages/settings.tsx` (line 395 → `` `${APPLICATION_NAME} Plus` `` / `` `${APPLICATION_NAME} Free` ``)
  - `apps/seating-frontend/src/pages/privacy-policy.tsx` (lines 50, 85, 105, 132, 140, 159, 174, 177, 182, 236)
  - `apps/seating-frontend/src/pages/terms-of-service.tsx` (lines 7, 51, 68, 83, 86, 90, 99, 114, 142, 152, 161, 168, 177, 183, 191, 206, 211, 213). Line 7 is inside a module-level array: build it with `` `Who can use ${APPLICATION_NAME}` ``.
  - Run `git grep -n "ClassPrints" apps/seating-frontend/src` afterwards; it must return nothing.
- [x] **TASK-005**: Edit `apps/seating-frontend/vite.config.mts`
  - Add an inline plugin `{ name: 'html-app-name', transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', process.env.VITE_APP_NAME || 'Bellvel') }` to `plugins`.
- [x] **TASK-006**: Edit `apps/seating-frontend/index.html` line 7
  - Change to `<title>%APP_NAME% — Classroom seating, thoughtfully arranged</title>`.
- [x] **TASK-007**: Update `apps/seating-frontend/.env.staging.example` and `.env.production.example`
  - Append documented, non-secret keys. Staging: `VITE_APP_NAME=ClassPrints`, `VITE_SUPPORT_EMAIL=MyClassPrints@gmail.com`. Production: `VITE_APP_NAME=Bellvel`, `VITE_SUPPORT_EMAIL=support@bellvel.com`.

### Implementation Phase 2: Deploy pipeline sets the frontend variables

- GOAL-002: The deploy workflow injects the right values at frontend build time per environment.

- [x] **TASK-008**: Edit `.github/workflows/deploy.yml`, step `Build + deploy classprints-web`
  - Add to the step's `env:` block:
    - `VITE_APP_NAME: ${{ inputs.environment == 'production' && 'Bellvel' || 'ClassPrints' }}`
    - `VITE_SUPPORT_EMAIL: ${{ inputs.environment == 'production' && 'support@bellvel.com' || 'MyClassPrints@gmail.com' }}`
  - Both vars are consumed by `pnpm --filter @classprints/web run build` in the same step.

### Implementation Phase 3: Backend verification email

- GOAL-003: The verification email (subject, text, HTML) and sender display name use the environment's name.

- [x] **TASK-009**: Edit `apps/seating-backend/src/types/env.ts`
  - Add `APP_DISPLAY_NAME: string;` next to `APPLICATION_NAME` (line 13).
- [x] **TASK-010**: Edit `apps/seating-backend/wrangler.jsonc`
  - Top-level `vars` (staging): add `"APP_DISPLAY_NAME": "ClassPrints"` (no other change; `EMAIL_FROM_NAME` stays `ClassPrints`).
  - `env.production.vars`: add `"APP_DISPLAY_NAME": "Bellvel"`; change `"EMAIL_FROM_NAME"` (line 84) to `"Bellvel"`; change `"EMAIL_FROM_ADDRESS"` (line 83) and `send_email[0].allowed_sender_addresses` (line 89) to `noreply@bellvel.com`.
  - Update the file header comment (line 2) to say the display name varies by environment.
- [x] **TASK-011**: Edit both copies of the template (CON-003): `packages/server/src/email/verification-template.ts` and `packages/server/src/auth/better-auth/verification-template.ts`
  - Extend `VerificationTemplateProps` with `appName: string`; destructure it; replace the two `ClassPrints` occurrences (`<title>` and body paragraph) with `${appName}`.
- [x] **TASK-012**: Edit `apps/seating-backend/src/index.ts` (lines 44-46)
  - `const appName = env.APP_DISPLAY_NAME || 'Bellvel';`
  - `subject: \`Verify Your Email - ${appName}\``, `html: renderVerificationTemplate({ verificationLink: input.url, appName })`, `text: \`Verify your ${appName} email address: ${input.url}\``.
- [x] **TASK-013**: Add `APP_DISPLAY_NAME` to the mock env objects in `apps/seating-backend/tests/index.test.ts`, `seating.routes.test.ts`, `user.routes.test.ts` (and any other test file whose typecheck fails) so `pnpm typecheck` passes.

### Implementation Phase 4: Email worker sender

- GOAL-004: Result emails from the email worker show `Bellvel` and the Bellvel address in production.

- [x] **TASK-014**: Edit `apps/email-worker/wrangler.jsonc`
  - `env.production.vars.RESEND_FROM_EMAIL` (line 44) → `"Bellvel <noreply@bellvel.com>"`. Staging value (line 15) unchanged.
  - Update header comment (line 2) similarly to TASK-010.

### Implementation Phase 5: Tests and verification

- GOAL-005: Behavior is defended by tests and the full repo checks pass.

- [x] **TASK-015**: Delegate to the `tester` agent: add the tests in section 6 (TEST-001..TEST-003).
- [x] **TASK-016**: Run `pnpm typecheck && pnpm test`; both must exit 0.
- [x] **TASK-017**: Run build verification (TEST-004) and the leftover-literal scan (TEST-005).

## 3. Alternatives

- **ALT-001**: Vite `--mode staging|production` with committed `.env.*` files — rejected: `.env*` is git-ignored (CON-002) and `build` script is mode-agnostic.
- **ALT-002**: Runtime detection via hostname (`classprints.app` → Bellvel) in the SPA — rejected: couples branding to the domain (which stays `classprints.app`) and flashes the wrong name on custom domains/workers.dev previews.
- **ALT-003**: Serve the name from the API (`/api/config`) — rejected: adds a request before first paint and still needs per-env backend config.
- **ALT-004**: Derive backend name from `EMAIL_FROM_NAME` instead of a new var — rejected: sender display name and in-copy product name are different concerns and may diverge.

## 4. Dependencies

- **DEP-001**: Production email domain `bellvel.com` must be onboarded to Cloudflare Email Sending (for `send_email` binding in seating-backend) and to Resend (for email-worker), with `noreply@bellvel.com` verified, before production deploy. Without this, production emails fail to send.
- **DEP-002**: Mailbox `support@bellvel.com` must exist and receive mail before production deploy.
- **DEP-003**: No new npm packages.

## 5. Files

- **FILE-001**: `apps/seating-frontend/src/lib/constants.ts` — env-driven name and support email.
- **FILE-002**: `apps/seating-frontend/src/env.d.ts` — typing for new env vars.
- **FILE-003**: `apps/seating-frontend/src/components/ui/footer-bar.tsx` — default brand.
- **FILE-004**: `apps/seating-frontend/src/pages/{overview,customer-service,sign-in,settings,privacy-policy,terms-of-service}.tsx` — use constant.
- **FILE-005**: `apps/seating-frontend/vite.config.mts`, `apps/seating-frontend/index.html` — title substitution.
- **FILE-006**: `apps/seating-frontend/.env.staging.example`, `.env.production.example` — document vars.
- **FILE-007**: `.github/workflows/deploy.yml` — inject build vars.
- **FILE-008**: `apps/seating-backend/src/types/env.ts`, `src/index.ts`, `wrangler.jsonc` — `APP_DISPLAY_NAME`, sender config.
- **FILE-009**: `packages/server/src/email/verification-template.ts`, `packages/server/src/auth/better-auth/verification-template.ts` — `appName` prop.
- **FILE-010**: `apps/email-worker/wrangler.jsonc` — production `RESEND_FROM_EMAIL`.
- **FILE-011**: `apps/seating-backend/tests/*.test.ts` — env mock updates plus new tests.

## 6. Testing

- **TEST-001**: `packages/server` — `renderVerificationTemplate({ verificationLink, appName: 'Bellvel' })` output contains `Bellvel` in `<title>` and body, contains the link, and does not contain `ClassPrints`; same assertion with `'ClassPrints'` inverted. Run against both template copies.
- **TEST-002**: `apps/seating-backend` — the `sendVerificationEmail` path produces subject `Verify Your Email - ClassPrints` and text containing `ClassPrints` when `APP_DISPLAY_NAME='ClassPrints'` (the staging override) and falls back to `Bellvel` when the var is empty or unset.
- **TEST-003**: `apps/seating-frontend` — with `vi.stubEnv('VITE_APP_NAME', 'ClassPrints')` and `vi.resetModules()`, `constants.ts` exports `APPLICATION_NAME === 'ClassPrints'`; with it unset or empty, exports the production default (same for `SUPPORT_EMAIL`).
- **TEST-004**: Build check: `VITE_APP_NAME=ClassPrints pnpm --filter @classprints/web run build` → `apps/seating-frontend/dist/index.html` contains `<title>ClassPrints —` and `grep -ci bellvel dist/index.html` is 0; repeat without the var → title contains `Bellvel`.
- **TEST-005**: Leftover scan: `git grep -n "ClassPrints" -- apps/seating-frontend/src packages/server/src apps/seating-backend/src` returns nothing; `ClassPrints` lives only in staging config (`wrangler.jsonc` top-level vars, `deploy.yml`).
- **TEST-006**: Config check: `grep -n "Bellvel\|bellvel" apps/seating-backend/wrangler.jsonc apps/email-worker/wrangler.jsonc` shows hits only inside `env.production` blocks.

## 7. Risks & Assumptions

- **RISK-001**: A missed hard-coded string leaves "ClassPrints" in production; mitigated by TEST-005.
- **RISK-002**: Legal pages (Terms/Privacy) name the operating entity implicitly via the product name; swapping the name does not update any legal entity/contact details. Legal review of Bellvel wording is outside this plan.
- **RISK-003**: Production mixes brands in URLs (`classprints.app`, Stripe return URLs, workers) with the Bellvel display name until a future domain migration; users may notice the mismatch.
- **RISK-004**: If DEP-001 is not complete at deploy time, production verification emails fail (sender not allowed); deploy production only after DEP-001 and DEP-002.
- **ASSUMPTION-001**: The user chose "display name + email/support" but did not supply addresses; `noreply@bellvel.com` and `support@bellvel.com` are placeholders-by-assumption and must be confirmed. Changing them requires edits only in TASK-007, TASK-008, TASK-010, TASK-014.
- **ASSUMPTION-002**: Stripe-hosted checkout/portal branding is configured in the Stripe dashboard and is out of scope.
- **ASSUMPTION-003**: `email-worker` result emails contain no product name in their templates (verified: no `ClassPrints` string in `apps/email-worker/src`).

## 8. Related Specifications / Further Reading

- `docs/plans/infrastructure-staging-pipeline/infrastructure-staging-prod-pipeline-1.md` — staging/production pipeline and wrangler env conventions.
- Vite env variables: https://vite.dev/guide/env-and-mode
- Wrangler environments/vars: https://developers.cloudflare.com/workers/wrangler/environments/
