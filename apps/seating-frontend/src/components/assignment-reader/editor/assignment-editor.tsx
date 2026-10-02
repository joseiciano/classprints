import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import katex from 'katex';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  List,
  ListOrdered,
  Loader2,
  RefreshCw,
  Sigma,
  Underline as UnderlineIcon,
} from 'lucide-react';
import type {
  DocumentType,
  ImageRegionReason,
  PageSummary,
} from '@classprints/assignment-reader-shared';
import { useReviewPage, useUpdatePageDraft } from '../../../hooks/use-assignment-reader';
import { SeatingApiError } from '../../../lib/http';
import {
  draftContentEquals,
  draftToEditorContent,
  editorContentToDraft,
} from './document-adapter';
import { ImageRegion } from './image-region-extension';
import { createMathExtension, type MathClickDetail } from './math-extension';

const AUTOSAVE_DEBOUNCE_MS = 800;

export interface PendingRegionInsert {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: ImageRegionReason;
  label?: string;
}

export interface AssignmentEditorProps {
  documentType: DocumentType;
  documentId: string;
  page: Pick<PageSummary, 'id' | 'contentRevision' | 'reviewedContentRevision'>;
  initialDraft: import('@classprints/assignment-reader-shared').AssignmentDraft;
  readOnly: boolean;
  /** Re-reads the page from the server for the conflict banner's "Reload
   * latest" action; never called automatically — a 409 only ever surfaces a
   * banner, it never discards the local buffer on its own. */
  onReloadLatest: () => Promise<
    { draft: import('@classprints/assignment-reader-shared').AssignmentDraft; contentRevision: number }
    | undefined
  >;
  /** A region the parent's original-image viewer just captured, consumed
   * once and cleared by the parent regardless of outcome. */
  pendingRegionInsert?: PendingRegionInsert | null;
  onPendingRegionInsertConsumed?: () => void;
}

/**
 * The assignment draft editor (TASK-024): ProseMirror commands/rendering are
 * limited to exactly PAT-001's node/mark set via a restricted StarterKit
 * configuration plus the Mathematics and ImageRegion extensions — there is
 * no generic HTML node, so arbitrary HTML can never enter or leave this
 * editor. Autosave is debounced, always carries `expectedContentRevision`,
 * and a page is marked reviewed only by the explicit "Mark page reviewed"
 * button, enabled exclusively once the latest save has succeeded.
 */
