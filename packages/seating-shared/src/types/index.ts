import { z } from 'zod';
import {
  arrangementSchema,
  completionReasonSchema,
  jobQueueMessageSchema,
  jobStatusMetadataSchema,
  jobStatusSchema,
  relationshipMapSchema,
  seatingGridSchema,
  seatingJobSchema,
  seatingJobStatusResponseSchema,
  seatingJobSummarySchema,
  seatingRequestSchema,
  seatingResultSchema,
  seatingResultsResponseSchema,
  relaxationReasonSchema,
  algorithmSchema,
  seatContendersSchema,
  seatingConfigSchema,
  createSeatingConfigSchema,
  updateSeatingConfigSchema,
} from '../schemas';

export type SeatingGrid = z.infer<typeof seatingGridSchema>;
export type RelationshipMap = z.infer<typeof relationshipMapSchema>;
export type SeatContenders = z.infer<typeof seatContendersSchema>;
export type ConflictMap = RelationshipMap;
export type WorksWellWithMap = RelationshipMap;
export type WorksWellWithSoftMap = RelationshipMap;
export type WorksWellWithStrongMap = RelationshipMap;
export type SeatingArrangement = z.infer<typeof arrangementSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type Algorithm = z.infer<typeof algorithmSchema>;
export type CompletionReason = z.infer<typeof completionReasonSchema>;
export type RelaxationReason = z.infer<typeof relaxationReasonSchema>;
export type JobStatusMetadata = z.infer<typeof jobStatusMetadataSchema>;
export type SeatingResult = z.infer<typeof seatingResultSchema>;
export type SeatingJob = z.infer<typeof seatingJobSchema>;
export type SeatingJobSummary = z.infer<typeof seatingJobSummarySchema>;
export type SeatingJobStatusResponse = z.infer<typeof seatingJobStatusResponseSchema>;
export type SeatingResultsResponse = z.infer<typeof seatingResultsResponseSchema>;
export type SeatingJobQueueMessage = z.infer<typeof jobQueueMessageSchema>;

export type CreateSeatingJobPayload = z.input<typeof seatingRequestSchema>;

type ParsedSeatingRequest = z.output<typeof seatingRequestSchema> & {
  workswellwith?: RelationshipMap;
  workswellwith_soft?: RelationshipMap;
  workswellwith_strong?: RelationshipMap;
};

export type SeatingRequest = Omit<
  ParsedSeatingRequest,
  'workswellwith' | 'workswellwith_soft' | 'workswellwith_strong' | 'worksWellWith'
> & {
  worksWellWithSoft: RelationshipMap;
  worksWellWithStrong: RelationshipMap;
};

export type SeatingConfig = z.infer<typeof seatingConfigSchema>;
export type CreateSeatingConfigPayload = z.input<typeof createSeatingConfigSchema>;
export type UpdateSeatingConfigPayload = z.input<typeof updateSeatingConfigSchema>;
