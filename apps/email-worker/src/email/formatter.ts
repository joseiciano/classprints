import type { SeatingGrid } from '@classprints/seating-shared';
import type { JobRecord, SeatingResult } from '../types';
import { baseLayout } from './templates';

export interface EmailContent {
  subject: string;
  html: string;
}

export const buildEmailContent = (job: JobRecord, results: SeatingResult[]): EmailContent => {
  const summary = buildSummary(job);
  const arrangementHtml = results.length
    ? results
        .map((result, index) => renderArrangement(result, index + 1, job.seatingGrid))
        .join('<hr style="margin:24px 0;">')
    : '<p>No seating arrangements were generated. You can try another run with different options.</p>';

  const html = baseLayout(`
    <h1 style="font-size: 20px; margin-bottom: 8px;">Your seating arrangements are ready</h1>
    <p style="margin-top: 0;">We generated ${results.length} arrangement${results.length === 1 ? '' : 's'} for your ${
      job.students.length
    } students.</p>
    ${summary}
    ${arrangementHtml}
    <p style="font-size: 12px; color: #6b7280; margin-top: 32px;">Sent on ${new Date().toLocaleString()}.</p>
  `);

  return {
    subject: `Seating arrangements ready (${results.length})`,
    html,
  } satisfies EmailContent;
};

const buildSummary = (job: JobRecord) => {
  if (!job.statusMetadata) {
    return '';
  }
  const {
    resultsDelivered,
    resultsRequested,
    completionReason,
    generationReached,
    maxGenerations,
  } = job.statusMetadata;
  const completionCopy =
    completionReason === 'target_met'
      ? 'Target met'
      : completionReason === 'failed_no_results'
        ? 'Unable to reach a valid arrangement after full run'
        : completionReason === 'dropped_from_queue'
          ? 'Dropped from queue after repeated failures'
          : 'Stopped after reaching max generations';

  return `
    <div style="background:#f3f4f6; padding:12px 16px; border-radius:8px; margin:16px 0;">
      <strong>Run summary:</strong>
      <div>${resultsDelivered}/${resultsRequested} arrangements · ${completionCopy}</div>
      <div>Generation ${generationReached.toLocaleString()} of ${maxGenerations.toLocaleString()}</div>
    </div>
  `;
};

const renderArrangement = (result: SeatingResult, index: number, grid: SeatingGrid) => {
  const tableRows = result.arrangement
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, colIndex) => {
          const isSeat = grid[rowIndex]?.[colIndex];
          const background = isSeat ? '#ffffff' : '#f9fafb';
          const label = cell ?? 'Empty';
          return `<td style="border:1px solid #e5e7eb; padding:8px 12px; background:${background}; text-align:center; font-size:14px;">${label}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `
    <section>
      <h2 style="font-size:16px; margin-bottom:4px;">Option ${index}</h2>
      <p style="margin-top:0; color:#6b7280;">Fitness score ${(result.fitnessScore * 100).toFixed(1)}%</p>
      <table style="border-collapse:collapse; width:100%; margin-bottom:12px;">${tableRows}</table>
    </section>
  `;
};
