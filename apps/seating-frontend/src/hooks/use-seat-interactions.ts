import { Dispatch, KeyboardEvent, PointerEvent, SetStateAction, useEffect, useState } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';

type SeatGridSetter = Dispatch<SetStateAction<SeatingGrid>>;

export function useSeatInteractions(seatGrid: SeatingGrid, setSeatGrid: SeatGridSetter) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<boolean | null>(null);

  useEffect(() => {
    const handlePointerUp = () => {
      setIsDragging(false);
      setDragValue(null);
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const setSeatState = (rowIndex: number, colIndex: number, next: boolean) => {
    setSeatGrid((prev) =>
      prev.map((row, rIdx) =>
        rIdx === rowIndex ? row.map((seat, cIdx) => (cIdx === colIndex ? next : seat)) : row,
      ),
    );
  };

  const toggleSeat = (rowIndex: number, colIndex: number) => {
    setSeatGrid((prev) =>
      prev.map((row, rIdx) =>
        rIdx === rowIndex ? row.map((seat, cIdx) => (cIdx === colIndex ? !seat : seat)) : row,
      ),
    );
  };

  const handleSeatPointerDown =
    (rowIndex: number, colIndex: number) =>
    (event: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const current = seatGrid[rowIndex]?.[colIndex] ?? false;
      const next = !current;
      setSeatState(rowIndex, colIndex, next);
      setIsDragging(true);
      setDragValue(next);
    };

  const handleSeatPointerEnter =
    (rowIndex: number, colIndex: number) =>
    (event: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
      if (!isDragging || dragValue === null) return;
      event.preventDefault();
      setSeatState(rowIndex, colIndex, dragValue);
    };

  const handleSeatKeyDown =
    (rowIndex: number, colIndex: number) =>
    (event: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
      if ('key' in event && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        toggleSeat(rowIndex, colIndex);
      }
    };

  return {
    handleSeatPointerDown,
    handleSeatPointerEnter,
    handleSeatKeyDown,
  };
}
