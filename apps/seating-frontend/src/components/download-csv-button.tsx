import { Download } from 'lucide-react';
import { useSubscription } from '../hooks/use-subscription';
import { Button } from './ui/button';

interface ArrangementResult {
  arrangement: (string | null)[][];
  fitnessScore: number;
  createdAt: string;
}

interface DownloadCsvButtonProps {
  results: ArrangementResult[];
  filename?: string;
  label?: string;
  className?: string;
}

export function DownloadCsvButton({
  results,
  filename = 'seating-arrangements.csv',
  label = 'Export CSV',
  className = '',
}: DownloadCsvButtonProps) {
  const { isPlus } = useSubscription();

  if (!isPlus) {
    return null;
  }

  const downloadCsv = () => {
    const csvParts: string[] = [];

    results.forEach((result, index) => {
      csvParts.push(`"Arrangement ${index + 1}"`);
      const gridRows = result.arrangement.map((row) =>
        row.map((cell) => `"${(cell ?? '').replaceAll('"', '""')}"`).join(','),
      );
      csvParts.push(...gridRows);

      if (index < results.length - 1) {
        csvParts.push('', '');
      }
    });

    const blob = new Blob([csvParts.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={downloadCsv}
      disabled={results.length === 0}
      className={`min-h-11 justify-center rounded-full bg-card px-4 text-sm ${className}`}
    >
      <Download aria-hidden="true" className="h-4 w-4" />
      {label}
    </Button>
  );
}
