import { useEffect, useState } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import { GridSize, createNameGrid, shuffleNames } from '../lib/arrangement-utils';

type RandomAssignmentsOptions = {
  layoutMode: 'custom' | 'ai' | 'random';
  seatGrid: SeatingGrid;
  gridSize: GridSize;
  attendeeNames: string[];
};

export function useRandomAssignments({
  layoutMode,
  seatGrid,
  gridSize,
  attendeeNames,
}: RandomAssignmentsOptions) {
  const [randomAssignments, setRandomAssignments] = useState<(string | null)[][]>(() =>
    createNameGrid(gridSize.rows, gridSize.cols),
  );

  useEffect(() => {
    setRandomAssignments(createNameGrid(gridSize.rows, gridSize.cols));
  }, [gridSize.rows, gridSize.cols]);

  useEffect(() => {
    if (layoutMode !== 'random') return;
    setRandomAssignments(createNameGrid(gridSize.rows, gridSize.cols));
  }, [layoutMode, seatGrid, gridSize.rows, gridSize.cols]);

  const generateRandomAssignments = () => {
    const selectedSeats: Array<[number, number]> = [];
    seatGrid.forEach((row, rowIndex) => {
      row.forEach((isSeat, colIndex) => {
        if (isSeat) {
          selectedSeats.push([rowIndex, colIndex]);
        }
      });
    });

    const nextAssignments = createNameGrid(gridSize.rows, gridSize.cols);
    if (selectedSeats.length === 0 || attendeeNames.length === 0) {
      setRandomAssignments(nextAssignments);
      return;
    }

    const shuffledNames = shuffleNames(attendeeNames);
    selectedSeats.forEach(([rowIndex, colIndex], index) => {
      if (index < shuffledNames.length) {
        nextAssignments[rowIndex][colIndex] = shuffledNames[index];
      }
    });
    setRandomAssignments(nextAssignments);
  };

  return { randomAssignments, generateRandomAssignments };
}
