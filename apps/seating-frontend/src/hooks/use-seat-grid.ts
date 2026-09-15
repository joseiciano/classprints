import { ChangeEvent, useEffect, useState } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import { GridSize, clamp, createSeatGrid, resizeSeatGrid } from '../lib/arrangement-utils';

type SeatGridOptions = {
  initialGrid: GridSize;
  minSize: number;
  maxSize: number;
};

export function useSeatGrid({ initialGrid, minSize, maxSize }: SeatGridOptions) {
  const [gridSize, setGridSize] = useState<GridSize>(initialGrid);
  const [gridInputs, setGridInputs] = useState({
    rows: initialGrid.rows.toString(),
    cols: initialGrid.cols.toString(),
  });
  const [seatGrid, setSeatGrid] = useState<SeatingGrid>(() =>
    createSeatGrid(initialGrid.rows, initialGrid.cols),
  );

  useEffect(() => {
    setSeatGrid((prev) => resizeSeatGrid(prev, gridSize.rows, gridSize.cols));
  }, [gridSize.rows, gridSize.cols]);

  const handleGridSizeChange =
    (field: keyof GridSize) => (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      setGridInputs((prev) => ({ ...prev, [field]: rawValue }));

      if (rawValue === '') {
        return;
      }

      const parsed = Number.parseInt(rawValue, 10);
      if (Number.isNaN(parsed)) {
        return;
      }

      const safeValue = clamp(parsed, minSize, maxSize);
      setGridSize((prev) => ({ ...prev, [field]: safeValue }));
      setGridInputs((prev) => ({ ...prev, [field]: safeValue.toString() }));
    };

  const handleGridSizeBlur = (field: keyof GridSize) => () => {
    setGridInputs((prev) => {
      if (prev[field] === '') {
        return { ...prev, [field]: gridSize[field].toString() };
      }
      return prev;
    });
  };

  const clearGrid = () => {
    setSeatGrid(createSeatGrid(gridSize.rows, gridSize.cols));
  };

  return {
    gridSize,
    gridInputs,
    seatGrid,
    setSeatGrid,
    handleGridSizeChange,
    handleGridSizeBlur,
    clearGrid,
  };
}
