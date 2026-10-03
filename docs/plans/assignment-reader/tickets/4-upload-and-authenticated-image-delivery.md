---
ticket: 4
phase: "Implementation Phase 4"
goal: GOAL-004
status: Completed
date_created: 2026-10-01
---

# Ticket 4: Implement upload and authenticated image delivery

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on [Ticket 2](2-persistence-and-infrastructure-foundations.md) and [Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md).

**GOAL-004**: Accept, normalize, order, store, replace, and privately render page images without exposing R2 or exceeding Worker request limits.

## Tasks

- [x] **TASK-010**: Add page image repositories and one-page multipart ingestion.
  - Create `apps/seating-backend/src/assignment-reader/page-image.repository.ts` for R2/Images operations and keep orchestration in `assignment-reader.service.ts`.
  - Implement one-file endpoints for material-version and submission pages. Read at most 10 MB plus one byte, inspect JPEG/PNG/HEIC signatures and Images `.info()`, normalize via `IMAGES.input(stream).output({ format: 'image/jpeg' })`, and write the canonical stream to the REQ-020 key with `contentType: image/jpeg` metadata.
  - Insert a page in `uploading`, move it to its stored pre-confirmation state only after R2 succeeds, and delete the just-written object if the database write fails. Reject PDF, unknown signatures, empty images, malformed images, the 21st page, historical materials, and archived ancestry.
  - Dependencies: TASK-005 ([Ticket 2](2-persistence-and-infrastructure-foundations.md)) and TASK-007 ([Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md)).
  - Acceptance: real JPEG, PNG, and HEIC fixtures yield valid JPEG objects; extension/MIME spoofing, 10 MB + 1 byte, malformed image, PDF, and cross-owner uploads fail without orphan rows or blobs.

- [x] **TASK-011**: Implement ordering, confirmation, removal, and replacement commands.
  - Add page removal and replacement endpoints plus `POST /api/v1/documents/:documentType/:documentId/confirm` with the complete ordered page-ID array.
  - In one transaction, verify 1–20 unique owned pages belong to the document, rewrite contiguous positions, increment `transcription_revision`, set every page `queued`, and create attempt/audit seeds. After commit, send one `TranscriptionPageMessage` per page with immutable IDs and revision.
  - Replacement creates a new page ID at the same position and schedules the old key through the deletion pipeline; it never reuses a stale page row or lets an old queue message update the replacement.
  - If queue send fails after commit, record the failure code and expose a safe retry-confirm command that sends only pages still queued without a corresponding accepted attempt.
  - Dependencies: TASK-010 (this ticket) and TASK-006 ([Ticket 2](2-persistence-and-infrastructure-foundations.md)).
  - Acceptance: order survives reload, duplicate/foreign page IDs fail atomically, one message is sent per current page, replay does not double-enqueue completed revisions, and replacement invalidates stale jobs.

- [x] **TASK-012**: Add the authenticated page-image delivery route.
  - Implement `GET /api/v1/pages/:pageId/image` with allow-listed `variant=original|workspace|thumbnail|transcription|region`, validated rotation, and normalized region coordinates.
  - Authorize ownership before R2 access. Stream originals directly and use the Images binding for resize/rotation/crop; immutable page IDs ensure a replacement cannot return stale bytes for the new page.
  - Never return an R2 public URL. Set browser-safe private caching headers and `X-Content-Type-Options: nosniff`.
  - Dependencies: TASK-010 (this ticket).
  - Acceptance: owner can render all variants; unauthenticated/cross-owner requests fail; invalid crop/rotation fails; replacing a page changes the served revision immediately.

## Phase Completion Criteria

The complete upload contract works against real image bindings, the 20-page boundary is enforced across one-page requests, and every rendered image remains auth-gated.

## Dependencies

- Requires [Ticket 2](2-persistence-and-infrastructure-foundations.md) (TASK-005, TASK-006) and [Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md) (TASK-007) complete.
- Unblocks [Ticket 5](5-transcription-retry-and-progress-services.md) (TASK-013 needs TASK-012, TASK-014 needs TASK-011), [Ticket 6](6-review-grading-and-deletion-apis.md) (TASK-018 needs TASK-010), and [Ticket 7](7-hierarchy-and-upload-frontend-surfaces.md) (TASK-022 needs TASK-011).

## Related

- Files: `apps/seating-backend/src/assignment-reader/**` (FILE-004), especially `page-image.repository.ts`.
- Tests: TEST-004 (multipart/image fixtures, spoofing, size limits, orphan-free failure handling).
- See also: REQ-007 through REQ-009, REQ-020, SEC-001, RISK-008, ALT-003.
