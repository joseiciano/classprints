import { z } from 'zod';

export const studentNameSchema = z
  .string()
  .trim()
  .min(1, 'Student name cannot be empty')
  .max(120, 'Student name is too long')
  .refine(
    (val) => {
      // Only alphabetical chars, hyphens, and spaces
      if (!/^[a-zA-Z\s-]+$/.test(val)) return false;
      // At most one space
      const spaceCount = (val.match(/ /g) || []).length;
      return spaceCount <= 1;
    },
    {
      message: 'Student name can only contain letters, hyphens, and at most one space',
    },
  );

export const relationshipMapSchema = z.record(z.array(studentNameSchema));

export const seatContendersSchema = z.record(
  z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
);

export const seatingGridSchema = z
  .array(z.array(z.boolean()))
  .min(1, 'Seating grid must have at least one row');

export const arrangementSchema = z.array(z.array(z.string().min(1).or(z.null())));

export const jobStatusSchema = z.enum(['pending', 'completed', 'failed']);
export const completionReasonSchema = z.enum([
  'target_met',
  'max_generations',
  'failed_no_results',
  'dropped_from_queue',
]);
export const relaxationReasonSchema = z.enum(['stagnation']);

export const jobStatusMetadataSchema = z.object({
  generationReached: z.number().int().nonnegative(),
  maxGenerations: z.number().int().positive(),
  resultsDelivered: z.number().int().nonnegative(),
  resultsRequested: z.number().int().positive(),
  completionReason: completionReasonSchema,
  relaxed: z.boolean().optional(),
  relaxationReason: relaxationReasonSchema.optional(),
});

export const seatingResultSchema = z.object({
  id: z.number().int().nonnegative(),
  jobId: z.string().min(1),
  arrangement: arrangementSchema,
  fitnessScore: z.number().min(0),
  arrangementHash: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});

export const algorithmSchema = z.enum(['genetic', 'llm']).default('genetic');

