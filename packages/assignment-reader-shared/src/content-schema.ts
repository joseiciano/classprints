import { z } from 'zod';
import type { BlockNode, ParagraphNode } from './types';

const imageRegionReasonSchema = z.enum(['diagram', 'drawing', 'illegible', 'other']);

const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'Expected a lowercase canonical RFC 4122 UUID',
  );

/**
 * Schema-versioned ProseMirror-compatible draft contract (PAT-001).
 *
 * Persisted shape: `{ "schemaVersion": 1, "doc": { "type": "doc", "content": [...] } }`.
 * Allowed nodes: doc, paragraph, heading (levels 1–3), bulletList, orderedList,
 * listItem, hardBreak, text, inlineMath, blockMath, imageRegion. Allowed marks:
 * bold, italic, underline. Unknown nodes/marks/attributes are rejected.
 * Limits: 1 MiB payload, 5,000 nodes, 4,096 LaTeX characters.
 */

type ListItemContent = [ParagraphNode, ...Array<Exclude<BlockNode, ParagraphNode>>];

export const DRAFT_SCHEMA_VERSION = 1 as const;
export const DRAFT_MAX_BYTES = 1024 * 1024; // 1 MiB
export const DRAFT_MAX_NODES = 5000;
export const DRAFT_MAX_LATEX_LENGTH = 4096;

const textMarkSchema = z.object({ type: z.enum(['bold', 'italic', 'underline']) }).strict();

const inlineMathAttrsSchema = z
  .object({
    latex: z
      .string()
      .max(DRAFT_MAX_LATEX_LENGTH, 'LaTeX exceeds the 4,096 character limit'),
  })
  .strict();

const inlineMathNodeSchema = z.object({ type: z.literal('inlineMath'), attrs: inlineMathAttrsSchema }).strict();
const blockMathNodeSchema = z.object({ type: z.literal('blockMath'), attrs: inlineMathAttrsSchema }).strict();

const imageRegionAttrsSchema = z
  .object({
    regionId: uuidSchema,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
    reason: imageRegionReasonSchema,
    label: z.string().max(500).optional(),
  })
  .strict()
  .refine((attrs) => attrs.x + attrs.width <= 1, {
    message: 'imageRegion x + width must not exceed 1',
  })
  .refine((attrs) => attrs.y + attrs.height <= 1, {
    message: 'imageRegion y + height must not exceed 1',
  });

const imageRegionNodeSchema = z.object({ type: z.literal('imageRegion'), attrs: imageRegionAttrsSchema }).strict();

const textNodeSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
    marks: z.array(textMarkSchema).max(3).optional(),
  })
  .strict();

const hardBreakNodeSchema = z.object({ type: z.literal('hardBreak') }).strict();

const paragraphNodeSchema = z
  .object({
    type: z.literal('paragraph'),
    content: z.lazy(() => z.array(inlineNodeSchema)).optional(),
  })
  .strict();

const headingNodeSchema = z
  .object({
    type: z.literal('heading'),
    attrs: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
    content: z.lazy(() => z.array(inlineNodeSchema)).optional(),
  })
  .strict();

const listItemContentOfListItem = () =>
  z.lazy(() =>
    z.array(z.union([paragraphNodeSchema, bulletListNodeSchema, orderedListNodeSchema])),
  ) as unknown as z.ZodType<ListItemContent, z.ZodTypeDef, unknown>;

const bulletListNodeSchema: z.ZodType<
  import('./types').BulletListNode,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    type: z.literal('bulletList'),
    content: z.lazy(() => z.array(listItemNodeSchema).min(1)),
  })
  .strict() as unknown as z.ZodType<
  import('./types').BulletListNode,
  z.ZodTypeDef,
  unknown
>;

const orderedListNodeSchema: z.ZodType<
  import('./types').OrderedListNode,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    type: z.literal('orderedList'),
    attrs: z.object({ start: z.number().int().min(1) }).strict().optional(),
    content: z.lazy(() => z.array(listItemNodeSchema).min(1)),
  })
  .strict() as unknown as z.ZodType<
  import('./types').OrderedListNode,
  z.ZodTypeDef,
  unknown
>;

const listItemNodeSchema = z
  .object({
    type: z.literal('listItem'),
    content: listItemContentOfListItem(),
  })
  .strict()
  .refine(
    (node) =>
      node.content.length >= 1 &&
      node.content[0].type === 'paragraph',
    {
      message: 'listItem requires content starting with a paragraph before nested lists',
    },
  );

const inlineNodeSchema = z.union([textNodeSchema, hardBreakNodeSchema, inlineMathNodeSchema]);

const blockNodeSchema = z.union([
  paragraphNodeSchema,
  headingNodeSchema,
  bulletListNodeSchema,
  orderedListNodeSchema,
  blockMathNodeSchema,
  imageRegionNodeSchema,
]);

const docNodeSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(blockNodeSchema),
  })
  .strict();

export const assignmentDraftSchema = z
  .object({
    schemaVersion: z.literal(DRAFT_SCHEMA_VERSION),
    doc: docNodeSchema,
  })
  .strict();

export type ParsedAssignmentDraft = z.infer<typeof assignmentDraftSchema>;
export type ParsedBlockNode = z.infer<typeof blockNodeSchema>;
export type ParsedInlineNode = z.infer<typeof inlineNodeSchema>;

const countNodes = (node: unknown): number => {
  if (typeof node !== 'object' || node === null) {
    return 0;
  }
  let total = 1;
  const record = node as { content?: unknown; attrs?: unknown };
  if (Array.isArray(record.content)) {
    for (const child of record.content) {
      total += countNodes(child);
    }
  }
  return total;
};

export interface DraftValidationResult {
  ok: boolean;
  issues: string[];
  /** Defined only when `ok`; the schema-parsed draft. */
  data?: ParsedAssignmentDraft;
}

/** Structural + budget validation used by API persistence and the worker. */
export const validateAssignmentDraft = (value: unknown): DraftValidationResult => {
  const issues: string[] = [];

  let jsonBytes: number;
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return { ok: false, issues: ['Draft is not serializable JSON'] };
    }
    jsonBytes = new TextEncoder().encode(serialized).length;
    if (jsonBytes > DRAFT_MAX_BYTES) {
      issues.push('Serialized draft exceeds the 1 MiB limit');
    }
  } catch {
    return { ok: false, issues: ['Draft is not serializable JSON'] };
  }

  const parsed = assignmentDraftSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(`${issue.path.join('.') || 'draft'}: ${issue.message}`);
    }
    return { ok: false, issues };
  }

  const nodeCount = countNodes(parsed.data.doc);
  if (nodeCount > DRAFT_MAX_NODES) {
    issues.push(`Draft exceeds the ${DRAFT_MAX_NODES} node limit`);
  }

  return { ok: issues.length === 0, issues, data: parsed.data };
};

export const parseAssignmentDraft = (value: unknown): ParsedAssignmentDraft => {
  const result = validateAssignmentDraft(value);
  if (!result.ok) {
    throw new Error(`Invalid assignment draft: ${result.issues.join('; ')}`);
  }
  return result.data as ParsedAssignmentDraft;
};
