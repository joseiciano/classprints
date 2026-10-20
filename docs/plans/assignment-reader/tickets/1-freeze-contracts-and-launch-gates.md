---
ticket: 1
phase: "Implementation Phase 1"
goal: GOAL-001
status: In Progress
date_created: 2026-10-01
---

# Ticket 1: Freeze contracts and launch gates

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-yellow)

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on nothing (foundational phase; all other tickets depend on this one).

**GOAL-001**: Establish one deterministic data/API/editor/privacy contract so schema, API, worker, and frontend tracks can proceed without later interpretation.

## Tasks

- [x] **TASK-001**: Create `packages/assignment-reader-shared` and encode the cross-runtime contract.
  - Add `package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`, `src/schemas.ts`, `src/content-schema.ts`, and `src/queue-messages.ts`; export every enum, list request/response schema, command payload, draft node, question segment, error code, and discriminated queue message declared by `plan/assignment-reader/api-manifest.md`.
  - Add the package to `apps/seating-backend/package.json`, `apps/seating-frontend/package.json`, and the new worker package in TASK-006; update `pnpm-lock.yaml` once.
  - Use Zod schemas at every API/provider boundary and plain TypeScript types internally; do not put React, Hono, Postgres, or Worker binding types in the package.
  - Acceptance: backend, frontend, and worker import the same processing/review/grading enums and `schemaVersion: 1` validator; malformed nodes, unsafe crop coordinates, automatic judgments, and unknown fields are rejected.

- [x] **TASK-002**: Record and enforce the resolved state and lifecycle rules in service-level transition functions.
  - Add pure functions to the shared package for document processing rollup, allowed review/grading transitions, score validation, assignment aggregate status, and retranscription consent requirements.
  - Encode the exact decisions in REQ-010, REQ-016 through REQ-019, PAT-002, PAT-003, and PAT-004; do not derive these rules independently in UI and API.
  - Acceptance: table-driven contract tests cover every allowed/forbidden transition, mixed page-state precedence, zero-submission assignment status, decimal scores, and edit-triggered review invalidation.

- [ ] **TASK-003**: Start the external provider/privacy launch track and define its evidence artifact.
  - Verify the selected OpenRouter routing configuration and downstream provider policies for image input, structured outputs, data collection, retention, deletion, and zero-retention handling.
  - Store no credentials or copied legal prose in the repository. Record verified links, effective dates, selected routing controls, and approved disclosure language directly in `apps/seating-frontend/src/pages/privacy-policy.tsx` and `apps/seating-frontend/src/pages/terms-of-service.tsx` during [Ticket 9](9-instrument-disclose-verify-and-release.md) TASK-028.
  - Acceptance: an accountable product/legal owner has approved the exact disclosure checklist in REQ-026; production release remains blocked until TASK-028 ([Ticket 9](9-instrument-disclose-verify-and-release.md)) is complete.

## Phase Completion Criteria

The shared package compiles; transition contract tests pass; no blocking artifact ambiguity remains; provider/privacy work is active with explicit launch ownership.

## Dependencies

- None — this is the foundational ticket. Every other ticket depends on TASK-001/TASK-002 completing first.
- TASK-003 feeds [Ticket 9](9-instrument-disclose-verify-and-release.md) (TASK-028) and is a hard production-launch gate (RISK-005).

## Related

- Files: `packages/assignment-reader-shared/**` (FILE-003).
- Tests: TEST-001 (shared contract tests); package command `pnpm --filter @classprints/assignment-reader-shared typecheck` (TEST-009).
- See also: [Assignment Reader API Manifest](../api-routes/api-manifest.md), [Provider & Privacy Launch Evidence](../provider-privacy-evidence.md) (TASK-003 evidence artifact), REQ-026, DEP-009, RISK-005, ASSUMPTION-003.
