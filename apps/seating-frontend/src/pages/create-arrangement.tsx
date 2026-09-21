import { ChangeEvent, KeyboardEvent, PointerEvent, useEffect, useMemo, useState } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import { SUBSCRIPTION_LIMITS } from '@classprints/seating-shared';
import { useMutation } from '@tanstack/react-query';
import { FormAlert } from '../components/job-panels';
import { JobResultsSection } from '../components/create-arrangement/job-results-section';
import { LayoutModeToggle } from '../components/create-arrangement/layout-mode-toggle';
import { SeatMapPanel } from '../components/create-arrangement/seat-map-panel';
import { AttendeeInputSection } from '../components/create-arrangement/attendee-input-section';
import { StudentSelectorList } from '../components/create-arrangement/student-selector-list';
import { StudentEmptyState } from '../components/create-arrangement/student-empty-state';
import { StudentDetailHeader } from '../components/create-arrangement/student-detail-header';
import { RelationshipsPanel } from '../components/create-arrangement/relationships-panel';
import { SeatContendersPanel } from '../components/create-arrangement/seat-contenders-panel';
import { SubmitTabContent } from '../components/create-arrangement/submit-tab-content';
import { SummaryPanel } from '../components/create-arrangement/summary-panel';
import { GridSizeFields } from '../components/create-arrangement/grid-size-fields';
import { useJobMonitor } from '../hooks/use-job-monitor';
import { useRandomAssignments } from '../hooks/use-random-assignments';
import { useRelationships } from '../hooks/use-relationships';
import { useSeatGrid } from '../hooks/use-seat-grid';
import { useSeatInteractions } from '../hooks/use-seat-interactions';
import { useSubscription } from '../hooks/use-subscription';
import { AI_GENERATION_ENABLED } from '../lib/constants';
import { GridSize, clamp } from '../lib/arrangement-utils';
import {
  SeatingApiError,
  SeatingJobSummary,
  createSeatingAiJob,
  createSeatingJob,
} from '../lib/seating-api';

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 12;
const DEFAULT_GRID: GridSize = { rows: 5, cols: 5 };
const DEFAULT_RESULTS = 1;

type Mode = 'new' | 'config';
type Tab = 'settings' | 'students' | 'submit';
type GenerationMethod = 'programmatic' | 'ai';
type RelationshipType = 'conflicts' | 'works-well' | 'works-well-strong';

const MODE_COPY: Record<
  Mode,
  { crumbRoot: string; crumbCurrent: string; title: string; description: string }
> = {
  new: {
    crumbRoot: 'Charts',
    crumbCurrent: 'New chart · draft',
    title: 'Create a new seating chart',
    description:
      'List attendees, set your room layout, define your constraints, and generate your seating charts.',
  },
  config: {
    crumbRoot: 'Configs',
    crumbCurrent: 'Arrangement · draft',
    title: 'Create from a saved config',
    description:
      'List attendees, set your grid, and configure rules for this class, then generate seating arrangements.',
  },
};

