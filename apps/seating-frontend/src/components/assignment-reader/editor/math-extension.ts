import { Mathematics } from '@tiptap/extension-mathematics';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type MathNodeKind = 'inline' | 'block';

export interface MathClickDetail {
  kind: MathNodeKind;
  pos: number;
  latex: string;
}

/**
 * PAT-001's `inlineMath`/`blockMath` nodes, backed by the official
 * `@tiptap/extension-mathematics` package (whose node names and `latex`
 * attribute already match our wire schema exactly — see
 * `content-schema.ts` — so no adapter is needed for these two node types).
 *
 * Security: `trust` is pinned `false` (KaTeX's own default, repeated here so
 * a future KaTeX upgrade changing that default can't silently start
 * executing `\href`/`\includegraphics`-style commands from transcribed or
 * teacher-edited LaTeX) and `throwOnError` is `false` so a malformed
 * expression renders as inert plain text instead of throwing inside the
 * editor. Either way, nothing here ever interprets the LaTeX as HTML.
 */
export function createMathExtension(onClickMath: (detail: MathClickDetail) => void) {
  const toLatex = (node: ProseMirrorNode): string =>
    typeof node.attrs.latex === 'string' ? node.attrs.latex : '';

  return Mathematics.configure({
    katexOptions: {
      throwOnError: false,
      trust: false,
      strict: 'ignore',
    },
    inlineOptions: {
      onClick: (node, pos) => onClickMath({ kind: 'inline', pos, latex: toLatex(node) }),
    },
    blockOptions: {
      onClick: (node, pos) => onClickMath({ kind: 'block', pos, latex: toLatex(node) }),
    },
  });
}
