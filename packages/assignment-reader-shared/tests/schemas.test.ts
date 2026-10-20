import { describe, expect, it } from 'vitest';
import {
  DRAFT_MAX_LATEX_LENGTH,
  DRAFT_MAX_NODES,
  parseAssignmentDraft,
  validateAssignmentDraft,
} from '../src/content-schema';
import {
  transcriptionModelOutputSchema,
  questionSegmentInputSchema,
  teacherQuestionJudgmentSchema,
} from '../src/output-schema';
import {
  confirmDocumentBodySchema,
  pageImageQuerySchema,
  retranscribeDocumentBodySchema,
  updatePageDraftBodySchema,
  applyQuestionPointsBodySchema,
  decimal2Schema,
  isDecimal2,
  searchQuerySchema,
  isoDateTimeSchema,
  pageNumberSchema,
  canonicalListQuerySchema,
  classListQuerySchema,
  saveSeatingChartBodySchema,
} from '../src/schemas';
import {
  transcriptionPageMessageSchema,
  deletionOperationMessageSchema,
  transcriptionDlqMessageSchema,
  transcriberQueueMessageSchema,
} from '../src/queue-messages';

const UUID_A = 'a0000000-0000-4000-8000-000000000001';
const UUID_B = 'b0000000-0000-4000-8000-000000000002';

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

describe('PAT-001 draft schema', () => {
  const validDraft = {
    schemaVersion: 1,
    doc: {
      type: 'doc',
      content: [
        paragraph('Hello'),
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Question', marks: [{ type: 'bold' }] }],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('one')] }] },
        { type: 'orderedList', attrs: { start: 2 }, content: [{ type: 'listItem', content: [paragraph('two')] }] },
        { type: 'blockMath', attrs: { latex: 'E=mc^2' } },
        paragraph('inline'),
        { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'x' } }] },
        { type: 'imageRegion', attrs: { regionId: UUID_A, x: 0.1, y: 0.2, width: 0.3, height: 0.4, reason: 'diagram' } },
      ],
    },
  };

  it('accepts the full allowed node/mark set and round-trips', () => {
    const result = validateAssignmentDraft(validDraft);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.data).toEqual(validDraft);
    expect(parseAssignmentDraft(validDraft)).toEqual(validDraft);
  });

  it('rejects unknown nodes, marks, attributes, and fields', () => {
    const cases: unknown[] = [
      { ...validDraft, schemaVersion: 2 },
      { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'codeBlock', content: [] }] } },
      {
        schemaVersion: 1,
        doc: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }] }] },
          ],
        },
      },
      {
        schemaVersion: 1,
        doc: {
          type: 'doc',
          content: [{ type: 'paragraph', extra: true, content: [] }],
        },
      },
      { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 4 }, content: [] }] } },
      { ...validDraft, extraField: 1 },
    ];
    for (const draft of cases) {
      const result = validateAssignmentDraft(draft);
      expect(result.ok, JSON.stringify(draft)).toBe(false);
    }
  });

  it('rejects unsafe imageRegion coordinates', () => {
    const mk = (attrs: Record<string, unknown>) => ({
      schemaVersion: 1,
      doc: { type: 'doc', content: [{ type: 'imageRegion', attrs }] },
    });
    expect(validateAssignmentDraft(mk({ regionId: UUID_A, x: 0.9, y: 0, width: 0.2, height: 0.1, reason: 'other' })).ok).toBe(false);
    expect(validateAssignmentDraft(mk({ regionId: UUID_A, x: -0.1, y: 0, width: 0.2, height: 0.1, reason: 'other' })).ok).toBe(false);
    expect(validateAssignmentDraft(mk({ regionId: UUID_A, x: 0, y: 0.5, width: 0.1, height: 0.6, reason: 'other' })).ok).toBe(false);
    expect(validateAssignmentDraft(mk({ regionId: UUID_A, x: 0, y: 0, width: 0, height: 0.1, reason: 'other' })).ok).toBe(false);
  });

  it('rejects oversized payloads, documents, and LaTeX', () => {
    const huge = {
      schemaVersion: 1,
      doc: { type: 'doc', content: [paragraph('x'.repeat(1024 * 1024 + 1))] },
    };
    expect(validateAssignmentDraft(huge).ok).toBe(false);

    const tooManyNodes = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: Array.from({ length: DRAFT_MAX_NODES + 1 }, () => paragraph('x')),
      },
    };
    expect(validateAssignmentDraft(tooManyNodes).ok).toBe(false);

    const longLatex = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [{ type: 'blockMath', attrs: { latex: 'x'.repeat(DRAFT_MAX_LATEX_LENGTH + 1) } }],
      },
    };
    expect(validateAssignmentDraft(longLatex).ok).toBe(false);
  });

  it('accepts an empty document', () => {
    expect(validateAssignmentDraft({ schemaVersion: 1, doc: { type: 'doc', content: [] } }).ok).toBe(true);
  });

  it('updatePageDraftBodySchema rejects unknown fields and stale shapes', () => {
    expect(
      updatePageDraftBodySchema.safeParse({
        draft: validDraft,
        expectedContentRevision: 1,
        sneaky: true,
      }).success,
    ).toBe(false);
    expect(
      updatePageDraftBodySchema.safeParse({ draft: validDraft, expectedContentRevision: -1 })
        .success,
    ).toBe(false);
  });
});

