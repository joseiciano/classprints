---
artifact: provider-privacy-evidence
status: Active — Launch Gate (unresolved)
owner_role: Product/Legal (approval) + Engineering Lead (routing verification)
owner_name: TBD — must be assigned before Ticket 9 TASK-028 begins
date_created: 2026-10-01
last_updated: 2026-10-01
---

# Provider & Privacy Launch Evidence — Assignment Reader

Evidence artifact for [Ticket 1](tickets/1-freeze-contracts-and-launch-gates.md)
TASK-003. Tracks verification of the OpenRouter routing configuration and
downstream provider policies, and the product/legal approval required before
production launch (REQ-026, DEP-004, DEP-009, RISK-005, ASSUMPTION-003).

Referenced from code at `apps/assignment-worker/src/transcription/openrouter.repository.ts`
and `apps/assignment-worker/src/types.ts` (§3, structured-output capability).

**This file stores no credentials and no copied legal prose.** It records
verified links, effective dates, selected routing controls, and the status of
approval — per ticket 1 TASK-003. Approved disclosure language itself is
written directly into `apps/seating-frontend/src/pages/privacy-policy.tsx`
and `terms-of-service.tsx` in [Ticket 9](tickets/9-instrument-disclose-verify-and-release.md)
TASK-028, not duplicated here.

## 1. Launch gate (RISK-005 / DEP-009)

Production deployment of Assignment Reader is blocked until every section
below is verified, an accountable product/legal owner has signed off per
REQ-026, and [Ticket 9](tickets/9-instrument-disclose-verify-and-release.md)
TASK-028 has published the approved disclosures to the live privacy policy
and terms of service. Staging/dev deployments are not blocked by this gate.

Current status: **not yet verified**. No model has been selected
(`TRANSCRIPTION_MODEL` / `TRANSCRIPTION_FALLBACK_MODELS` are unset placeholders
in `apps/assignment-worker/wrangler.jsonc`), so the sections below cannot be
completed from this engineering session — they require operations model
selection (ASSUMPTION-003) and an external policy/legal review that only an
accountable product/legal owner can perform.

## 2. Ownership

| Responsibility | Role | Name | Assigned on |
|---|---|---|---|
| Select/approve primary + fallback OpenRouter model IDs | Operations | TBD | — |
| Verify provider policy facts in §4 | Engineering Lead | TBD | — |
| Approve disclosure checklist (REQ-026) | Product/Legal | TBD | — |
| Publish disclosures (Ticket 9 TASK-028) | Engineering + Product/Legal | TBD | — |

This section exists so the launch track has an explicit, assignable owner
(Phase 1 completion criterion: "provider/privacy work is active with explicit
launch ownership"). Names must be filled in before Ticket 9 begins; an empty
"Name" column is a blocker for TASK-028, not a pass.

## 3. Selected OpenRouter routing configuration

Mirrors the `TRANSCRIPTION_MODEL`, `TRANSCRIPTION_FALLBACK_MODELS`, and
`TRANSCRIPTION_STRUCTURED_OUTPUTS` bindings in `apps/assignment-worker/wrangler.jsonc`
(REQ-024, DEP-004). Every row must be filled in and verified before the
corresponding environment is deployed to production.

| Environment | Model (primary) | Fallback model(s) | Image input capable | Native structured outputs | Verified by | Verified on | Source link |
|---|---|---|---|---|---|---|---|
| staging-default | NOT SELECTED | NOT SELECTED | — | — | — | — | — |
| production | NOT SELECTED | NOT SELECTED | — | — | — | — | — |

If native structured-output support cannot be verified for a selected model,
`TRANSCRIPTION_STRUCTURED_OUTPUTS` must be set to `false` for that
environment so the worker falls back to the validated-JSON response path
(functional spec §6); deployment fails rather than assuming an unverified
capability (ASSUMPTION-003).

## 4. Downstream provider policy verification checklist (REQ-026)

Each row must reach **Verified** with a source link and effective date
before production launch. "Verified" means an accountable reviewer read the
provider's current published policy and confirmed the fact; it is not
inferred from marketing copy.

| # | Item | Status | Effective date | Source link | Notes |
|---|---|---|---|---|---|
| 1 | Image input handling (what is sent, how it is transmitted) | Not started | — | — | Includes submission pages and materials/answer keys (decision 10, functional spec §10). |
| 2 | Structured-output / output-handling policy for the selected model(s) | Not started | — | — | |
| 3 | Data collection practices disclosed by provider | Not started | — | — | |
| 4 | Data retention period | Not started | — | — | |
| 5 | Deletion process and timeline, including on account deletion | Not started | — | — | Must cover both OpenRouter and the downstream model provider. |
| 6 | Zero-retention routing availability | Not started | — | — | If available, record whether it is selected and the routing control used. |
| 7 | No unsupported school-policy / legal-compliance claims will be made in disclosures | Not started | — | — | Guardrail for the language drafted in Ticket 9 TASK-028, not a provider fact. |

## 5. Disclosure language approval

Pending. Once §3 and §4 are complete, an accountable product/legal owner
reviews the exact disclosure language proposed for
`apps/seating-frontend/src/pages/privacy-policy.tsx` and
`terms-of-service.tsx` and records approval in §6. The language itself is
authored and committed in Ticket 9 TASK-028, not stored in this file.

## 6. Sign-off record

| Approver | Role | Scope of approval | Date | Evidence link |
|---|---|---|---|---|
| — | — | — | — | — |

Empty until an accountable product/legal owner signs off. Ticket 9 TASK-028's
acceptance criteria requires a non-empty row here before production
deployment proceeds.

## 7. Change log

| Date | Change | Author |
|---|---|---|
| 2026-10-01 | Evidence artifact created; launch track started per Ticket 1 TASK-003. All verification/approval sections intentionally left unresolved pending operations model selection and product/legal review. | Ticket 1 implementation |
