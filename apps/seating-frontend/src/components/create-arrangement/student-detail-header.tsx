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
  return (
    <div className="flex items-center justify-between border-b border-border pb-4">
      <h3 className="text-2xl font-semibold">{selectedStudent}</h3>
      <nav className="flex gap-1 rounded-xl bg-muted/30 p-1 border border-border">
        <button
          onClick={() => onSubTabChange('relationships')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            activeSubTab === 'relationships'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Relationships
        </button>
        <button
          onClick={() => onSubTabChange('contenders')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            activeSubTab === 'contenders'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Seat Contenders
        </button>
      </nav>
    </div>
  );
}
