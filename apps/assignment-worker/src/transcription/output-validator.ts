import {
  transcriptionModelOutputSchema,
  type TranscriptionModelOutputPayload,
} from '@classprints/assignment-reader-shared';

/**
 * Local output validator (TASK-013/REQ-012/SEC-002). The enforcement boundary
 * for both the native-structured-output and validated-JSON provider paths:
 * the model output is never trusted. Unknown nodes, marks, attributes, or
 * fields; automatic grading fields; oversized drafts, node counts, and LaTeX
 * strings; duplicate segment keys; and out-of-bounds imageRegion coordinates
 * are all rejected here.
 *
 * Failure summaries feed the next provider attempt (REQ-012) but raw student
 * content is never logged — summaries contain schema paths only (SEC-003).
 */

export interface OutputValidation {
  ok: boolean;
  /** Compact issue strings: dot paths and safe messages, never content. */
  issues: string[];
  /** The schema-parsed output; present only when ok. */
  data?: TranscriptionModelOutputPayload;
}

const MAX_ISSUES = 20;

export const validateModelOutput = (value: unknown): OutputValidation => {
  const parsed = transcriptionModelOutputSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, issues: [], data: parsed.data };
  }
  const issues: string[] = [];
  for (const issue of parsed.error.issues) {
    if (issues.length >= MAX_ISSUES) {
      issues.push('...additional issues omitted');
      break;
    }
    issues.push(`${issue.path.join('.') || 'output'}: ${issue.message}`);
  }
  return { ok: false, issues };
};
