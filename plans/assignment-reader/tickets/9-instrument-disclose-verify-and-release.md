---
ticket: 9
phase: "Implementation Phase 9"
goal: GOAL-009
status: In Progress
date_created: 2026-10-01
---

# Ticket 9: Instrument, disclose, verify, and release

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-yellow)

**Status note**: every engineering-only task below is implemented and
automated-gate-clean. This ticket cannot reach `Completed` from an
engineering session alone — TASK-028's disclosure *approval* and
TASK-030's staging launch-acceptance scenario require an accountable
product/legal owner and two real teacher accounts exercising real staging
infrastructure (per [Ticket 1](1-freeze-contracts-and-launch-gates.md)'s
own `provider-privacy-evidence.md`, which says as much about TASK-003).
See "Implementation notes" at the bottom for exactly what remains and who
needs to do it.

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on all prior tickets ([1](1-freeze-contracts-and-launch-gates.md)–[8](8-processing-and-unified-workspace-surfaces.md)) — this is the closing release phase.

**GOAL-009**: Prove the complete MVP in staging, publish the privacy contract, and make failures/costs/deletion operable before production promotion.

## Tasks

- [x] **TASK-027**: Complete metric instrumentation and operational queries.
  - Add structured Analytics Engine writes in API/worker utilities and repository queries over `transcription_attempts`, pages, documents, and grading timestamps for every automatable REQ-025 baseline.
  - Define `pages ever edited` as the MVP correction metric; do not infer correctness or edit magnitude. Emit review-session start/end and materials-open events without document content or direct teacher/student identity.
  - Document queue/DLQ recovery commands and model capability validation in existing operational documentation or scripts; do not create a new standalone README.
  - Dependencies: TASK-014 through TASK-026 ([Ticket 5](5-transcription-retry-and-progress-services.md) through [Ticket 8](8-processing-and-unified-workspace-surfaces.md)).
  - Acceptance: staging data can compute latency/failure/conversion/edit/adoption/cost metrics by document type and model; logs and Analytics contain no student content.

- [ ] **TASK-028** (partial — see notes): Publish provider, retention, deletion, and AI disclosures.
  - Update `apps/seating-frontend/src/pages/privacy-policy.tsx` and `terms-of-service.tsx` with the approved facts from TASK-003 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)), including student work, prompts, answer keys/rubrics, OpenRouter/downstream provider roles, verified retention/deletion, account-deletion behavior, and whether zero-retention routing is available and selected.
  - Update dates and navigation contents; avoid compliance guarantees not backed by an independent determination.
  - Dependencies: TASK-003 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)) and final deployed provider routing from TASK-013 ([Ticket 5](5-transcription-retry-and-progress-services.md)).
  - Acceptance: product/legal approval is recorded; the live staging pages match actual routing and deletion behavior; production deployment is blocked if approval or verified routing/retention evidence is absent. If zero-retention routing is available, the selected controls are recorded and reflected in the disclosure.

