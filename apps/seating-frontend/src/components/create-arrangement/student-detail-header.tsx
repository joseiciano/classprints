type StudentSubTab = 'relationships' | 'contenders';

interface StudentDetailHeaderProps {
  selectedStudent: string;
  activeSubTab: StudentSubTab;
  onSubTabChange: (tab: StudentSubTab) => void;
}

export function StudentDetailHeader({
  selectedStudent,
  activeSubTab,
  onSubTabChange,
}: StudentDetailHeaderProps) {
  const subTabs: { id: StudentSubTab; label: string }[] = [
    { id: 'relationships', label: 'Relationships' },
    { id: 'contenders', label: 'Seat contenders' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <h3 className="font-display text-xl font-medium text-foreground">{selectedStudent}</h3>
      <nav
        aria-label="Student detail"
        className="inline-flex rounded-full border border-line bg-muted p-1"
      >
        {subTabs.map((subTab) => (
          <button
            key={subTab.id}
            type="button"
            onClick={() => onSubTabChange(subTab.id)}
            aria-current={activeSubTab === subTab.id ? 'step' : undefined}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeSubTab === subTab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {subTab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