describe('request boundary schemas', () => {
  it('decimal2 accepts at most two fractional digits and rejects negatives', () => {
    expect(decimal2Schema.safeParse(8.5).success).toBe(true);
    expect(decimal2Schema.safeParse(10).success).toBe(true);
    expect(decimal2Schema.safeParse(0.001).success).toBe(false);
    expect(decimal2Schema.safeParse(-1).success).toBe(false);
    expect(decimal2Schema.safeParse(Number.NaN).success).toBe(false);
  });

  it('confirm body requires 1..20 unique page ids and rejects extra fields', () => {
    expect(confirmDocumentBodySchema.safeParse({ pageIds: [UUID_A] }).success).toBe(true);
    expect(confirmDocumentBodySchema.safeParse({ pageIds: [] }).success).toBe(false);
    expect(
      confirmDocumentBodySchema.safeParse({ pageIds: [UUID_A, UUID_A] }).success,
    ).toBe(true); // uniqueness is an API-level state rule, not a wire-shape rule
    expect(confirmDocumentBodySchema.safeParse({ pageIds: [UUID_A], pageSize: 10 }).success).toBe(false);
  });

  it('retranscribe body requires confirmed literal and revision', () => {
    expect(
      retranscribeDocumentBodySchema.safeParse({
        expectedDocumentRevision: 3,
        confirmed: true,
        overwriteTeacherEdits: true,
        resetQuestionJudgments: true,
      }).success,
    ).toBe(true);
    expect(
      retranscribeDocumentBodySchema.safeParse({
        expectedDocumentRevision: 3,
        confirmed: false,
        overwriteTeacherEdits: false,
        resetQuestionJudgments: false,
      }).success,
    ).toBe(false);
  });

  it('apply-question-points requires confirmed literal and finite expected total', () => {
    expect(
      applyQuestionPointsBodySchema.safeParse({
        expectedDocumentRevision: 1,
        expectedTotal: 7.5,
        confirmed: true,
      }).success,
    ).toBe(true);
    expect(
      applyQuestionPointsBodySchema.safeParse({
        expectedDocumentRevision: 1,
        expectedTotal: 7.5,
        confirmed: false,
      }).success,
    ).toBe(false);
  });

  it('save seating chart requires numeric resultId and class UUID', () => {
    expect(saveSeatingChartBodySchema.safeParse({ classId: UUID_A, resultId: 3 }).success).toBe(true);
    expect(saveSeatingChartBodySchema.safeParse({ classId: UUID_A, resultId: '3' }).success).toBe(false);
  });
});

