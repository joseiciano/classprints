import { z } from 'zod';
import { mergeRelationshipMaps, seatingRequestSchema } from './schemas';
import type { RelationshipMap, SeatingRequest } from './types';

type ParsedSeatingRequest = z.output<typeof seatingRequestSchema> & {
  workswellwith?: RelationshipMap;
  workswellwith_soft?: RelationshipMap;
  workswellwith_strong?: RelationshipMap;
};

export const validateSeatingRequest = (payload: unknown): SeatingRequest => {
  const parsed = seatingRequestSchema.parse(payload) as ParsedSeatingRequest;
  const { workswellwith, workswellwith_soft, workswellwith_strong, worksWellWith, ...rest } =
    parsed;
  const worksWellWithSoft = mergeRelationshipMaps(
    rest.worksWellWithSoft,
    worksWellWith,
    workswellwith,
    workswellwith_soft,
  );
  const worksWellWithStrong = mergeRelationshipMaps(rest.worksWellWithStrong, workswellwith_strong);
  return {
    ...rest,
    conflicts: rest.conflicts ?? {},
    worksWellWithSoft,
    worksWellWithStrong,
  } satisfies SeatingRequest;
};
