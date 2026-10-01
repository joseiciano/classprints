import type { MaterialVersionSummary } from '@classprints/assignment-reader-shared';
import { useDocumentPages } from '../../../hooks/use-assignment-reader';
import { pageImageUrl } from '../../../lib/assignment-reader-api';
import { formatDateTime } from '../../../lib/assignment-reader-format';

/**
 * The submission workspace's read-only materials side rail (TASK-025): the
 * exact materials version captured as this submission's review context
 * (PAT-002), opened on demand without leaving the workspace route. Never
 * renders grading controls — materials are context only, excluded from
 * every student grading count.
 */
export function MaterialsRail({
  materialsVersion,
}: {
  materialsVersion: MaterialVersionSummary | null;
}) {
  const pages = useDocumentPages('materials', materialsVersion?.id);

  if (!materialsVersion) {
    return (
      <p className="text-sm text-muted-foreground">
        No materials version was available when this submission's review began.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Version {materialsVersion.version}
        {materialsVersion.confirmedAt ? ` · confirmed ${formatDateTime(materialsVersion.confirmedAt)}` : ''}
        {' · '}this is the version in effect when review began; it never follows a later replacement.
      </p>
      {pages.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading materials…</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(pages.data ?? []).map((page) => (
            <figure key={page.id} className="overflow-hidden rounded-[10px] border border-border bg-muted/30">
              <img
                src={pageImageUrl(page.id, { variant: 'thumbnail' })}
                alt={page.label}
                className="block aspect-[3/4] w-full object-cover"
              />
              <figcaption className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                {page.label}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Materials remain available beside judgment, but are excluded from grading counts.
      </p>
    </div>
  );
}
