import type { ChangeEvent, DragEvent, KeyboardEvent, ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2, RotateCcw, Upload, X } from 'lucide-react';

export interface UploadFlowItem {
  id: string;
  fileName: string;
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  errorMessage?: string;
  /** True once this row already exists on the server (resumed from a prior session). */
  isExisting: boolean;
}

export interface UploadFlowViewProps {
  title: string;
  description: string;
  items: UploadFlowItem[];
  maxPages: number;
  onFilesSelected: (files: FileList | File[]) => void;
  onReplace: (itemId: string, file: File) => void;
  onRemove: (itemId: string) => void;
  onMoveUp: (itemId: string) => void;
  onMoveDown: (itemId: string) => void;
  isLoadingExisting: boolean;
  bannerMessage?: string | null;
  canConfirm: boolean;
  isConfirming: boolean;
  confirmError?: string | null;
  onConfirm: () => void;
  backLink: ReactNode;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif';

export function UploadFlowView({
  title,
  description,
  items,
  maxPages,
  onFilesSelected,
  onReplace,
  onRemove,
  onMoveUp,
  onMoveDown,
  isLoadingExisting,
  bannerMessage,
  canConfirm,
  isConfirming,
  confirmError,
  onConfirm,
  backLink,
}: UploadFlowViewProps) {
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onFilesSelected(event.target.files);
    }
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
      onFilesSelected(event.dataTransfer.files);
    }
  };

  const atLimit = items.length >= maxPages;

  return (
    <section className="space-y-6">
      {backLink}

      <header>
        <h1 className="font-display text-[28px] font-medium leading-tight text-foreground">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </header>

      {bannerMessage ? (
        <p role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {bannerMessage}
        </p>
      ) : null}

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className={`rounded-[12px] border-2 border-dashed px-6 py-8 text-center transition ${
          atLimit ? 'border-border bg-muted/40 opacity-60' : 'border-border bg-card hover:border-primary'
        }`}
      >
        <Upload aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
        <label className="mt-3 block">
          <span className="font-display text-base font-medium text-foreground">
            {atLimit ? `Maximum ${maxPages} pages reached` : 'Add page photos'}
          </span>
          <p className="mt-1 text-sm text-muted-foreground">
            JPEG, PNG, or HEIC · up to 10 MB each · {items.length} / {maxPages} pages
          </p>
          <input
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            disabled={atLimit}
            onChange={handleInputChange}
            className="sr-only"
          />
          <span
            className={`mt-3 inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${
              atLimit
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'cursor-pointer bg-primary text-primary-foreground hover:bg-pine-ink dark:hover:bg-primary/80'
            }`}
          >
            Choose files
          </span>
        </label>
      </div>

      {isLoadingExisting ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading existing pages…
        </p>
      ) : items.length === 0 ? null : (
        <ol aria-label="Pages in order" className="space-y-2">
          {items.map((item, index) => (
            <UploadRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              onReplace={(file) => onReplace(item.id, file)}
              onRemove={() => onRemove(item.id)}
              onMoveUp={() => onMoveUp(item.id)}
              onMoveDown={() => onMoveDown(item.id)}
            />
          ))}
        </ol>
      )}

      {confirmError ? (
        <p role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {confirmError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm || isConfirming}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-pine-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-primary/80"
        >
          {isConfirming ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {isConfirming ? 'Starting transcription…' : 'Confirm order & start transcription'}
        </button>
      </div>
    </section>
  );
}

function UploadRow({
  item,
  index,
  total,
  onReplace,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: UploadFlowItem;
  index: number;
  total: number;
  onReplace: (file: File) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      onMoveUp();
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      onMoveDown();
    }
  };

  return (
    <li
      onKeyDown={handleKeyDown}
      className="flex items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-2.5"
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.fileName}</span>
      <RowStatus item={item} />
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          label={`Move page ${index + 1} up`}
          icon={ArrowUp}
          disabled={index === 0}
          onClick={onMoveUp}
        />
        <IconButton
          label={`Move page ${index + 1} down`}
          icon={ArrowDown}
          disabled={index === total - 1}
          onClick={onMoveDown}
        />
        {item.status === 'failed' || item.isExisting ? (
          <label className="inline-grid h-9 w-9 cursor-pointer place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <span className="sr-only">Replace this page's image</span>
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onReplace(file);
                event.target.value = '';
              }}
            />
          </label>
        ) : null}
        <IconButton
          label={`Remove page ${index + 1}`}
          icon={X}
          disabled={item.status === 'uploading'}
          onClick={onRemove}
          tone="destructive"
        />
      </div>
    </li>
  );
}

function RowStatus({ item }: { item: UploadFlowItem }) {
  if (item.status === 'uploading') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        Uploading
      </span>
    );
  }
  if (item.status === 'failed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive" title={item.errorMessage}>
        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
        {item.errorMessage ?? 'Failed'}
      </span>
    );
  }
  if (item.status === 'uploaded') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
        Uploaded
      </span>
    );
  }
  return <span className="shrink-0 text-xs font-medium text-muted-foreground">Queued</span>;
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  icon: typeof ArrowUp;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'destructive';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-grid h-9 w-9 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-30 ${
        tone === 'destructive' ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
