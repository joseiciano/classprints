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
}

export function DownloadCsvButton({
  results,
  filename = 'seating-arrangements.csv',
}: DownloadCsvButtonProps) {
  const { isPlus } = useSubscription();

  // Only show button for subscribed users
  if (!isPlus) {
    return null;
  }

  const downloadCsv = () => {
    // Convert all arrangements to CSV with headers and separators
    const csvParts: string[] = [];

    results.forEach((result, index) => {
      // Add arrangement header
      csvParts.push(`"Arrangement ${index + 1}"`);

      // Add arrangement grid rows
      const gridRows = result.arrangement.map((row) =>
        row.map((cell) => `"${cell || ''}"`).join(','),
      );
      csvParts.push(...gridRows);

      // Add two empty rows as separator (unless this is the last arrangement)
      if (index < results.length - 1) {
        csvParts.push('', '');
      }
    });

    const csvContent = csvParts.join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button variant="outline" size="sm" onClick={downloadCsv} className="h-8 gap-2 text-xs">
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </Button>
  );
}
