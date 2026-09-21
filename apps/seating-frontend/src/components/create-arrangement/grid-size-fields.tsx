import { ChangeEvent } from 'react';

type GridSizeFieldsProps = {
  idPrefix: string;
  minSize: number;
  maxSize: number;
  rowsValue: string;
  colsValue: string;
  onRowsChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRowsBlur: () => void;
  onColsChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onColsBlur: () => void;
};

const FIELD_CLASS =
  'w-full rounded-lg border border-line bg-background px-3 py-2 text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

const LABEL_CLASS = 'font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground';

export function GridSizeFields({
  idPrefix,
  minSize,
  maxSize,
  rowsValue,
  colsValue,
  onRowsChange,
  onRowsBlur,
  onColsChange,
  onColsBlur,
}: GridSizeFieldsProps) {
  return (
    <fieldset className="space-y-3">
      <legend className={LABEL_CLASS}>Grid size</legend>
      <div className="grid grid-cols-2 gap-4 sm:max-w-xs">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-rows`} className={LABEL_CLASS}>
            Rows
          </label>
          <input
            id={`${idPrefix}-rows`}
            type="number"
            min={minSize}
            max={maxSize}
            value={rowsValue}
            onChange={onRowsChange}
            onBlur={onRowsBlur}
            className={FIELD_CLASS}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-cols`} className={LABEL_CLASS}>
            Columns
          </label>
          <input
            id={`${idPrefix}-cols`}
            type="number"
            min={minSize}
            max={maxSize}
            value={colsValue}
            onChange={onColsChange}
            onBlur={onColsBlur}
            className={FIELD_CLASS}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Grid can be between {minSize}×{minSize} and {maxSize}×{maxSize}. Existing seat selections
        are kept when possible.
      </p>
    </fieldset>
  );
}
