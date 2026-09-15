import { ChangeEvent, KeyboardEvent, PointerEvent, useEffect, useMemo, useState } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import { SeatMapPanel } from '../components/create-arrangement/seat-map-panel';
import { GridSizeFields } from '../components/create-arrangement/grid-size-fields';
import { SummaryPanel } from '../components/create-arrangement/summary-panel';
import { useRandomAssignments } from '../hooks/use-random-assignments';
import { useRelationships } from '../hooks/use-relationships';
import { useSeatGrid } from '../hooks/use-seat-grid';
import { useSeatInteractions } from '../hooks/use-seat-interactions';
import { GridSize, clamp } from '../lib/arrangement-utils';

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 12;
const DEFAULT_GRID: GridSize = { rows: 5, cols: 5 };
const MIN_RESULTS = 1;
const MAX_RESULTS = 10;
const DEFAULT_RESULTS = 1;

type Tab = 'settings' | 'students' | 'submit';
type RelationshipType = 'conflicts' | 'works-well' | 'works-well-strong';

export function ConfigsArrangementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [activeRelationshipType, setActiveRelationshipType] =
    useState<RelationshipType>('conflicts');
  const [activeStudentSubTab, setActiveStudentSubTab] = useState<'relationships' | 'contenders'>(
    'relationships',
  );
  const isRandomView = false;
  const [names, setNames] = useState('');
  const [conflictsInput, setConflictsInput] = useState('');
  const [worksWellInput, setWorksWellInput] = useState('');
  const [worksWellStrongInput, setWorksWellStrongInput] = useState('');
  const [seatContenders, setSeatContenders] = useState<Record<string, [number, number][]>>({});
  const [selectedStudentForContenders, setSelectedStudentForContenders] = useState<string | null>(
    null,
  );

  const {
    attendeeNames,
    nameValidationIssues,
    conflictParseResult,
    conflictSummary,
    worksWellParseResult,
    worksWellSummary,
    worksWellStrongParseResult,
    worksWellStrongSummary,
    conflictParticipantIssues,
    worksWellParticipantIssues,
    worksWellStrongParticipantIssues,
  } = useRelationships({ names, conflictsInput, worksWellInput, worksWellStrongInput });

  const toggleRelationship = (targetName: string) => {
    if (!selectedStudentForContenders) return;

    const studentA = selectedStudentForContenders;
    const studentB = targetName;
    const type = activeRelationshipType;

    const relationshipConfigs = [
      {
        id: 'conflicts',
        map: conflictParseResult.conflicts,
        setter: setConflictsInput,
      },
      {
        id: 'works-well',
        map: worksWellParseResult.worksWellWith,
        setter: setWorksWellInput,
      },
      {
        id: 'works-well-strong',
        map: worksWellStrongParseResult.worksWellWith,
        setter: setWorksWellStrongInput,
      },
    ];

    const formatMap = (map: Record<string, string[]>) =>
      Object.entries(map)
        .map(([name, related]) => `${name}: ${related.join(', ')}`)
        .join('\n');

    const activeConfig = relationshipConfigs.find((c) => c.id === type)!;
    const otherConfigs = relationshipConfigs.filter((c) => c.id !== type);

    const isPresentInActive = activeConfig.map[studentA]?.includes(studentB);

    if (isPresentInActive) {
      // Remove from active
      const nextMap = { ...activeConfig.map };
      nextMap[studentA] = (nextMap[studentA] || []).filter((n) => n !== studentB);
      if (nextMap[studentA].length === 0) delete nextMap[studentA];

      nextMap[studentB] = (nextMap[studentB] || []).filter((n) => n !== studentA);
      if (nextMap[studentB].length === 0) delete nextMap[studentB];

      activeConfig.setter(formatMap(nextMap));
    } else {
      // Adding to active: remove from others first
      otherConfigs.forEach((config) => {
        const isPresentInOther = config.map[studentA]?.includes(studentB);
        if (isPresentInOther) {
          const nextMap = { ...config.map };
          nextMap[studentA] = (nextMap[studentA] || []).filter((n) => n !== studentB);
          if (nextMap[studentA].length === 0) delete nextMap[studentA];

          nextMap[studentB] = (nextMap[studentB] || []).filter((n) => n !== studentA);
          if (nextMap[studentB].length === 0) delete nextMap[studentB];

          config.setter(formatMap(nextMap));
        }
      });

      // Add to active
      const nextActiveMap = { ...activeConfig.map };
      nextActiveMap[studentA] = Array.from(new Set([...(nextActiveMap[studentA] || []), studentB]));
      nextActiveMap[studentB] = Array.from(new Set([...(nextActiveMap[studentB] || []), studentA]));
      activeConfig.setter(formatMap(nextActiveMap));
    }
  };

  const [isContenderDragging, setIsContenderDragging] = useState(false);
  const [contenderDragValue, setContenderDragValue] = useState<boolean | null>(null);

  useEffect(() => {
    const handlePointerUp = () => {
      setIsContenderDragging(false);
      setContenderDragValue(null);
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const [maxResults, setMaxResults] = useState(DEFAULT_RESULTS);

  const {
    gridSize,
    gridInputs,
    seatGrid,
    setSeatGrid: setBaseSeatGrid,
    handleGridSizeChange,
    handleGridSizeBlur,
    clearGrid: baseClearGrid,
  } = useSeatGrid({
    initialGrid: DEFAULT_GRID,
    minSize: MIN_GRID_SIZE,
    maxSize: MAX_GRID_SIZE,
  });

  const setSeatGrid = (next: SeatingGrid | ((prev: SeatingGrid) => SeatingGrid)) => {
    setBaseSeatGrid((prev) => {
      const nextGrid = typeof next === 'function' ? next(prev) : next;

      // Update contenders based on grid changes
      setSeatContenders((currentContenders) => {
        const updated = { ...currentContenders };
        let changed = false;

        // 1. Cleanup: remove contenders for seats that no longer exist
        for (const student in updated) {
          const filtered = updated[student].filter(([r, c]) => nextGrid[r]?.[c] === true);
          if (filtered.length !== updated[student].length) {
            updated[student] = filtered;
            changed = true;
          }
        }

        // 2. Addition: if a student is selected AND we are on the contenders tab AND a seat was added, make it a contender automatically
        if (
          selectedStudentForContenders &&
          activeTab === 'students' &&
          activeStudentSubTab === 'contenders'
        ) {
          const studentList = updated[selectedStudentForContenders] || [];
          const nextList = [...studentList];
          let studentChanged = false;

          for (let r = 0; r < nextGrid.length; r++) {
            for (let c = 0; c < (nextGrid[r]?.length ?? 0); c++) {
              const wasSeat = prev[r]?.[c] === true;
              const isSeat = nextGrid[r][c] === true;

              if (isSeat && !wasSeat) {
                // Seat was added or re-added. Ensure it's in the contender list.
                if (!nextList.some(([rr, cc]) => rr === r && cc === c)) {
                  nextList.push([r, c]);
                  studentChanged = true;
                }
              }
            }
          }

          if (studentChanged) {
            updated[selectedStudentForContenders] = nextList;
            changed = true;
          }
        }

        return changed ? updated : currentContenders;
      });

      return nextGrid;
    });
  };

  const clearGrid = () => {
    baseClearGrid();
    setSeatContenders({});
  };

  const { randomAssignments } = useRandomAssignments({
    layoutMode: 'custom' as const,
    seatGrid,
    gridSize,
    attendeeNames,
  });

  const { handleSeatPointerDown, handleSeatPointerEnter, handleSeatKeyDown } = useSeatInteractions(
    seatGrid,
    setSeatGrid,
  );

  const handleSeatAction = (rowIndex: number, colIndex: number, forceValue?: boolean) => {
    if (!selectedStudentForContenders) return null;
    if (!seatGrid[rowIndex][colIndex]) return null;

    const currentList = seatContenders[selectedStudentForContenders] ?? [];
    const exists = currentList.some(([r, c]) => r === rowIndex && c === colIndex);
    const nextValue = forceValue !== undefined ? forceValue : !exists;

    if (nextValue !== exists) {
      setSeatContenders((prev) => {
        const studentList = prev[selectedStudentForContenders!] ?? [];
        const nextList = nextValue
          ? [...studentList, [rowIndex, colIndex]]
          : studentList.filter(([r, c]) => !(r === rowIndex && c === colIndex));
        return { ...prev, [selectedStudentForContenders!]: nextList } as Record<
          string,
          [number, number][]
        >;
      });
    }
    return nextValue;
  };

  const wrapSeatInteraction =
    (
      handler: (
        r: number,
        c: number,
      ) => (e: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => void,
      actionType: 'click' | 'hover',
    ) =>
    (rowIndex: number, colIndex: number) =>
    (event: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
      // If we are in student selection mode (Step 2: Students & Rules -> contenders)
      if (
        selectedStudentForContenders &&
        activeTab === 'students' &&
        activeStudentSubTab === 'contenders'
      ) {
        if (actionType === 'click') {
          // 1. If the seat doesn't exist yet, we create it first
          const isSeatCurrentlyEmpty = !seatGrid[rowIndex][colIndex];

          if (isSeatCurrentlyEmpty) {
            // Create the seat
            handler(rowIndex, colIndex)(event);
            // Add as contender
            handleSeatAction(rowIndex, colIndex, true);
            setIsContenderDragging(true);
            setContenderDragValue(true);
          } else {
            // Seat exists, toggle contender status
            const nextContenderValue = handleSeatAction(rowIndex, colIndex);
            if (nextContenderValue !== null) {
              setIsContenderDragging(true);
              setContenderDragValue(nextContenderValue);
            }
          }
        } else if (actionType === 'hover') {
          if (isContenderDragging && contenderDragValue !== null) {
            // If dragging "true" (adding contenders), ensure seat exists
            if (contenderDragValue === true && !seatGrid[rowIndex][colIndex]) {
              handler(rowIndex, colIndex)(event);
            }
            handleSeatAction(rowIndex, colIndex, contenderDragValue);
          }
        }
        return;
      }

      // Default behavior (Step 1 or no student selected)
      handler(rowIndex, colIndex)(event);
    };

  const selectedSeatCount = useMemo(
    () => seatGrid.reduce((acc, row) => acc + row.filter(Boolean).length, 0),
    [seatGrid],
  );
  const gridCapacity = useMemo(() => gridSize.rows * gridSize.cols, [gridSize.rows, gridSize.cols]);

  const conflictError = conflictParseResult.errors[0] ?? conflictParticipantIssues[0] ?? null;
  const worksWellError = worksWellParseResult.errors[0] ?? worksWellParticipantIssues[0] ?? null;
  const worksWellStrongError =
    worksWellStrongParseResult.errors[0] ?? worksWellStrongParticipantIssues[0] ?? null;

  const conflictSummaryText =
    conflictSummary.peopleWithConflicts > 0
      ? `Tracking conflicts for ${conflictSummary.peopleWithConflicts} name(s) (${conflictSummary.totalConflicts} total).`
      : 'No conflicts added yet.';
  const worksWellSummaryText =
    worksWellSummary.peopleWithPartners > 0
      ? `Tracking preferences for ${worksWellSummary.peopleWithPartners} name(s) (${worksWellSummary.totalPartners} total).`
      : 'No works-well entries yet.';
  const worksWellStrongSummaryText =
    worksWellStrongSummary.peopleWithPartners > 0
      ? `Tracking strong preferences for ${worksWellStrongSummary.peopleWithPartners} name(s) (${worksWellStrongSummary.totalPartners} total).`
      : 'No strong works-well entries yet.';

  const handleMaxResultsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    if (rawValue === '') {
      setMaxResults(DEFAULT_RESULTS);
      return;
    }
    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    const safeValue = clamp(parsed, MIN_RESULTS, MAX_RESULTS);
    setMaxResults(safeValue);
  };

  const handleMaxResultsBlur = () => {
    setMaxResults((prev) => (prev === 0 ? DEFAULT_RESULTS : prev));
  };

  const allTabs: { id: Tab; label: string }[] = [
    { id: 'settings', label: '1. Grid & Settings' },
    { id: 'students', label: '2. Students & Rules' },
    { id: 'submit', label: '3. Submit' },
  ];

  const tabs = allTabs;

  // Clear selected student when switching tabs
  useEffect(() => {
    setSelectedStudentForContenders(null);
  }, [activeTab]);

  return (
    <section className="space-y-10">
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
          Create Arrangement
        </p>
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
          Create a new seating config
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          List attendees, set your grid, and save a reusable seating configuration. You can select
          this config later when creating seating arrangements.
        </p>
        <div className="flex justify-end">
          <nav className="flex gap-1 rounded-xl bg-muted/30 p-1 border border-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="min-h-[500px]">
        {activeTab === 'settings' && (
          <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
            <div className="space-y-6 rounded-2xl border bg-card/80 p-6 shadow-card">
              <h2 className="text-xl font-semibold">Grid Settings</h2>

              <GridSizeFields
                idPrefix="grid"
                minSize={MIN_GRID_SIZE}
                maxSize={MAX_GRID_SIZE}
                rowsValue={gridInputs.rows}
                colsValue={gridInputs.cols}
                onRowsChange={handleGridSizeChange('rows')}
                onRowsBlur={handleGridSizeBlur('rows')}
                onColsChange={handleGridSizeChange('cols')}
                onColsBlur={handleGridSizeBlur('cols')}
              />

              <fieldset className="space-y-2">
                <label htmlFor="max-results" className="text-sm font-medium text-foreground">
                  Max results
                </label>
                <input
                  id="max-results"
                  type="number"
                  min={MIN_RESULTS}
                  max={MAX_RESULTS}
                  value={maxResults}
                  onChange={handleMaxResultsChange}
                  onBlur={handleMaxResultsBlur}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-xs text-muted-foreground">
                  Number of seating arrangements to generate (1-{MAX_RESULTS}).
                </p>
              </fieldset>

              <SummaryPanel
                selectedSeatCount={selectedSeatCount}
                gridCapacity={gridCapacity}
                attendeeNames={attendeeNames}
              />

              <button
                type="button"
                onClick={() => setActiveTab('students')}
                className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
              >
                Next Step
              </button>
            </div>

            <SeatMapPanel
              seatGrid={seatGrid}
              gridSize={gridSize}
              isRandomView={isRandomView}
              randomAssignments={randomAssignments}
              onClearGrid={clearGrid}
              onSeatPointerDown={wrapSeatInteraction(handleSeatPointerDown, 'click')}
              onSeatPointerEnter={wrapSeatInteraction(handleSeatPointerEnter, 'hover')}
              onSeatKeyDown={wrapSeatInteraction(handleSeatKeyDown, 'click')}
              selectedStudentForContenders={null}
              seatContenders={seatContenders}
            />
          </div>
        )}

        {activeTab === 'students' && (
          <div className="space-y-8">
            <div className="max-w-4xl mx-auto space-y-4 rounded-2xl border bg-card/80 p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">1. Add Attendees</h2>
                <p className="text-sm text-muted-foreground">
                  {attendeeNames.length > 0
                    ? `${attendeeNames.length} attendee(s) listed.`
                    : 'No attendees added yet.'}
                </p>
              </div>
              <textarea
                id="names"
                value={names}
                onChange={(e) => setNames(e.target.value)}
                rows={3}
                placeholder="Alice, Bob, Charlie, Dee..."
                className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {nameValidationIssues.length > 0 && (
                <p className="text-sm text-red-500 font-medium">{nameValidationIssues[0]}</p>
              )}
              <p className="text-xs text-muted-foreground">Enter names separated by commas.</p>
            </div>

            <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold px-2">2. Configure Rules</h2>
                <div className="flex flex-col gap-1 max-h-[600px] overflow-y-auto pr-2">
                  {attendeeNames.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground px-2">
                      Add names above to start configuring rules.
                    </p>
                  ) : (
                    attendeeNames.map((name) => {
                      const isSelected = selectedStudentForContenders === name;
                      const hasConflicts = (conflictParseResult.conflicts[name]?.length ?? 0) > 0;
                      const hasWorksWell =
                        (worksWellParseResult.worksWellWith[name]?.length ?? 0) > 0 ||
                        (worksWellStrongParseResult.worksWellWith[name]?.length ?? 0) > 0;
                      const hasContenders = (seatContenders[name]?.length ?? 0) > 0;

                      return (
                        <button
                          key={name}
                          onClick={() => setSelectedStudentForContenders(isSelected ? null : name)}
                          className={`flex flex-col items-start px-4 py-3 rounded-xl border transition text-left ${
                            isSelected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'bg-card border-border hover:border-primary/50 text-foreground'
                          }`}
                        >
                          <span className="font-medium">{name}</span>
                          <div className="flex gap-2 mt-1">
                            {hasConflicts && (
                              <span
                                className={`text-[10px] uppercase font-bold ${isSelected ? 'text-primary-foreground/80' : 'text-red-500'}`}
                              >
                                Conflicts
                              </span>
                            )}
                            {hasWorksWell && (
                              <span
                                className={`text-[10px] uppercase font-bold ${isSelected ? 'text-primary-foreground/80' : 'text-green-500'}`}
                              >
                                Partners
                              </span>
                            )}
                            {hasContenders && (
                              <span
                                className={`text-[10px] uppercase font-bold ${isSelected ? 'text-primary-foreground/80' : 'text-blue-500'}`}
                              >
                                Seats {seatContenders[name].length}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {!selectedStudentForContenders ? (
                  <div className="flex flex-col items-center justify-center h-[400px] rounded-2xl border border-dashed border-border bg-muted/20 text-muted-foreground">
                    <div className="text-center space-y-4">
                      <p>
                        Select a student from the list to set their seat contenders or
                        relationships.
                      </p>
                      <button
                        onClick={() => setActiveTab('submit')}
                        className="rounded-full border border-primary px-6 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition"
                      >
                        Skip to Submit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-border pb-4">
                      <h3 className="text-2xl font-semibold">{selectedStudentForContenders}</h3>
                      <nav className="flex gap-1 rounded-xl bg-muted/30 p-1 border border-border">
                        <button
                          onClick={() => setActiveStudentSubTab('relationships')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                            activeStudentSubTab === 'relationships'
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Relationships
                        </button>
                        <button
                          onClick={() => setActiveStudentSubTab('contenders')}
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                            activeStudentSubTab === 'contenders'
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Seat Contenders
                        </button>
                      </nav>
                    </div>

                    {activeStudentSubTab === 'relationships' ? (
                      <div className="space-y-8">
                        <div className="space-y-6 rounded-2xl border bg-card/80 p-8 shadow-card h-fit">
                          <div className="flex flex-col gap-6">
                            <nav className="flex gap-1 rounded-xl bg-muted/30 p-1 border border-border w-fit">
                              {(['conflicts', 'works-well', 'works-well-strong'] as const).map(
                                (type) => (
                                  <button
                                    key={type}
                                    onClick={() => setActiveRelationshipType(type)}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                                      activeRelationshipType === type
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    {type === 'conflicts'
                                      ? 'Conflicts'
                                      : type === 'works-well'
                                        ? 'Works Well With'
                                        : 'Work Well With Strong'}
                                  </button>
                                ),
                              )}
                            </nav>

                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">
                                  {activeRelationshipType === 'conflicts'
                                    ? 'Conflicts'
                                    : activeRelationshipType === 'works-well'
                                      ? 'Works Well With'
                                      : 'Work Well With Strong'}
                                </label>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {attendeeNames
                                  .filter((name) => name !== selectedStudentForContenders)
                                  .map((name) => {
                                    const currentMap =
                                      activeRelationshipType === 'conflicts'
                                        ? conflictParseResult.conflicts
                                        : activeRelationshipType === 'works-well'
                                          ? worksWellParseResult.worksWellWith
                                          : worksWellStrongParseResult.worksWellWith;

                                    const isRelated =
                                      currentMap[selectedStudentForContenders!]?.includes(name) ||
                                      currentMap[name]?.includes(selectedStudentForContenders!);

                                    return (
                                      <button
                                        key={name}
                                        onClick={() => toggleRelationship(name)}
                                        className={`px-4 py-2 rounded-xl border transition text-sm font-medium text-center ${
                                          isRelated
                                            ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                            : 'bg-card border-border hover:border-primary/50 text-foreground'
                                        }`}
                                      >
                                        {name}
                                      </button>
                                    );
                                  })}
                              </div>

                              {activeRelationshipType === 'conflicts' && conflictError && (
                                <p className="text-xs text-red-500 font-medium">{conflictError}</p>
                              )}
                              {activeRelationshipType === 'works-well' && worksWellError && (
                                <p className="text-xs text-red-500 font-medium">{worksWellError}</p>
                              )}
                              {activeRelationshipType === 'works-well-strong' &&
                                worksWellStrongError && (
                                  <p className="text-xs text-red-500 font-medium">
                                    {worksWellStrongError}
                                  </p>
                                )}

                              <p className="text-xs text-muted-foreground">
                                {activeRelationshipType === 'conflicts'
                                  ? conflictSummaryText
                                  : activeRelationshipType === 'works-well'
                                    ? worksWellSummaryText
                                    : worksWellStrongSummaryText}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <p className="text-muted-foreground">
                          Click seats on the map to restrict where{' '}
                          <strong>{selectedStudentForContenders}</strong> can sit.
                        </p>
                        <SeatMapPanel
                          seatGrid={seatGrid}
                          gridSize={gridSize}
                          isRandomView={isRandomView}
                          randomAssignments={randomAssignments}
                          onClearGrid={clearGrid}
                          onSeatPointerDown={wrapSeatInteraction(handleSeatPointerDown, 'click')}
                          onSeatPointerEnter={wrapSeatInteraction(handleSeatPointerEnter, 'hover')}
                          onSeatKeyDown={wrapSeatInteraction(handleSeatKeyDown, 'click')}
                          selectedStudentForContenders={selectedStudentForContenders}
                          seatContenders={seatContenders}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center pt-8 border-t border-border">
              <button
                onClick={() => setActiveTab('submit')}
                disabled={attendeeNames.length === 0}
                className="rounded-full bg-primary px-12 py-4 text-lg font-bold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
              >
                Proceed to Submit
              </button>
            </div>
          </div>
        )}

        {activeTab === 'submit' && (
          <div className="space-y-8">
            <div className="max-w-4xl mx-auto space-y-4 rounded-2xl border bg-card/80 p-6 shadow-card">
              <h2 className="text-xl font-semibold">Review & Save</h2>
              <p className="text-sm text-muted-foreground">
                Review your seating arrangement settings and save the config.
              </p>

              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <h3 className="text-sm font-semibold mb-2">Grid Settings</h3>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Grid Size</dt>
                      <dd className="font-medium">
                        {gridSize.rows} rows × {gridSize.cols} cols
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Selected Seats</dt>
                      <dd className="font-medium">{selectedSeatCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Attendees</dt>
                      <dd className="font-medium">{attendeeNames.length}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Max Results</dt>
                      <dd className="font-medium">{maxResults}</dd>
                    </div>
                  </dl>
                </div>

                {conflictSummary.totalConflicts > 0 && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <h3 className="text-sm font-semibold mb-2">Conflicts</h3>
                    <p className="text-sm text-muted-foreground">{conflictSummaryText}</p>
                  </div>
                )}

                {worksWellSummary.totalPartners > 0 && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <h3 className="text-sm font-semibold mb-2">Works Well (Soft)</h3>
                    <p className="text-sm text-muted-foreground">{worksWellSummaryText}</p>
                  </div>
                )}

                {worksWellStrongSummary.totalPartners > 0 && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <h3 className="text-sm font-semibold mb-2">Works Well Strong</h3>
                    <p className="text-sm text-muted-foreground">{worksWellStrongSummaryText}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('students')}
                  className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent/20"
                >
                  Back
                </button>
                <button
                  type="button"
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
                >
                  Save Config
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