describe('canonical list query schemas', () => {
  it('rejects pageSize everywhere', () => {
    expect(classListQuerySchema.safeParse({ pageSize: 10 }).success).toBe(false);
    expect(
      canonicalListQuerySchema(['createdAt'] as const).safeParse({ pageSize: 10 }).success,
    ).toBe(false);
  });

  it('accepts declared sort values and rejects undeclared ones', () => {
    expect(classListQuerySchema.safeParse({ sort: 'studentCount', direction: 'desc', page: 2 }).success).toBe(true);
    expect(classListQuerySchema.safeParse({ sort: 'grade' }).success).toBe(false);
    expect(classListQuerySchema.safeParse({ status: 'archived' }).success).toBe(true);
    expect(classListQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(classListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('page image query schema', () => {
  it('requires all four crop fields only for region', () => {
    expect(pageImageQuerySchema.safeParse({ variant: 'region', x: 0, y: 0, width: 0.5, height: 0.5 }).success).toBe(true);
    expect(pageImageQuerySchema.safeParse({ variant: 'region', x: 0, y: 0, width: 0.5 }).success).toBe(false);
    expect(pageImageQuerySchema.safeParse({ variant: 'workspace', x: 0, y: 0, width: 0.5, height: 0.5 }).success).toBe(false);
  });

  it('rejects out-of-bounds crops and invalid rotations', () => {
    expect(pageImageQuerySchema.safeParse({ variant: 'region', x: 0.6, y: 0, width: 0.5, height: 0.5 }).success).toBe(false);
    expect(pageImageQuerySchema.safeParse({ variant: 'region', x: 0, y: 0.6, width: 0.5, height: 0.5 }).success).toBe(false);
    expect(pageImageQuerySchema.safeParse({ variant: 'region', x: -0.1, y: 0, width: 0.5, height: 0.5 }).success).toBe(false);
    expect(pageImageQuerySchema.safeParse({ variant: 'workspace', rotation: 45 }).success).toBe(false);
    expect(pageImageQuerySchema.safeParse({ variant: 'workspace', rotation: 90 }).success).toBe(true);
  });
});

describe('queue message schemas', () => {
  const message = {
    kind: 'transcription_page' as const,
    pageId: UUID_A,
    transcriptionRevision: 2,
    documentType: 'submission' as const,
    attemptCount: 0,
    queuedAtMs: 1_700_000_000_000,
    isRetry: false,
  };

  it('accepts a well-formed transcription page message and rejects unknown fields', () => {
    expect(transcriptionPageMessageSchema.safeParse(message).success).toBe(true);
    expect(transcriptionPageMessageSchema.safeParse({ ...message, extra: 1 }).success).toBe(false);
    expect(transcriptionPageMessageSchema.safeParse({ ...message, pageId: 'not-a-uuid' }).success).toBe(false);
  });

  it('discriminates the transcriber union by kind', () => {
    const cleanup = {
      kind: 'deletion_operation' as const,
      operationId: UUID_B,
      targetType: 'page' as const,
    };
    expect(deletionOperationMessageSchema.safeParse(cleanup).success).toBe(true);
    expect(transcriberQueueMessageSchema.safeParse(message).success).toBe(true);
    expect(transcriberQueueMessageSchema.safeParse({ kind: 'nonsense' }).success).toBe(false);
  });

  it('rejects DLQ failure codes outside the REQ-014 taxonomy', () => {
    const dlq = {
      kind: 'transcription_dlq' as const,
      original: message,
      failureCode: 'provider_timeout',
      attemptsMade: 3,
      lastErrorAtMs: 1_700_000_000_000,
    };
    expect(transcriptionDlqMessageSchema.safeParse(dlq).success).toBe(true);
    expect(
      transcriptionDlqMessageSchema.safeParse({ ...dlq, failureCode: 'completed' }).success,
    ).toBe(false);
    expect(
      transcriptionDlqMessageSchema.safeParse({ ...dlq, failureCode: 'who_knows' }).success,
    ).toBe(false);
  });
});

describe('fixed scalar validators', () => {
  it('decimal2 accepts every two-decimal value including float-hostile doubles', () => {
    for (const value of [8.2, 0.07, 0.14, 0.29, 19.9, 9.6, 1.09, 0.1 + 0.2, 8.5, 0.01, 10]) {
      expect(decimal2Schema.safeParse(value).success, `${value}`).toBe(true);
    }
    for (const value of [8.125, 0.615, 0.001, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decimal2Schema.safeParse(value).success, `${value}`).toBe(false);
    }
  });

  it('search query length checks the trimmed value, not the raw input', () => {
    expect(searchQuerySchema.safeParse('a'.repeat(196) + '     ').success).toBe(true);
    expect(searchQuerySchema.safeParse('a'.repeat(200)).success).toBe(true);
    expect(searchQuerySchema.safeParse('a'.repeat(200) + '   ').success).toBe(true);
    expect(searchQuerySchema.safeParse('a'.repeat(201)).success).toBe(false);
  });

  it('page number coerces digit strings but rejects booleans, null, and non-integers', () => {
    expect(pageNumberSchema.safeParse('2').success).toBe(true);
    expect(pageNumberSchema.safeParse(2).success).toBe(true);
    expect(pageNumberSchema.safeParse(true).success).toBe(false);
    expect(pageNumberSchema.safeParse(null).success).toBe(false);
    expect(pageNumberSchema.safeParse('2.5').success).toBe(false);
    expect(pageNumberSchema.safeParse('abc').success).toBe(false);
  });

  it('iso datetime requires RFC 3339 shape and a real calendar date', () => {
    expect(isoDateTimeSchema.safeParse('2026-09-24T12:00:00Z').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('2026-09-24T12:00:00.123Z').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('2026-09-24T12:00:00+00:00').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('2026-13-01T00:00:00Z').success).toBe(false);
    expect(isoDateTimeSchema.safeParse('2026-09-24 12:00:00Z').success).toBe(false);
  });

  it('isDecimal2 agrees with decimal2Schema on both branches', () => {
    expect(isDecimal2(8.2)).toBe(true);
    expect(isDecimal2(0.07)).toBe(true);
    expect(isDecimal2(8.125)).toBe(false);
    expect(isDecimal2(Number.NaN)).toBe(false);
  });
});

describe('REQ-012 provider output schemas', () => {
  const segment = {
    key: 'q1',
    label: 'Question 1',
    questionText: 'What is 2+2?',
    responseText: '4',
  };

  it('accepts model output with draft and transient segments', () => {
    const output = {
      draft: { schemaVersion: 1, doc: { type: 'doc', content: [paragraph('answer')] } },
      questionSegments: [segment],
    };
    expect(transcriptionModelOutputSchema.safeParse(output).success).toBe(true);
  });

  it('rejects judgments, points, comments, or scores inside model output', () => {
    const output = {
      draft: { schemaVersion: 1, doc: { type: 'doc', content: [] } },
      questionSegments: [{ ...segment, judgment: 'correct' }],
    };
    expect(transcriptionModelOutputSchema.safeParse(output).success).toBe(false);
    expect(
      transcriptionModelOutputSchema.safeParse({
        draft: { schemaVersion: 1, doc: { type: 'doc', content: [] } },
        questionSegments: [{ ...segment, awardedPoints: 1 }],
      }).success,
    ).toBe(false);
    expect(
      transcriptionModelOutputSchema.safeParse({
        draft: { schemaVersion: 1, doc: { type: 'doc', content: [] } },
        score: 5,
        questionSegments: [],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate transient segment keys and empty segments', () => {
    const output = {
      draft: { schemaVersion: 1, doc: { type: 'doc', content: [] } },
      questionSegments: [segment, { ...segment, questionText: 'again' }],
    };
    expect(transcriptionModelOutputSchema.safeParse(output).success).toBe(false);
    expect(
      transcriptionModelOutputSchema.safeParse({
        draft: { schemaVersion: 1, doc: { type: 'doc', content: [] } },
        questionSegments: [{ ...segment, key: '' }],
      }).success,
    ).toBe(false);
  });

  it('questionSegmentInput rejects oversized text and unknown fields', () => {
    expect(
      questionSegmentInputSchema.safeParse({ ...segment, responseText: 'x'.repeat(20_001) })
        .success,
    ).toBe(false);
    expect(questionSegmentInputSchema.safeParse({ ...segment, judgment: 'correct' }).success).toBe(
      false,
    );
  });

  it('teacher judgments allow decimal2 points only and no identity fields', () => {
    expect(
      teacherQuestionJudgmentSchema.safeParse({
        segmentId: UUID_A,
        judgment: 'correct',
        awardedPoints: 1.5,
        comment: 'good',
      }).success,
    ).toBe(true);
    expect(
      teacherQuestionJudgmentSchema.safeParse({
        segmentId: UUID_A,
        judgment: 'correct',
        awardedPoints: 1.5,
        comment: 'good',
        gradedBy: 'model',
      }).success,
    ).toBe(false);
    expect(
      teacherQuestionJudgmentSchema.safeParse({
        segmentId: UUID_A,
        judgment: 'correct',
        awardedPoints: 1.505,
        comment: null,
      }).success,
    ).toBe(false);
  });
});

describe('PAT-001 list content conformance (prosemirror-schema-list)', () => {
  it('rejects empty listItems', () => {
    const draft = {
      schemaVersion: 1,
      doc: { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [] }] }] },
    };
    expect(validateAssignmentDraft(draft).ok).toBe(false);
  });

  it('rejects listItems that start with a nested list instead of a paragraph', () => {
    const draft = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'bulletList',
                    content: [{ type: 'listItem', content: [paragraph('deep')] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(validateAssignmentDraft(draft).ok).toBe(false);
  });

  it('rejects empty lists and accepts a paragraph-led listItem with a nested list', () => {
    const emptyList = {
      schemaVersion: 1,
      doc: { type: 'doc', content: [{ type: 'bulletList', content: [] }] },
    };
    expect(validateAssignmentDraft(emptyList).ok).toBe(false);

    const nested = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  paragraph('outer'),
                  {
                    type: 'bulletList',
                    content: [{ type: 'listItem', content: [paragraph('inner')] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(validateAssignmentDraft(nested).ok).toBe(true);
  });

  it('rejects oversized UTF-8 payloads with multibyte characters', () => {
    const huge = {
      schemaVersion: 1,
      doc: { type: 'doc', content: [paragraph('π'.repeat(700_000))] },
    };
    expect(validateAssignmentDraft(huge).ok).toBe(false);
  });
});
