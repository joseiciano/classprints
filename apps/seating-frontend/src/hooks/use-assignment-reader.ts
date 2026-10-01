/**
 * Barrel for every Assignment Reader React Query hook (TASK-019). Hooks are
 * grouped by resource under `./assignment-reader/` to keep each file
 * reviewable; import from here so call sites have one stable path.
 */
export * from './assignment-reader/assignments';
export * from './assignment-reader/classes';
export * from './assignment-reader/documents';
export * from './assignment-reader/material-versions';
export * from './assignment-reader/seating-charts';
export * from './assignment-reader/students';
export * from './assignment-reader/submissions';