- [x] **TASK-029** (automated portion; see notes): Run focused automated verification and full repository gates.
  - Run package-scoped tests listed in Section 6 of the main plan as each layer lands, then run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build` once on the integrated tree.
  - Run Wrangler dry deployments for API, frontend, optimizer, email worker, and assignment worker in staging-default and production modes; confirm generated binding types match each `wrangler.jsonc`.
  - Dependencies: TASK-001 through TASK-028 (all tickets).
  - Acceptance: every command exits zero with no skipped Assignment Reader suite, binding error, migration error, or schema mismatch.

- [ ] **TASK-030**: Execute the staging launch-acceptance and failure-recovery scenario.
  - Use two teacher accounts and real JPEG, PNG, and HEIC pages to prove all 11 PRD launch criteria plus cross-tenant denial, mixed processing, each failure class, retry, consented retranscription, materials replacement/history snapshot, archive, all deletion scopes, model-config change, and background polling stop.
  - Verify actual R2 keys and database rows are removed after cleanup, but do not inspect/log image contents. Change the configured model and transcribe a new page; confirm existing teacher-edited drafts are unchanged.
  - Record qualitative teacher trust/review-time baselines outside product telemetry; no in-product survey is added for MVP.
  - Dependencies: TASK-027 through TASK-029 (this ticket).
  - Acceptance: every scenario in Section 6 of the main plan passes in staging; privacy gate is approved; DLQs are empty or explained; production promotion uses the existing `staging → main` pipeline.

## Phase Completion Criteria

Automated gates and staging smoke pass, privacy/legal and deletion operations are proven, metrics are queryable, and production promotion completes without any unresolved launch blocker.

## Dependencies

- Requires every other ticket ([1](1-freeze-contracts-and-launch-gates.md) through [8](8-processing-and-unified-workspace-surfaces.md)) complete; this is the terminal release gate.

## Related

- Files: `apps/seating-frontend/src/hooks/use-delete-account.ts`, `src/pages/privacy-policy.tsx`, `src/pages/terms-of-service.tsx` (FILE-014); `apps/seating-frontend/package.json`, test files (FILE-015); `scripts/bootstrap.sh`, `.github/workflows/deploy.yml` (FILE-016).
- Tests: TEST-009 (package/integrated gate commands), TEST-010 (staging launch-acceptance scenario).
- See also: REQ-025, REQ-026, RISK-005, DEP-009, ASSUMPTION-006.

## Implementation notes

**TASK-027 — done.** `POST /documents/:documentType/:documentId/analytics-events`
(`apps/seating-backend/src/assignment-reader/assignment-reader.{routes,service}.ts`,
`AssignmentReaderMetrics` in `apps/seating-backend/src/utils/metrics.ts`)
records `review_session_start`/`review_session_end`/`materials_open` to
Analytics Engine, content- and identity-free. The unified workspace emits
these (`useReviewSessionAnalytics`,
`apps/seating-frontend/src/hooks/assignment-reader/documents.ts`).
`apps/seating-backend/src/assignment-reader/operational-metrics.repository.ts`
holds the latency/failure/conversion/edit/adoption queries (integration-
tested against live Postgres); CONTRIBUTING.md's new "Operations
(Assignment Reader)" section documents DLQ recovery, the manual
OpenRouter model-capability check, and how to run these queries plus the
Analytics Engine SQL API query for review-duration/materials-open-rate.

**TASK-028 — engineering portion done; approval portion blocked.**
`privacy-policy.tsx`/`terms-of-service.tsx` now disclose that page images
and, when needed for the same transcription, assignment materials/answer
keys/rubrics are sent through OpenRouter to a selected AI provider, and
state the verified, code-level fact that account deletion automatically
schedules Assignment Reader data deletion (`scheduleAccountDeletion`,
called from `apps/seating-backend/src/user/user.routes.ts` before the
soft-delete). What is **not** done, and cannot be from an engineering
session: `provider-privacy-evidence.md` §2/§3/§4 still has no assigned
owners, no selected `TRANSCRIPTION_MODEL`, and no verified provider
retention/deletion/zero-retention facts, so §5/§6 (disclosure approval,
sign-off record) remain empty. The disclosure pages say this honestly
("we are verifying...") rather than asserting unverified facts.
Production deployment should stay blocked until an accountable
product/legal owner completes that evidence artifact and the disclosure
language above is updated with the confirmed facts and re-approved.

**TASK-029 — automated portion done.** `pnpm typecheck`, `pnpm lint`,
`pnpm test` (including every Assignment Reader suite, with
`AR_TEST_DATABASE_URL` set), `pnpm build` (staging-default), and the new
`pnpm build:production` (every app's wrangler config now has a
`build:production` script; see the root `package.json`) all exit zero as
of this ticket, confirming staging and production binding shapes both
match their `wrangler.jsonc`. Fixed two pre-existing gaps this surfaced:
`apps/seating-frontend`'s standalone `pnpm test` couldn't resolve
`@classprints/shared/auth` from a test file outside `vite-tsconfig-paths`'
covered scope (now aliased in `vite.config.mts`'s `test` block), and
`hierarchy-views.test.tsx`'s read-only `RosterPanelView` contract wrongly
asserted Delete-data should be disabled (REQ-021/REQ-022 exempt it; fixed
the assertion to match the documented, backend-verified contract).

**TASK-030 — not done; requires a real staging environment.** This
engineering session has no Cloudflare staging account access, no real
teacher accounts, and no physical JPEG/PNG/HEIC device captures, and
`TRANSCRIPTION_MODEL` is still unselected (so there is no deployed model
to exercise). This task is inherently a manual/operational QA pass, not
code to write — whoever owns staging access should run Section 6's
canonical scenario plus TASK-030's cross-tenant/failure/retry/deletion/
model-change checklist once TASK-028's evidence artifact is complete.
