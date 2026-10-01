import type { JSONContent } from '@tiptap/react';
import {
  DRAFT_SCHEMA_VERSION,
  validateAssignmentDraft,
  type AssignmentDraft,
} from '@classprints/assignment-reader-shared';

const EMPTY_DOC: JSONContent = { type: 'doc', content: [] };

/**
 * Converts a server `AssignmentDraft` (PAT-001, content-schema.ts) into the
 * Tiptap/ProseMirror JSON the editor's `content` prop expects. Our node and
 * mark names (`paragraph`, `heading`, `bulletList`, `orderedList`,
 * `listItem`, `hardBreak`, `text`, `inlineMath`, `blockMath`, `imageRegion`,
 * marks `bold`/`italic`/`underline`) are defined to match Tiptap's own
 * defaults plus our two custom node types exactly, so this is intentionally
 * a thin, validating pass-through rather than a structural remap — but it
 * never hands the editor content the shared schema itself rejects (a stray
 * 409 payload shape, a future server bug, or hand-edited DB data), so
 * "invalid JSON cannot enter editor state" holds even if the server ever
 * sends something unexpected.
 */
export function draftToEditorContent(draft: AssignmentDraft | null | undefined): JSONContent {
  if (!draft) return EMPTY_DOC;
  const result = validateAssignmentDraft(draft);
  if (!result.ok || !result.data) {
    console.error('document-adapter: rejected an invalid draft from the server', result.issues);
    return EMPTY_DOC;
  }
  return result.data.doc as JSONContent;
}

export type EditorContentValidation =
  | { ok: true; draft: AssignmentDraft }
  | { ok: false; issues: string[] };

/**
 * Converts the editor's current JSON back into a wire `AssignmentDraft`,
 * validating it against the exact same shared schema the server enforces
 * before it is ever sent — autosave checks `ok` and refuses to call the API
 * on `false` rather than persisting invalid JSON (TASK-024 acceptance).
 */
export function editorContentToDraft(content: JSONContent): EditorContentValidation {
  const candidate = { schemaVersion: DRAFT_SCHEMA_VERSION, doc: content };
  const result = validateAssignmentDraft(candidate);
  if (!result.ok || !result.data) {
    return { ok: false, issues: result.issues };
  }
  return { ok: true, draft: result.data as AssignmentDraft };
}

/** Structural equality good enough to skip a no-op autosave: both sides are
 * already-validated JSON, so a stable stringify is an exact, cheap compare. */
export function draftContentEquals(a: JSONContent, b: JSONContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