export const seatingJobSchema = z.object({
  id: z.string().min(1),
  externalId: z.string().min(1),
  userId: z.string().uuid(),
  email: z.string().trim().email('Invalid email address'),
  students: z.array(studentNameSchema),
  conflicts: relationshipMapSchema,
  worksWellWithSoft: relationshipMapSchema,
  worksWellWithStrong: relationshipMapSchema,
  seatContenders: seatContendersSchema,
  seatingGrid: seatingGridSchema,
  maxResults: z.number().int().min(1),
  algorithm: algorithmSchema,
  idempotencyKey: z.string().min(1),
  status: jobStatusSchema,
  errorMessage: z.string().nullable(),
  resultsCount: z.number().int().nonnegative(),
  statusMetadata: jobStatusMetadataSchema.nullable(),
  emailSentAt: z.number().int().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const seatingJobSummarySchema = z.object({
  jobId: z.string().min(1),
  status: jobStatusSchema,
  algorithm: algorithmSchema.optional(),
  email: z.string().trim().email().nullable().optional(),
  studentCount: z.number().int().nonnegative(),
  totalSeats: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  estimatedResultsAt: z.string().nullable(),
  statusMetadata: jobStatusMetadataSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const seatingJobStatusResponseSchema = z.object({
  jobId: z.string().min(1),
  status: jobStatusSchema,
  algorithm: algorithmSchema.optional(),
  resultsCount: z.number().int().nonnegative(),
  maxResults: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  statusMetadata: jobStatusMetadataSchema.nullable(),
  error: z.string().optional(),
});

export const seatingResultsResponseSchema = z.object({
  jobId: z.string().min(1),
  status: jobStatusSchema,
  algorithm: algorithmSchema.optional(),
  statusMetadata: jobStatusMetadataSchema.nullable(),
  results: z.array(
    z.object({
      arrangement: arrangementSchema,
      fitnessScore: z.number().min(0),
      createdAt: z.string(),
    }),
  ),
  error: z.string().optional(),
});

export const jobQueueMessageSchema = z.object({ jobId: z.string().min(1) });

export const seatingRequestSchema = z
  .object({
    email: z.string().trim().email('Invalid email address').optional(),
    students: z.array(studentNameSchema).min(1, 'At least one student is required'),
    conflicts: relationshipMapSchema.default({}),
    worksWellWith: relationshipMapSchema.optional(),
    worksWellWithSoft: relationshipMapSchema.optional(),
    worksWellWithStrong: relationshipMapSchema.optional(),
    workswellwith: relationshipMapSchema.optional(),
    workswellwith_soft: relationshipMapSchema.optional(),
    workswellwith_strong: relationshipMapSchema.optional(),
    seatContenders: seatContendersSchema.optional().default({}),
    seatingGrid: seatingGridSchema,
    algorithm: algorithmSchema.optional(),
    results: z
      .number({ invalid_type_error: 'results must be a number' })
      .int('results must be an integer')
      .min(1, 'results must be at least 1')
      .max(10, 'results cannot exceed 10')
      .default(1),
  })
  .superRefine((data, ctx) => {
    const normalizedStudents = data.students.map((student) => student.trim());
    const lowerCaseSet = new Set<string>();

    for (const student of normalizedStudents) {
      const key = student.toLowerCase();
      if (lowerCaseSet.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['students'],
          message: `Duplicate student name detected: ${student}`,
        });
        break;
      }
      lowerCaseSet.add(key);
    }

    if (!isRectangularGrid(data.seatingGrid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seatingGrid'],
        message: 'Seating grid must be rectangular (rows with equal length)',
      });
    }

    const totalSeats = countActiveSeats(data.seatingGrid);
    if (totalSeats === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seatingGrid'],
        message: 'Seating grid must include at least one available seat',
      });
    }

    if (totalSeats < normalizedStudents.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seatingGrid'],
        message: 'Seating grid must have at least as many seats as students',
      });
    }

    const gridRows = data.seatingGrid.length;
    const gridCols = data.seatingGrid[0]?.length ?? 0;
    if (gridRows * gridCols < normalizedStudents.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seatingGrid'],
        message: 'Grid rows x columns must cover all students',
      });
    }

    validateRelationshipMap({
      field: 'conflicts',
      map: data.conflicts ?? {},
      lowerCaseStudents: lowerCaseSet,
      ctx,
      missingStudentMessage: (name) => `Conflict references non-existent student: ${name}`,
      selfReferenceMessage: 'A student cannot conflict with themselves',
    });

    const aliasWorksWell = (data as { workswellwith?: Record<string, string[]> }).workswellwith;
    const combinedWorksWell = mergeRelationshipMaps(
      data.worksWellWith,
      data.worksWellWithSoft,
      aliasWorksWell,
      (data as { workswellwith_soft?: Record<string, string[]> }).workswellwith_soft,
    );
    const combinedStrong = mergeRelationshipMaps(
      data.worksWellWithStrong,
      (data as { workswellwith_strong?: Record<string, string[]> }).workswellwith_strong,
    );

    validateRelationshipMap({
      field: 'worksWellWith',
      map: combinedWorksWell,
      lowerCaseStudents: lowerCaseSet,
      ctx,
      missingStudentMessage: (name) => `Works-well-with references non-existent student: ${name}`,
      selfReferenceMessage: 'A student cannot list themselves as someone they work well with',
    });

    validateRelationshipMap({
      field: 'worksWellWithStrong',
      map: combinedStrong,
      lowerCaseStudents: lowerCaseSet,
      ctx,
      missingStudentMessage: (name) =>
        `Strong works-well-with references non-existent student: ${name}`,
      selfReferenceMessage: 'A student cannot list themselves as someone they work well with',
    });

    validateSeatContenders({
      map: data.seatContenders ?? {},
      lowerCaseStudents: lowerCaseSet,
      seatingGrid: data.seatingGrid,
      ctx,
    });
  });

export const countActiveSeats = (grid: boolean[][]): number =>
  grid.reduce((acc, row) => acc + row.reduce((rowAcc, cell) => rowAcc + (cell ? 1 : 0), 0), 0);

export const isRectangularGrid = (grid: boolean[][]): boolean => {
  if (grid.length === 0) return false;
  const width = grid[0].length;
  return grid.every((row) => row.length === width);
};

