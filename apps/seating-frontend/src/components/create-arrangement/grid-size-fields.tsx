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
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-foreground">Grid size</legend>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label
            htmlFor={`${idPrefix}-rows`}
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
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
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`${idPrefix}-cols`}
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
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
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
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
