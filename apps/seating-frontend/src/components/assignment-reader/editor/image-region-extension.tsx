import { mergeAttributes, Node, type NodeViewRendererProps } from '@tiptap/core';
import { pageImageUrl } from '../../../lib/assignment-reader-api';

export interface ImageRegionExtensionOptions {
  /** The current page's ID; every region crop is fetched from this page's
   * original image (TASK-012) — never a public URL or base64 data. */
  pageId: string;
}

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    imageRegion: {
      insertImageRegion: (attrs: {
        regionId: string;
        x: number;
        y: number;
        width: number;
        height: number;
        reason: 'diagram' | 'drawing' | 'illegible' | 'other';
        label?: string;
      }) => ReturnType;
    };
  }
}

const REASON_LABELS: Record<string, string> = {
  diagram: 'Diagram',
  drawing: 'Drawing',
  illegible: 'Illegible',
  other: 'Other',
};

/**
 * PAT-001's `imageRegion` node (content-schema.ts): a selectable block atom
 * with no editable child content — it renders a crop of the page's
 * authenticated original image rather than any editable text or embedded
 * image bytes, so it never persists or renders arbitrary HTML and never
 * carries a public URL or base64 payload in frontend state (TASK-012).
 */
export const ImageRegion = Node.create<ImageRegionExtensionOptions>({
  name: 'imageRegion',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { pageId: '' };
  },

  addAttributes() {
    return {
      regionId: { default: null },
      x: { default: 0 },
      y: { default: 0 },
      width: { default: 1 },
      height: { default: 1 },
      reason: { default: 'other' },
      label: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="image-region"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'image-region' })];
  },

  addCommands() {
    return {
      insertImageRegion:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addNodeView() {
    return (props: NodeViewRendererProps) => {
      const { node } = props;
      const wrapper = document.createElement('div');
      wrapper.className =
        'my-2 overflow-hidden rounded-[10px] border border-border bg-muted/40 max-w-xs';

      const img = document.createElement('img');
      img.alt = node.attrs.label || `${REASON_LABELS[node.attrs.reason] ?? 'Image'} region`;
      img.className = 'block w-full object-contain';
      img.src = pageImageUrl(this.options.pageId, {
        variant: 'region',
        x: node.attrs.x,
        y: node.attrs.y,
        width: node.attrs.width,
        height: node.attrs.height,
      });
      wrapper.appendChild(img);

      const caption = document.createElement('div');
      caption.className =
        'flex items-center justify-between gap-2 border-t border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground';
      const reasonSpan = document.createElement('span');
      reasonSpan.textContent = node.attrs.label
        ? `${REASON_LABELS[node.attrs.reason] ?? 'Region'} · ${node.attrs.label}`
        : REASON_LABELS[node.attrs.reason] ?? 'Region';
      caption.appendChild(reasonSpan);
      wrapper.appendChild(caption);

      return { dom: wrapper };
    };
  },
});
