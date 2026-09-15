import { sha256 } from '../utils/hash';

export const generateArrangementHash = async (
  arrangement: (string | null)[][],
): Promise<string> => {
  const positions: Array<{ student: string; row: number; col: number }> = [];
  arrangement.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value) {
        positions.push({ student: value, row: rowIndex, col: colIndex });
      }
    });
  });
  positions.sort((a, b) => a.student.localeCompare(b.student));
  const hashInput = positions.map((pos) => `${pos.student}:${pos.row},${pos.col}`).join('|');
  return sha256(hashInput);
};
