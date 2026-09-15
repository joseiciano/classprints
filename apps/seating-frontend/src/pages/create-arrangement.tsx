import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import { SUBSCRIPTION_LIMITS } from '@classprints/seating-shared';
import { useMutation } from '@tanstack/react-query';
import { JobResultsSection } from '../components/create-arrangement/job-results-section';
import { LayoutModeToggle } from '../components/create-arrangement/layout-mode-toggle';
import { SeatMapPanel } from '../components/create-arrangement/seat-map-panel';
import { SettingsTabContent } from '../components/create-arrangement/settings-tab-content';
import { AttendeeInputSection } from '../components/create-arrangement/attendee-input-section';
import { StudentSelectorList } from '../components/create-arrangement/student-selector-list';
import { StudentEmptyState } from '../components/create-arrangement/student-empty-state';
import { StudentDetailHeader } from '../components/create-arrangement/student-detail-header';
import { RelationshipsPanel } from '../components/create-arrangement/relationships-panel';
import { SeatContendersPanel } from '../components/create-arrangement/seat-contenders-panel';
import { SubmitTabContent } from '../components/create-arrangement/submit-tab-content';
import { useJobMonitor } from '../hooks/use-job-monitor';
import { useRandomAssignments } from '../hooks/use-random-assignments';
import { useRelationships } from '../hooks/use-relationships';
import { useSeatGrid } from '../hooks/use-seat-grid';
import { useSeatInteractions } from '../hooks/use-seat-interactions';
import { useSubscription } from '../hooks/use-subscription';
import { GridSize, clamp } from '../lib/arrangement-utils';
import {
  SeatingApiError,
  SeatingJobSummary,
  // createSeatingAiJob,
  createSeatingJob,
} from '../lib/seating-api';

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 12;
const DEFAULT_GRID: GridSize = { rows: 5, cols: 5 };
const DEFAULT_RESULTS = 1;

type Tab = 'settings' | 'students' | 'submit';
type GenerationMethod = 'programmatic' | 'ai';
type RelationshipType = 'conflicts' | 'works-well' | 'works-well-strong';

export function CreateArrangementPage() {
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

  /*
  const createAiJobMutation = useMutation({
    mutationFn: createSeatingAiJob,
    onMutate: () => setSubmitError(null),
    onSuccess: handleSubmitSuccess,
    onError: handleSubmitError,
  });
  */

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

  const submitJob = (
    event: FormEvent<HTMLFormElement>,
    submit: typeof createJobMutation.mutate,
  ) => {
    event.preventDefault();
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) =>
    submitJob(event, createJobMutation.mutate);

  /*
  const handleAiSubmit = (event: FormEvent<HTMLFormElement>) =>
    submitJob(event, createAiJobMutation.mutate);
  */

  useEffect(() => {
    if (!jobStatus) return;
    setJobSummary((prev) =>
      prev ? { ...prev, status: jobStatus.status, updatedAt: jobStatus.updatedAt } : prev,
    );
  }, [jobStatus]);

  const allTabs: { id: Tab; label: string }[] = [
    { id: 'settings', label: '1. Grid & Settings' },
    { id: 'students', label: '2. Students & Rules' },
    { id: 'submit', label: '3. Submit' },
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
    <section className="space-y-10">
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
          Seating Chart Generator{' '}
        </p>
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
          Create a New Seating Chart{' '}
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          List attendees, set your room layout, define your room constraints, and we will generate
          your seating charts.{' '}
        </p>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <LayoutModeToggle layoutMode={layoutMode} onChange={setLayoutMode} />

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
          <SettingsTabContent
            layoutMode={layoutMode}
            generationMethod={generationMethod}
            names={names}
            gridSize={gridSize}
            gridInputs={gridInputs}
            maxResults={maxResults}
            isPlus={isPlus}
            selectedSeatCount={selectedSeatCount}
            gridCapacity={gridCapacity}
            attendeeNames={attendeeNames}
            nameValidationIssues={nameValidationIssues}
            onGenerationMethodChange={setGenerationMethod}
            onNamesChange={setNames}
            onGridSizeChange={handleGridSizeChange}
            onGridSizeBlur={handleGridSizeBlur}
            onMaxResultsChange={handleMaxResultsChange}
            onMaxResultsBlur={handleMaxResultsBlur}
            onNextClick={() => setActiveTab(layoutMode === 'random' ? 'submit' : 'students')}
            onClearGrid={clearGrid}
            onSeatPointerDown={wrapSeatInteraction(handleSeatPointerDown, 'click')}
            onSeatPointerEnter={wrapSeatInteraction(handleSeatPointerEnter, 'hover')}
            onSeatKeyDown={wrapSeatInteraction(handleSeatKeyDown, 'click')}
            seatGrid={seatGrid}
            isRandomView={isRandomView}
            randomAssignments={randomAssignments}
          />
        )}

        {activeTab === 'students' && (
          <div className="space-y-8">
            <AttendeeInputSection
              names={names}
              attendeeNames={attendeeNames}
              nameValidationIssues={nameValidationIssues}
              onNamesChange={setNames}
            />

            <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
              <StudentSelectorList
                attendeeNames={attendeeNames}
                selectedStudentForContenders={selectedStudentForContenders}
                conflictParseResult={conflictParseResult}
                worksWellParseResult={worksWellParseResult}
                worksWellStrongParseResult={worksWellStrongParseResult}
                seatContenders={seatContenders}
                onSelectStudent={setSelectedStudentForContenders}
              />

              <div className="space-y-6">
                {!selectedStudentForContenders ? (
                  <StudentEmptyState onSubmitTabClick={() => setActiveTab('submit')} />
                ) : (
                  <div className="space-y-6">
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
                      <>
                        <SeatContendersPanel selectedStudent={selectedStudentForContenders} />
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
                      </>
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
          <SubmitTabContent
            layoutMode={layoutMode}
            generationMethod={generationMethod}
            attendeeNames={attendeeNames}
            selectedSeatCount={selectedSeatCount}
            conflictSummary={conflictSummary}
            worksWellSummary={worksWellSummary}
            worksWellStrongSummary={worksWellStrongSummary}
            submitError={submitError}
            isPending={createJobMutation.isPending}
            onSubmit={() => {
              const mockEvent = { preventDefault: () => {} } as FormEvent<HTMLFormElement>;
              handleSubmit(mockEvent);
            }}
            onGenerateRandom={generateRandomAssignments}
            onBackToSettings={() => setActiveTab('settings')}
            isSubmitDisabled={createJobMutation.isPending}
          />
        )}
      </div>

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

      {/* Hidden form to handle submission logic if needed */}
      <form onSubmit={handleSubmit} className="hidden" />
    </section>
  );
}
