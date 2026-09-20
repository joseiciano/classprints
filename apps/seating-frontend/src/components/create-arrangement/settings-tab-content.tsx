import { ChangeEvent } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import { SUBSCRIPTION_LIMITS } from '@classprints/seating-shared';
import { AI_GENERATION_ENABLED } from '../../lib/constants';
import { GridSize } from '../../lib/arrangement-utils';
import { GridSizeFields } from './grid-size-fields';
import { SummaryPanel } from './summary-panel';

type GenerationMethod = 'programmatic' | 'ai';

interface SettingsTabContentProps {
  layoutMode: 'custom' | 'random';
  generationMethod: GenerationMethod;
  names: string;
  gridSize: GridSize;
  gridInputs: { rows: string; cols: string };
  maxResults: number;
  isPlus: boolean;
  selectedSeatCount: number;
  gridCapacity: number;
  attendeeNames: string[];
  nameValidationIssues: string[];
  onGenerationMethodChange: (method: GenerationMethod) => void;
  onNamesChange: (value: string) => void;
  onGridSizeChange: (field: 'rows' | 'cols') => (event: ChangeEvent<HTMLInputElement>) => void;
  onGridSizeBlur: (field: 'rows' | 'cols') => () => void;
  onMaxResultsChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onMaxResultsBlur: () => void;
  onNextClick: () => void;
  onClearGrid: () => void;
  onSeatPointerDown: (
    rowIndex: number,
    colIndex: number,
  ) => (e: React.PointerEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => void;
  onSeatPointerEnter: (
    rowIndex: number,
    colIndex: number,
  ) => (e: React.PointerEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => void;
  onSeatKeyDown: (
    rowIndex: number,
    colIndex: number,
  ) => (e: React.PointerEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => void;
  seatGrid: SeatingGrid;
  isRandomView: boolean;
  randomAssignments: (string | null)[][] | null;
}

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 12;

export function SettingsTabContent({
  layoutMode,
  generationMethod,
  names,
  gridSize,
  gridInputs,
  maxResults,
  isPlus,
  selectedSeatCount,
  gridCapacity,
  attendeeNames,
  nameValidationIssues,
  onGenerationMethodChange,
  onNamesChange,
  onGridSizeChange,
  onGridSizeBlur,
  onMaxResultsChange,
  onMaxResultsBlur,
  onNextClick,
  onClearGrid,
  onSeatPointerDown,
  onSeatPointerEnter,
  onSeatKeyDown,
  seatGrid,
  isRandomView,
  randomAssignments,
}: SettingsTabContentProps) {
  const limits = isPlus ? SUBSCRIPTION_LIMITS.plus : SUBSCRIPTION_LIMITS.free;

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <div className="space-y-6 rounded-2xl border bg-card/80 p-6 shadow-card">
        <h2 className="text-xl font-semibold">Grid Settings</h2>

        {layoutMode === 'custom' && (
          <fieldset className="space-y-2">
            <label htmlFor="gen-method" className="text-sm font-medium text-foreground">
              Generation Method
            </label>
            <select
              id="gen-method"
              value={generationMethod}
              onChange={(e) => onGenerationMethodChange(e.target.value as GenerationMethod)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="programmatic">Programmatic (Genetic Algorithm)</option>
              {AI_GENERATION_ENABLED && isPlus && <option value="ai">AI Powered (LLM)</option>}
            </select>
            <p className="text-xs text-muted-foreground">
              {generationMethod === 'programmatic'
                ? 'Fast, deterministic optimization for large groups.'
                : 'Heuristic-based approach using large language models.'}
            </p>
            {AI_GENERATION_ENABLED && !isPlus && (
              <p className="text-xs text-primary font-medium">
                AI Powered (LLM) generation is available on the Plus plan.
              </p>
            )}
          </fieldset>
        )}

        {layoutMode === 'random' && (
          <fieldset className="space-y-2">
            <label htmlFor="names-random" className="text-sm font-medium text-foreground">
              Attendee names
            </label>
            <textarea
              id="names-random"
              value={names}
              onChange={(e) => onNamesChange(e.target.value)}
              rows={6}
              placeholder="Alice, Bob, Charlie..."
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-base shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {nameValidationIssues.length > 0 && (
              <p className="text-xs text-red-500 font-medium">{nameValidationIssues[0]}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {attendeeNames.length > 0
                ? `${attendeeNames.length} attendee(s) listed.`
                : 'No attendees added yet.'}
            </p>
          </fieldset>
        )}

        <GridSizeFields
          idPrefix="grid"
          minSize={MIN_GRID_SIZE}
          maxSize={MAX_GRID_SIZE}
          rowsValue={gridInputs.rows}
          colsValue={gridInputs.cols}
          onRowsChange={onGridSizeChange('rows')}
          onRowsBlur={onGridSizeBlur('rows')}
          onColsChange={onGridSizeChange('cols')}
          onColsBlur={onGridSizeBlur('cols')}
        />

        <fieldset className="space-y-2">
          <label htmlFor="max-results" className="text-sm font-medium text-foreground">
            Max results
          </label>
          <input
            id="max-results"
            type="number"
            min={1}
            max={limits.maxResultsPerRun}
            value={maxResults}
            onChange={onMaxResultsChange}
            onBlur={onMaxResultsBlur}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-muted-foreground">
            Number of seating arrangements to generate (1-{limits.maxResultsPerRun}).
            {!isPlus && (
              <span className="block mt-1 text-primary font-medium">
                Upgrade to Plus for up to {SUBSCRIPTION_LIMITS.plus.maxResultsPerRun} arrangements.
              </span>
            )}
          </p>
        </fieldset>

        <SummaryPanel
          selectedSeatCount={selectedSeatCount}
          gridCapacity={gridCapacity}
          attendeeNames={attendeeNames}
        />

        <button
          type="button"
          onClick={onNextClick}
          className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          Next Step
        </button>
      </div>

      <div className="space-y-6 rounded-2xl border bg-card/80 p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Seat Map</h2>
          <button
            type="button"
            onClick={onClearGrid}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            Clear Grid
          </button>
        </div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${gridSize.cols}, minmax(0, 1fr))` }}
        >
          {seatGrid.map((row, rowIndex) =>
            row.map((hasSeat, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                onPointerDown={onSeatPointerDown(rowIndex, colIndex)}
                onPointerEnter={onSeatPointerEnter(rowIndex, colIndex)}
                onKeyDown={onSeatKeyDown(rowIndex, colIndex)}
                tabIndex={0}
                className={`aspect-square rounded-lg border text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  hasSeat
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/30 border-border hover:border-primary/50'
                }`}
              >
                {hasSeat ? `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}` : ''}
              </button>
            )),
          )}
        </div>
        {isRandomView && randomAssignments && (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold mb-2">Random Assignment Preview</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {randomAssignments.flatMap((row, rowIndex) =>
                row.map((name, colIndex) =>
                  name ? (
                    <div key={`${rowIndex}-${colIndex}`} className="flex justify-between">
                      <span>{name}</span>
                      <span className="font-medium">
                        {String.fromCharCode(65 + colIndex)}
                        {rowIndex + 1}
                      </span>
                    </div>
                  ) : null,
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