export function AssignmentEditor({
  documentType,
  documentId,
  page,
  initialDraft,
  readOnly,
  onReloadLatest,
  pendingRegionInsert,
  onPendingRegionInsertConsumed,
}: AssignmentEditorProps) {
  const [baselineRevision, setBaselineRevision] = useState(page.contentRevision);
  const [isDirty, setIsDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [mathEditor, setMathEditor] = useState<(MathClickDetail & { isNew: boolean }) | null>(null);
  const [mathLatexInput, setMathLatexInput] = useState('');
  const timeoutRef = useRef<number | null>(null);
  // Tracks the content as of the last successful save (or load/reload), so
  // autosave can skip a true no-op without comparing against the stale
  // original prop forever.
  const lastSavedContentRef = useRef<JSONContent>(draftToEditorContent(initialDraft) as JSONContent);

  const updateDraft = useUpdatePageDraft(page.id, documentType, documentId);
  const reviewPage = useReviewPage(page.id, documentType, documentId);

  const handleMathClick = (detail: MathClickDetail) => {
    setMathEditor({ ...detail, isNew: false });
    setMathLatexInput(detail.latex);
  };

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        // PAT-001 allows only paragraph, heading (1–3), bulletList,
        // orderedList, listItem, hardBreak, text, bold, italic — every other
        // StarterKit node/mark is switched off rather than merely unused, so
        // no input rule or paste handler can smuggle one into the document.
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        code: false,
        link: false,
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      createMathExtension(handleMathClick),
      ImageRegion.configure({ pageId: page.id }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page.id],
  );

  const editor = useEditor(
    {
      extensions,
      content: draftToEditorContent(initialDraft) as JSONContent,
      editable: !readOnly,
      immediatelyRender: false,
      onUpdate: () => {
        if (conflict) return;
        setIsDirty(true);
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
      },
    },
    [page.id, readOnly],
  );

  // Consume a region the original-image viewer just captured.
  useEffect(() => {
    if (!pendingRegionInsert || !editor) return;
    editor
      .chain()
      .focus()
      .insertImageRegion({
        regionId: crypto.randomUUID(),
        ...pendingRegionInsert,
      })
      .run();
    onPendingRegionInsertConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRegionInsert, editor]);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  const save = async () => {
    if (!editor || conflict) return;
    const validated = editorContentToDraft(editor.getJSON());
    if (!validated.ok) {
      // Should be unreachable given the restricted node/mark set, but a
      // draft this invalid must never reach the server (TASK-024).
      console.error('assignment-editor: refused to save invalid draft', validated.issues);
      return;
    }
    if (draftContentEquals(validated.draft.doc as JSONContent, lastSavedContentRef.current)) {
      setIsDirty(false);
      return;
    }
    try {
      const result = await updateDraft.mutateAsync({
        draft: validated.draft,
        expectedContentRevision: baselineRevision,
      });
      lastSavedContentRef.current = validated.draft.doc as JSONContent;
      setBaselineRevision(result.page.contentRevision);
      setIsDirty(false);
    } catch (error) {
      if (error instanceof SeatingApiError && error.code === 'REVISION_CONFLICT') {
        setConflict(true);
      }
    }
  };

  const handleReloadLatest = async () => {
    const fresh = await onReloadLatest();
    if (!fresh || !editor) return;
    const freshContent = draftToEditorContent(fresh.draft) as JSONContent;
    editor.commands.setContent(freshContent, { emitUpdate: false });
    lastSavedContentRef.current = freshContent;
    setBaselineRevision(fresh.contentRevision);
    setConflict(false);
    setIsDirty(false);
  };

  const closeMathEditor = () => {
    setMathEditor(null);
    setMathLatexInput('');
  };

  const commitMathEditor = () => {
    if (!editor || !mathEditor) return;
    const latex = mathLatexInput.trim();
    if (mathEditor.isNew) {
      if (!latex) return closeMathEditor();
      if (mathEditor.kind === 'inline') {
        editor.chain().focus().insertInlineMath({ latex }).run();
      } else {
        editor.chain().focus().insertBlockMath({ latex }).run();
      }
    } else if (mathEditor.kind === 'inline') {
      editor.chain().focus().updateInlineMath({ pos: mathEditor.pos, latex }).run();
    } else {
      editor.chain().focus().updateBlockMath({ pos: mathEditor.pos, latex }).run();
    }
    closeMathEditor();
  };

  const deleteMathEditor = () => {
    if (!editor || !mathEditor || mathEditor.isNew) return closeMathEditor();
    if (mathEditor.kind === 'inline') {
      editor.chain().focus().deleteInlineMath({ pos: mathEditor.pos }).run();
    } else {
      editor.chain().focus().deleteBlockMath({ pos: mathEditor.pos }).run();
    }
    closeMathEditor();
  };

  const mathPreviewHtml = useMemo(() => {
    if (!mathEditor) return '';
    try {
      // Safe: KaTeX's own sanitized output, with `trust: false` (never
      // executes \href/\includegraphics-style commands), same model as the
      // node view's `katex.render` call.
      return katex.renderToString(mathLatexInput, {
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        displayMode: mathEditor.kind === 'block',
      });
    } catch {
      return '';
    }
  }, [mathEditor, mathLatexInput]);

  const canMarkReviewed =
    !readOnly &&
    !isDirty &&
    !conflict &&
    !updateDraft.isPending &&
    page.reviewedContentRevision !== baselineRevision;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1">
          <ToolbarButton
            label="Bold"
            icon={BoldIcon}
            active={editor?.isActive('bold')}
            disabled={readOnly}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="Italic"
            icon={ItalicIcon}
            active={editor?.isActive('italic')}
            disabled={readOnly}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            label="Underline"
            icon={UnderlineIcon}
            active={editor?.isActive('underline')}
            disabled={readOnly}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <ToolbarButton
            label="Bullet list"
            icon={List}
            active={editor?.isActive('bulletList')}
            disabled={readOnly}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="Numbered list"
            icon={ListOrdered}
            active={editor?.isActive('orderedList')}
            disabled={readOnly}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <ToolbarButton
            label="Insert math"
            icon={Sigma}
            disabled={readOnly}
            onClick={() => {
              setMathEditor({ kind: 'inline', pos: -1, latex: '', isNew: true });
              setMathLatexInput('');
            }}
          />
        </div>
        <SaveStatus isDirty={isDirty} isPending={updateDraft.isPending} conflict={conflict} />
      </div>

      {conflict ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <span>This page was edited elsewhere. Your unsaved changes are kept here, but not saved.</span>
          <button
            type="button"
            onClick={() => void handleReloadLatest()}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-destructive/40 bg-card px-3 text-xs font-semibold text-destructive hover:bg-destructive/10"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Reload latest
          </button>
        </div>
      ) : null}

      <div className="rounded-[10px] border border-border bg-background p-4">
        <EditorContent
          editor={editor}
          className="prose-assignment max-w-none text-sm leading-7 text-foreground focus:outline-none"
        />
      </div>

      {!readOnly ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canMarkReviewed || reviewPage.isPending}
            onClick={() =>
              reviewPage.mutate({ expectedContentRevision: baselineRevision })
            }
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-pine-ink disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-primary/80"
          >
            {reviewPage.isPending ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
            {page.reviewedContentRevision === baselineRevision ? 'Reviewed' : 'Mark page reviewed'}
          </button>
        </div>
      ) : null}
      {reviewPage.error instanceof SeatingApiError ? (
        <p role="alert" className="text-sm text-destructive">{reviewPage.error.message}</p>
      ) : null}

      {mathEditor ? (
        <div className="space-y-2 rounded-[10px] border border-primary/30 bg-card p-3.5 shadow-card">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mathEditor.kind === 'inline' ? 'Inline math (LaTeX)' : 'Block math (LaTeX)'}
          </label>
          <textarea
            autoFocus
            rows={2}
            value={mathLatexInput}
            onChange={(event) => setMathLatexInput(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            placeholder="e.g. x^2 + y^2 = r^2"
          />
          <div
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            // Safe: KaTeX-rendered HTML only, `trust: false` (see above).
            dangerouslySetInnerHTML={{ __html: mathPreviewHtml || '<span class="text-muted-foreground">Preview</span>' }}
          />
          <div className="flex justify-end gap-2">
            {!mathEditor.isNew ? (
              <button
                type="button"
                onClick={deleteMathEditor}
                className="inline-flex min-h-8 items-center rounded-full border border-destructive/30 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeMathEditor}
              className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-xs font-semibold text-foreground hover:border-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitMathEditor}
              className="inline-flex min-h-8 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-pine-ink dark:hover:bg-primary/80"
            >
              {mathEditor.isNew ? 'Insert' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof BoldIcon;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-grid h-8 w-8 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
      }`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

function SaveStatus({
  isDirty,
  isPending,
  conflict,
}: {
  isDirty: boolean;
  isPending: boolean;
  conflict: boolean;
}) {
  if (conflict) return <span className="text-xs font-medium text-destructive">Not saved · conflict</span>;
  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (isDirty) return <span className="text-xs font-medium text-muted-foreground">Unsaved changes…</span>;
  return <span className="text-xs font-medium text-primary">Saved</span>;
}