interface RelationshipValidationInput {
  field: 'conflicts' | 'worksWellWith' | 'worksWellWithStrong';
  map: Record<string, string[]>;
  lowerCaseStudents: Set<string>;
  ctx: z.RefinementCtx;
  missingStudentMessage: (name: string) => string;
  selfReferenceMessage: string;
}

const validateRelationshipMap = ({
  field,
  map,
  lowerCaseStudents,
  ctx,
  missingStudentMessage,
  selfReferenceMessage,
}: RelationshipValidationInput) => {
  for (const [student, related] of Object.entries(map ?? {})) {
    const normalizedStudent = student.trim().toLowerCase();
    if (!lowerCaseStudents.has(normalizedStudent)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, student],
        message: missingStudentMessage(student),
      });
      continue;
    }

    for (const name of related) {
      const normalizedName = name.trim().toLowerCase();
      if (!lowerCaseStudents.has(normalizedName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field, student],
          message: missingStudentMessage(name),
        });
        continue;
      }
      if (normalizedStudent === normalizedName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field, student],
          message: selfReferenceMessage,
        });
      }
    }
  }
};

const validateSeatContenders = ({
  map,
  lowerCaseStudents,
  seatingGrid,
  ctx,
}: {
  map: Record<string, Array<[number, number]>>;
  lowerCaseStudents: Set<string>;
  seatingGrid: boolean[][];
  ctx: z.RefinementCtx;
}) => {
  const gridRows = seatingGrid.length;
  const gridCols = seatingGrid[0]?.length ?? 0;

  for (const [student, coordinates] of Object.entries(map ?? {})) {
    const normalizedStudent = student.trim().toLowerCase();
    if (!lowerCaseStudents.has(normalizedStudent)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seatContenders', student],
        message: `Seat contender references non-existent student: ${student}`,
      });
      continue;
    }

    if (coordinates.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seatContenders', student],
        message: `Seat contender list for ${student} cannot be empty`,
      });
      continue;
    }

    for (let i = 0; i < coordinates.length; i++) {
      const [row, col] = coordinates[i];
      if (row < 0 || row >= gridRows || col < 0 || col >= gridCols) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['seatContenders', student, i],
          message: `Coordinate [${row}, ${col}] is out of grid boundaries`,
        });
        continue;
      }

      if (!seatingGrid[row][col]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['seatContenders', student, i],
          message: `Coordinate [${row}, ${col}] corresponds to an inactive seat`,
        });
      }
    }
  }
};

export const seatingConfigSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().trim().min(1, 'Config name cannot be empty').max(200, 'Config name is too long'),
  students: z.array(studentNameSchema).min(1, 'At least one student is required'),
  conflicts: relationshipMapSchema.default({}),
  worksWellWithSoft: relationshipMapSchema.default({}),
  worksWellWithStrong: relationshipMapSchema.default({}),
  seatContenders: seatContendersSchema.default({}),
  seatingGrid: seatingGridSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const createSeatingConfigSchema = z.object({
  name: z.string().trim().min(1, 'Config name cannot be empty').max(200, 'Config name is too long'),
  students: z.array(studentNameSchema).min(1, 'At least one student is required'),
  conflicts: relationshipMapSchema.default({}),
  worksWellWithSoft: relationshipMapSchema.default({}),
  worksWellWithStrong: relationshipMapSchema.default({}),
  seatContenders: seatContendersSchema.default({}),
  seatingGrid: seatingGridSchema,
});

export const updateSeatingConfigSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Config name cannot be empty')
    .max(200, 'Config name is too long')
    .optional(),
  students: z.array(studentNameSchema).min(1, 'At least one student is required').optional(),
  conflicts: relationshipMapSchema.default({}).optional(),
  worksWellWithSoft: relationshipMapSchema.default({}).optional(),
  worksWellWithStrong: relationshipMapSchema.default({}).optional(),
  seatContenders: seatContendersSchema.default({}).optional(),
  seatingGrid: seatingGridSchema.optional(),
});

export const mergeRelationshipMaps = (
  ...maps: Array<Record<string, string[]> | undefined>
): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  maps.forEach((map) => {
    for (const [key, value] of Object.entries(map ?? {})) {
      result[key] = [...value];
    }
  });
  return result;
};
