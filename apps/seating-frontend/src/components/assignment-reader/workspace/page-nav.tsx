import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageSummary } from '@classprints/assignment-reader-shared';

/**
 * Current-page navigation (TASK-025): moves between a document's current
 * pages without losing the original/draft pairing, which stays keyed by
 * page ID across navigation and a reload (the URL's `pageId` search param is
 * the source of truth — see the workspace route).
 */
export function PageNav({
  pages,
  selectedPageId,
  onSelect,
}: {
  pages: PageSummary[];
  selectedPageId: string;
  onSelect: (pageId: string) => void;
}) {
  const index = pages.findIndex((page) => page.id === selectedPageId);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={index <= 0}
        onClick={() => index > 0 && onSelect(pages[index - 1].id)}
        aria-label="Previous page"
        className="inline-grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <span className="font-mono text-xs text-muted-foreground">
        {index + 1} / {pages.length}
      </span>
      <button
        type="button"
        disabled={index === -1 || index >= pages.length - 1}
        onClick={() => index > -1 && index < pages.length - 1 && onSelect(pages[index + 1].id)}
        aria-label="Next page"
        className="inline-grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
