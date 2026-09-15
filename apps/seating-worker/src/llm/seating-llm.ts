import type { SeatingArrangement, SeatingJob } from '@classprints/seating-shared';

const DEFAULT_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_VALIDATION_ERRORS = 10;

const MODELS = [
  'google/gemini-2.5-flash-lite',
  'google/gemini-3-flash-preview',
  'openai/gpt-4.1-nano',
] as const;

export interface LlmRequestConfig {
  apiKey: string;
}

export const generateLlmArrangement = async (
  job: SeatingJob,
  config: LlmRequestConfig,
  attempts = 3,
): Promise<SeatingArrangement> => {
  let lastErrors: string[] = [];
  let lastError: Error | null = null;

  for (const model of MODELS) {
    lastErrors = [];
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await requestLlmArrangement(job, config, model, lastErrors);
        const result = validateArrangementWithDetails(job, response);

        console.log('\n=== SEATING ARRANGEMENT ===');
        console.log(formatArrangementGrid(job.seatingGrid, response, result.studentPositions));
        console.log('\n=== VALIDATION RESULT ===');

        if (result.errors.length === 0) {
          console.log('✓ VALID - All constraints satisfied:');
          console.log(`  - All ${job.students.length} students placed exactly once`);
          console.log(`  - No invalid seat assignments`);
          console.log(`  - No duplicate or missing students`);
          console.log('');
          return response;
        }

        console.log(`✗ INVALID - ${result.errors.length} error(s) found:`);
        result.errors.forEach((error: string, idx: number) =>
          console.log(`  ${idx + 1}. ${error}`),
        );
        console.log('');
        lastErrors = result.errors;
        lastError = new Error(`LLM arrangement failed validation: ${result.errors.join('; ')}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('LLM request failed');
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('LLM request failed');
};

const requestLlmArrangement = async (
  job: SeatingJob,
  config: LlmRequestConfig,
  model: string,
  validationErrors: string[],
): Promise<SeatingArrangement> => {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(job, validationErrors);

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
    include_reasoning: false,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(DEFAULT_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as { arrangement?: SeatingArrangement };
    if (!parsed.arrangement) {
      throw new Error('LLM response missing arrangement field');
    }
    return parsed.arrangement;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('LLM response was not valid JSON');
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const buildSystemPrompt = () =>
  `
You are a seating optimization engine. Your goal is to assign students to seats in a grid while maximizing compatibility and minimizing conflicts.

INPUT DATA:
1. Students: A list of names.
2. Conflicts: A map where keys are students and values are lists of people they should NOT sit adjacent to.
3. WorksWellWithSoft: A map where keys are students and values are lists of people they SHOULD sit adjacent to (optional).
4. WorksWellWithStrong: A map where keys are students and values are lists of people they MUST sit adjacent to (mandatory).
5. SeatingGrid: A 2D boolean grid (true=seat, false=no seat).
6. SeatContenders: A map where keys are students and values are lists of allowed coordinates [row, col].

CRITICAL RULES:
1. OUTPUT FORMAT: Return strictly a JSON object with a single key "arrangement". The value must be a 2D array of strings or nulls.
2. SEAT VALIDITY:
   - If "seatingGrid[row][col]" is FALSE, the output "arrangement[row][col]" MUST be null.
   - If "seatingGrid[row][col]" is TRUE, you MAY place a student there or leave it null.
3. COMPLETENESS: Every student in the "Students" list MUST appear exactly once in the arrangement. Do not miss any students. Do not duplicate any students.
4. CONSTRAINTS:
   - Respect 'WorksWellWithStrong' above all other preferences. If people are in 'WorksWellWithStrong' they must be in the same group. They can only be in separate groups (assuming seats are separate by spaces in the grid) if the number of bigger than the amount of seats in the group. 
   - Avoid adjacency for 'Conflicts'.
   - Maximize adjacency for 'WorksWellWithSoft'.
5. SEAT CONTENDERS: If a student has specific allowed seats defined in 'SeatContenders', they MUST be placed in one of those coordinates. This is non-negotiable.
6. NO HALLUCINATIONS: Do not invent names. Use only the names provided in the "Students" list.
`.trim();

const buildUserPrompt = (job: SeatingJob, validationErrors: string[]) => {
  const studentCount = job.students.length;
  const totalSeats = job.seatingGrid.flat().filter(Boolean).length;
  const dimensions = `${job.seatingGrid.length}x${job.seatingGrid[0]?.length || 0}`;

  const payload = {
    students: job.students,
    conflicts: job.conflicts,
    worksWellWithSoft: job.worksWellWithSoft,
    worksWellWithStrong: job.worksWellWithStrong,
    seatContenders: job.seatContenders,
    seatingGrid: job.seatingGrid,
  };

  const base = [
    'CONTEXT:',
    `- Students to seat: ${studentCount}`,
    `- Grid Dimensions: ${dimensions}`,
    `- Total Available Seats: ${totalSeats}`,
    '',
    'TASK:',
    `Place all ${studentCount} students into the valid seats (true) of the grid.`,
    'Respect conflicts and preferences where possible, but NEVER violate the critical rules (all students must be seated, no invalid seats).',
    '',
    'INPUT DATA (JSON):',
    JSON.stringify(payload),
    '',
    'Requirements:',
    '- Every student must appear exactly once.',
    '- Do not invent student names.',
    '- Use null for unavailable seats (grid=false).',
    'Respond with JSON: {"arrangement": [[...]]}',
  ];

  if (validationErrors.length > 0) {
    base.push(
      'Previous response errors:',
      validationErrors.slice(0, MAX_VALIDATION_ERRORS).join(' | '),
    );
    base.push('Fix these issues and return corrected JSON only.');
  }

  return base.join('\n');
};

interface ValidationResult {
  errors: string[];
  studentPositions: Map<string, { row: number; col: number }>;
}

export const validateArrangementWithDetails = (
  job: SeatingJob,
  arrangement: SeatingArrangement,
): ValidationResult => {
  const errors: string[] = [];
  const studentPositions = new Map<string, { row: number; col: number }>();

  if (!Array.isArray(arrangement) || arrangement.length !== job.seatingGrid.length) {
    return { errors: ['Arrangement must match seating grid row count'], studentPositions };
  }

  const expectedStudents = new Set(job.students);
  const counts = new Map<string, number>();

  arrangement.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== job.seatingGrid[rowIndex].length) {
      errors.push(`Row ${rowIndex} must match seating grid column count`);
      return;
    }
    row.forEach((cell, colIndex) => {
      const seatAvailable = job.seatingGrid[rowIndex][colIndex];
      if (!seatAvailable && cell !== null) {
        errors.push(`Seat (${rowIndex},${colIndex}): "${cell}" placed in unavailable seat`);
        return;
      }
      if (cell === null) return;
      if (typeof cell !== 'string' || cell.trim().length === 0) {
        errors.push(`Seat (${rowIndex},${colIndex}): Invalid value (must be student name or null)`);
        return;
      }
      if (!expectedStudents.has(cell)) {
        errors.push(`Seat (${rowIndex},${colIndex}): Unknown student "${cell}"`);
        return;
      }
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
      studentPositions.set(cell, { row: rowIndex, col: colIndex });
    });
  });

  for (const student of job.students) {
    const count = counts.get(student) ?? 0;
    if (count === 0) errors.push(`Missing student: "${student}"`);
    if (count > 1) errors.push(`Duplicate student: "${student}" appears ${count} times`);
  }

  // Check seat contenders
  for (const [student, allowed] of Object.entries(job.seatContenders ?? {})) {
    const pos = studentPositions.get(student);
    if (pos) {
      const isAllowed = allowed.some(([r, c]) => r === pos.row && c === pos.col);
      if (!isAllowed) {
        const allowedStr = allowed.map(([r, c]) => `(${r},${c})`).join(', ');
        errors.push(
          `Seat (${pos.row},${pos.col}): "${student}" must be placed in one of the allowed seats: ${allowedStr}`,
        );
      }
    }
  }

  return { errors, studentPositions };
};

const formatArrangementGrid = (
  seatingGrid: boolean[][],
  arrangement: SeatingArrangement,
  studentPositions: Map<string, { row: number; col: number }>,
): string => {
  const rows: string[] = [];
  const maxNameLength = Math.max(
    8,
    ...Array.from(studentPositions.keys()).map((name) => name.length),
  );

  // Header
  const colCount = seatingGrid[0]?.length ?? 0;
  const headerCols = Array.from({ length: colCount }, (_, i) => `Col ${i}`.padEnd(maxNameLength));
  rows.push('          ' + headerCols.join(' | '));
  rows.push(''.padEnd(rows[0].length, '-'));

  // Grid rows
  arrangement.forEach((row, rowIndex) => {
    const cells: string[] = [];
    row.forEach((cell, colIndex) => {
      const isSeat = seatingGrid[rowIndex]?.[colIndex] ?? false;
      if (!isSeat) {
        cells.push('[XXXXXX]'.padEnd(maxNameLength));
      } else if (cell === null) {
        cells.push('[empty]'.padEnd(maxNameLength));
      } else {
        cells.push(cell.padEnd(maxNameLength));
      }
    });
    rows.push(`Row ${rowIndex.toString().padStart(2)} | ${cells.join(' | ')}`);
  });

  // Student placement summary
  rows.push('');
  rows.push('=== STUDENT PLACEMENTS ===');
  if (studentPositions.size === 0) {
    rows.push('No students placed');
  } else {
    const sortedStudents = Array.from(studentPositions.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    sortedStudents.forEach(([student, pos]) => {
      rows.push(`  ${student.padEnd(maxNameLength)} → Row ${pos.row}, Col ${pos.col}`);
    });
  }

  return rows.join('\n');
};
