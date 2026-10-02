import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import type { ImageRegionReason, Rotation } from '@classprints/assignment-reader-shared';
import { pageImageUrl } from '../../../lib/assignment-reader-api';
import type { PendingRegionInsert } from '../editor/assignment-editor';

const ZOOM_STEPS = [1, 1.5, 2, 2.5] as const;
const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A region is always selected on whatever rotation is currently displayed,
 * but PAT-001's `imageRegion` attrs (and the region-crop image route) are
 * normalized against the original, unrotated image — so a rect drawn at a
 * non-zero rotation must be rotated back before it is handed to the editor.
 * Pure and exported for testing.
 */
export function rotateNormalizedRect(rect: NormalizedRect, rotation: Rotation): NormalizedRect {
  switch (rotation) {
    case 0:
      return rect;
    case 90:
      return {
        x: rect.y,
        y: 1 - rect.x - rect.width,
        width: rect.height,
        height: rect.width,
      };
    case 180:
      return {
        x: 1 - rect.x - rect.width,
        y: 1 - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
      };
    case 270:
      return {
        x: 1 - rect.y - rect.height,
        y: rect.x,
        width: rect.height,
        height: rect.width,
      };
    default:
      return rect;
  }
}

/**
 * The original-page viewer (TASK-025): zoom/rotation and image-region
 * selection, delivered exclusively through the authenticated page-image
 * route (TASK-012) — never a public URL or base64 payload. Dragging on the
 * image proposes a normalized crop; the teacher then picks a reason (and
 * optional label) before it is handed to the editor as an `imageRegion`
 * node, so a region is always deliberate rather than accidental.
 */
export function OriginalViewer({
  pageId,
  label,
  canInsertRegion,
  onInsertRegion,
}: {
  pageId: string;
  label: string;
  canInsertRegion: boolean;
  onInsertRegion: (region: PendingRegionInsert) => void;
}) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [draftRect, setDraftRect] = useState<NormalizedRect | null>(null);
  const [reason, setReason] = useState<ImageRegionReason>('diagram');
  const [regionLabel, setRegionLabel] = useState('');
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const zoom = ZOOM_STEPS[zoomIndex];
  const rotation = ROTATIONS[rotationIndex];

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!canInsertRegion || !imageRef.current) return;
    const bounds = imageRef.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    dragStart.current = { x, y };
    setDraftRect({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragStart.current || !imageRef.current) return;
    const bounds = imageRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    const start = dragStart.current;
    setDraftRect({
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  };

  const handleMouseUp = () => {
    dragStart.current = null;
    if (draftRect && (draftRect.width < 0.02 || draftRect.height < 0.02)) {
      setDraftRect(null);
    }
  };

  const confirmRegion = () => {
    if (!draftRect) return;
    const originalRect = rotateNormalizedRect(draftRect, rotation);
    onInsertRegion({ ...originalRect, reason, label: regionLabel.trim() || undefined });
    setDraftRect(null);
    setRegionLabel('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <IconButton
            label="Zoom out"
            icon={ZoomOut}
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
          />
          <IconButton
            label="Zoom in"
            icon={ZoomIn}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
          />
          <IconButton
            label="Rotate"
            icon={RotateCw}
            onClick={() => setRotationIndex((i) => (i + 1) % ROTATIONS.length)}
          />
        </div>
      </div>

      <div className="overflow-auto rounded-[10px] border border-border bg-muted/30 p-2" style={{ maxHeight: 480 }}>
        <div
          ref={imageRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => dragStart.current && handleMouseUp()}
          className={`relative mx-auto ${canInsertRegion ? 'cursor-crosshair' : ''}`}
          style={{ width: `${zoom * 100}%`, transition: 'width 150ms ease' }}
        >
          <img
            src={pageImageUrl(pageId, { variant: 'workspace', rotation })}
            alt={label}
            draggable={false}
            className="block w-full select-none rounded-[6px]"
          />
          {draftRect ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute border-2 border-primary bg-primary/15"
              style={{
                left: `${draftRect.x * 100}%`,
                top: `${draftRect.y * 100}%`,
                width: `${draftRect.width * 100}%`,
                height: `${draftRect.height * 100}%`,
              }}
            />
          ) : null}
        </div>
      </div>

      {canInsertRegion ? (
        <p className="text-xs text-muted-foreground">
          Drag on the image to mark a diagram, drawing, or illegible area as an image region.
        </p>
      ) : null}

      {draftRect && draftRect.width >= 0.02 && draftRect.height >= 0.02 ? (
        <div className="space-y-2 rounded-[10px] border border-primary/30 bg-card p-3 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="region-reason">
              Reason
            </label>
            <select
              id="region-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as ImageRegionReason)}
              className="min-h-8 rounded-full border border-border bg-background px-2.5 text-xs text-foreground outline-none focus-visible:border-primary"
            >
              <option value="diagram">Diagram</option>
              <option value="drawing">Drawing</option>
              <option value="illegible">Illegible</option>
              <option value="other">Other</option>
            </select>
            <input
              value={regionLabel}
              onChange={(event) => setRegionLabel(event.target.value)}
              placeholder="Optional label"
              className="min-h-8 flex-1 rounded-full border border-border bg-background px-3 text-xs text-foreground outline-none focus-visible:border-primary"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraftRect(null)}
              className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-xs font-semibold text-foreground hover:border-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRegion}
              className="inline-flex min-h-8 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-pine-ink dark:hover:bg-primary/80"
            >
              Insert as region
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof ZoomIn;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