export function CreateArrangementPage({ mode = 'new' }: { mode?: Mode }) {
  const copy = MODE_COPY[mode];
  const { isPlus } = useSubscription();
  const limits = isPlus ? SUBSCRIPTION_LIMITS.plus : SUBSCRIPTION_LIMITS.free;

  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [activeRelationshipType, setActiveRelationshipType] =
    useState<RelationshipType>('conflicts');
  const [activeStudentSubTab, setActiveStudentSubTab] = useState<'relationships' | 'contenders'>(
    'relationships',
  );
  const [layoutMode, setLayoutMode] = useState<'custom' | 'random'>('custom');
  const [generationMethod, setGenerationMethod] = useState<GenerationMethod>('programmatic');
  const isRandomView = layoutMode === 'random';
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
  const [submittedCols, setSubmittedCols] = useState<number | null>(null);
  const [submittedSeatGrid, setSubmittedSeatGrid] = useState<SeatingGrid | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const { randomAssignments, generateRandomAssignments } = useRandomAssignments({
    layoutMode,
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

  const [jobSummary, setJobSummary] = useState<SeatingJobSummary | null>(null);
  const {
    status: jobStatus,
    results: jobResults,
    error: statusError,
    isRefreshing,
    isAutoRefreshing,
    refresh: refreshJob,
  } = useJobMonitor(jobSummary?.jobId);

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

  const handleSubmitSuccess = (summary: SeatingJobSummary) => {
    setJobSummary(summary);
    setSubmittedCols(gridSize.cols);
  };

  const handleSubmitError = (error: unknown) => {
    console.error('Failed to create seating job', error);
    setSubmitError(
      error instanceof SeatingApiError ? error.message : 'Unable to create seating job.',
    );
  };

  const createJobMutation = useMutation({
    mutationFn: createSeatingJob,
    onMutate: () => setSubmitError(null),
    onSuccess: handleSubmitSuccess,
    onError: handleSubmitError,
  });

  const createAiJobMutation = useMutation({
    mutationFn: createSeatingAiJob,
    onMutate: () => setSubmitError(null),
    onSuccess: handleSubmitSuccess,
    onError: handleSubmitError,
  });

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
    const safeValue = clamp(parsed, 1, limits.maxResultsPerRun);
    setMaxResults(safeValue);
  };

  const handleMaxResultsBlur = () => {
    setMaxResults((prev) => (prev === 0 ? DEFAULT_RESULTS : prev));
  };

  const submitJob = (submit: typeof createJobMutation.mutate) => {
    setSubmitError(null);

    const validations = [
      {
        when: attendeeNames.length === 0,
        message: 'Enter at least one attendee name.',
      },
      {
        when: nameValidationIssues.length > 0,
        message: nameValidationIssues[0],
      },
      {
        when: selectedSeatCount === 0,
        message: 'Select at least one seat on the grid.',
      },
      {
        when: selectedSeatCount < attendeeNames.length,
        message: 'You need at least as many seats as attendees.',
      },
      {
        when: gridCapacity < attendeeNames.length,
        message: 'Grid rows × columns must cover all attendees.',
      },
      {
        when: conflictParseResult.errors.length > 0,
        message: conflictParseResult.errors[0],
      },
      {
        when: conflictParticipantIssues.length > 0,
        message: conflictParticipantIssues[0],
      },
      {
        when: worksWellParseResult.errors.length > 0,
        message: worksWellParseResult.errors[0],
      },
      {
        when: worksWellParticipantIssues.length > 0,
        message: worksWellParticipantIssues[0],
      },
      {
        when: worksWellStrongParseResult.errors.length > 0,
        message: worksWellStrongParseResult.errors[0],
      },
      {
        when: worksWellStrongParticipantIssues.length > 0,
        message: worksWellStrongParticipantIssues[0],
      },
    ];

    const firstError = validations.find((validation) => validation.when)?.message;
    if (firstError) {
      setSubmitError(firstError);
      return;
    }

    setSubmittedSeatGrid(seatGrid.map((row) => [...row]));
    submit({
      students: attendeeNames,
      seatingGrid: seatGrid,
      results: maxResults,
      conflicts: conflictParseResult.conflicts,
      worksWellWithSoft: worksWellParseResult.worksWellWith,
      worksWellWithStrong: worksWellStrongParseResult.worksWellWith,
      seatContenders,
    });
  };

  const isPending =
    generationMethod === 'ai' ? createAiJobMutation.isPending : createJobMutation.isPending;

  useEffect(() => {
    if (!jobStatus) return;
    setJobSummary((prev) =>
      prev ? { ...prev, status: jobStatus.status, updatedAt: jobStatus.updatedAt } : prev,
    );
  }, [jobStatus]);

  const allTabs: { id: Tab; label: string }[] = [
    { id: 'settings', label: 'Layout' },
    { id: 'students', label: 'Students' },
    { id: 'submit', label: 'Submit' },
  ];

  const tabs =
    layoutMode === 'random'
      ? allTabs.filter((t) => t.id === 'settings' || t.id === 'submit')
      : allTabs;

  // Clear selected student when switching tabs
  useEffect(() => {
    setSelectedStudentForContenders(null);
  }, [activeTab]);

  // If layout mode changes to random while on a hidden tab, go back to settings
  useEffect(() => {
    if (layoutMode === 'random' && activeTab !== 'settings' && activeTab !== 'submit') {
      setActiveTab('settings');
    }
  }, [layoutMode, activeTab]);

  return (
    <section aria-label={copy.title}>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
          >
            <span>{copy.crumbRoot}</span>
            <span aria-hidden="true">›</span>
            <span className="text-foreground">{copy.crumbCurrent}</span>
          </nav>
          <h1 className="mt-2 font-display text-[32px] font-medium leading-tight text-foreground">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LayoutModeToggle layoutMode={layoutMode} onChange={setLayoutMode} />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-muted px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <i aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            Draft
          </span>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 items-start gap-5 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)_280px]">
        {/* Column 1: student roster and selection */}
        <section
          aria-label="Students"
          className="rounded-[12px] border border-line bg-card shadow-card"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-base font-semibold">Students</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {attendeeNames.length} total
            </span>
          </header>
          <div className="space-y-4 p-4">
            <AttendeeInputSection
              names={names}
              attendeeNames={attendeeNames}
              nameValidationIssues={nameValidationIssues}
              onNamesChange={setNames}
            />
            <StudentSelectorList
              attendeeNames={attendeeNames}
              selectedStudentForContenders={selectedStudentForContenders}
              conflictParseResult={conflictParseResult}
              worksWellParseResult={worksWellParseResult}
              worksWellStrongParseResult={worksWellStrongParseResult}
              seatContenders={seatContenders}
              onSelectStudent={setSelectedStudentForContenders}
            />
          </div>
        </section>

        {/* Column 2: primary seat map / work area */}
        <section
          aria-label="Work area"
          className="rounded-[12px] border border-line bg-card shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <nav
              aria-label="Builder steps"
              className="inline-flex rounded-full border border-line bg-muted p-1"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={activeTab === tab.id ? 'step' : undefined}
                  className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activeTab === tab.id
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
                Seated
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-[3px] border border-accent bg-accent"
                />
                Contender
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-line"
                />
                Empty
              </span>
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-5">
            {activeTab === 'settings' && (
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
            )}

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

            {isRandomView && randomAssignments.some((row) => row.some(Boolean)) && (
              <div className="rounded-[12px] border border-line bg-muted/40 p-4">
                <h3 className="mb-2 text-sm font-semibold">Random assignment preview</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {randomAssignments.flatMap((row, rowIndex) =>
                    row.map((name, colIndex) =>
                      name ? (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>{name}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {rowIndex + 1}-{colIndex + 1}
                          </span>
                        </div>
                      ) : null,
                    ),
                  )}
                </div>
              </div>
            )}

            {activeTab === 'students' && (
              <div className="space-y-4">
                {!selectedStudentForContenders ? (
                  <StudentEmptyState onSubmitTabClick={() => setActiveTab('submit')} />
                ) : (
                  <div className="space-y-4">
                    <StudentDetailHeader
                      selectedStudent={selectedStudentForContenders}
                      activeSubTab={activeStudentSubTab}
                      onSubTabChange={setActiveStudentSubTab}
                    />

                    {activeStudentSubTab === 'relationships' ? (
                      <RelationshipsPanel
                        selectedStudent={selectedStudentForContenders}
                        attendeeNames={attendeeNames}
                        activeRelationshipType={activeRelationshipType}
                        conflictParseResult={conflictParseResult}
                        worksWellParseResult={worksWellParseResult}
                        worksWellStrongParseResult={worksWellStrongParseResult}
                        conflictError={conflictError}
                        worksWellError={worksWellError}
                        worksWellStrongError={worksWellStrongError}
                        conflictSummaryText={conflictSummaryText}
                        worksWellSummaryText={worksWellSummaryText}
                        worksWellStrongSummaryText={worksWellStrongSummaryText}
                        onRelationshipTypeChange={setActiveRelationshipType}
                        onToggleRelationship={toggleRelationship}
                      />
                    ) : (
                      <SeatContendersPanel selectedStudent={selectedStudentForContenders} />
                    )}
                  </div>
                )}

                <div className="flex justify-center border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('submit')}
                    disabled={attendeeNames.length === 0}
                    className="rounded-full bg-primary px-8 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Proceed to submit
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'submit' && (
              <SubmitTabContent
                layoutMode={layoutMode}
                generationMethod={generationMethod}
                attendeeNames={attendeeNames}
                selectedSeatCount={selectedSeatCount}
                conflictSummary={conflictSummary}
                worksWellSummary={worksWellSummary}
                worksWellStrongSummary={worksWellStrongSummary}
                submitError={submitError}
                isPending={isPending}
                onSubmit={() =>
                  submitJob(
                    generationMethod === 'ai'
                      ? createAiJobMutation.mutate
                      : createJobMutation.mutate,
                  )
                }
                onGenerateRandom={generateRandomAssignments}
                onBackToSettings={() => setActiveTab('settings')}
                isSubmitDisabled={isPending}
              />
            )}
          </div>
        </section>

        {/* Column 3: summary and generation controls */}
        <div className="space-y-4 md:col-span-2 lg:col-span-1">
          <SummaryPanel
            attendeeCount={attendeeNames.length}
            selectedSeatCount={selectedSeatCount}
            gridCapacity={gridCapacity}
            rows={gridSize.rows}
            cols={gridSize.cols}
            conflicts={conflictSummary.totalConflicts}
            partners={worksWellSummary.totalPartners}
            strongPartners={worksWellStrongSummary.totalPartners}
          />

          <section
            aria-label="Generate"
            className="rounded-[12px] border border-line bg-card shadow-card"
          >
            <header className="border-b border-line px-4 py-3">
              <h2 className="text-base font-semibold">Generate</h2>
            </header>
            <div className="space-y-4 p-4">
              {layoutMode === 'custom' && (
                <fieldset className="space-y-2">
                  <legend className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    Method
                  </legend>
                  {AI_GENERATION_ENABLED && isPlus ? (
                    <div className="inline-flex overflow-hidden rounded-full border border-line">
                      {(['programmatic', 'ai'] as const).map((method, index) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setGenerationMethod(method)}
                          aria-pressed={generationMethod === method}
                          className={`px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            index > 0 ? 'border-l border-line' : ''
                          } ${
                            generationMethod === method
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {method === 'programmatic' ? 'Algorithmic' : 'AI assist'}
                        </button>
                      ))}
                    </div>
                  ) : AI_GENERATION_ENABLED ? (
                    <>
                      <p className="text-sm font-medium text-foreground">Algorithmic</p>
                      <p className="text-xs font-medium text-primary">
                        AI-assisted generation is available on the Plus plan.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-foreground">Algorithmic</p>
                  )}
                </fieldset>
              )}

              <fieldset className="space-y-2">
                <label
                  htmlFor="max-results"
                  className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Result options
                </label>
                <input
                  id="max-results"
                  type="number"
                  min={1}
                  max={limits.maxResultsPerRun}
                  value={maxResults}
                  onChange={handleMaxResultsChange}
                  onBlur={handleMaxResultsBlur}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-xs text-muted-foreground">
                  1–{limits.maxResultsPerRun} per run.
                  {!isPlus && (
                    <span className="mt-1 block font-medium text-primary">
                      Plus allows up to {SUBSCRIPTION_LIMITS.plus.maxResultsPerRun}.
                    </span>
                  )}
                </p>
              </fieldset>

              {submitError && <FormAlert tone="error">{submitError}</FormAlert>}

              {layoutMode === 'random' ? (
                <button
                  type="button"
                  onClick={generateRandomAssignments}
                  disabled={attendeeNames.length === 0 || selectedSeatCount === 0}
                  className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Generate random seating
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    submitJob(
                      generationMethod === 'ai'
                        ? createAiJobMutation.mutate
                        : createJobMutation.mutate,
                    )
                  }
                  disabled={isPending}
                  className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? 'Generating…' : 'Generate chart'}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-8">
        <JobResultsSection
          jobSummary={jobSummary}
          jobStatus={jobStatus}
          jobResults={jobResults}
          statusError={statusError}
          isRefreshing={isRefreshing}
          isAutoRefreshing={isAutoRefreshing}
          onRefresh={refreshJob}
          fallbackCols={submittedCols ?? gridSize.cols}
          seatGrid={submittedSeatGrid}
        />
      </div>
    </section>
  );
}
