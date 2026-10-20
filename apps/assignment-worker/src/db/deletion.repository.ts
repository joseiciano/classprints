import { z } from 'zod';
import type { Sql } from '@classprints/server/db';
import {
  failureCodeSchema,
  deletionTargetTypeSchema,
  type DeletionTargetType,
} from '@classprints/assignment-reader-shared';

/**
 * Deletion pipeline repository (TASK-006): reads one operation's pending
 * object rows in batches of at most 1000, advances per-key completion so
 * replay skips completed keys and resumes partial failures (TEST-006), and
 * finalizes by deleting the operation's relational rows leaf-first in one
 * transaction. Finalization is gated on every object row for the operation
 * being completed — a pending key means work remains; a hard-failed key
 * (attempt ceiling) must block completion so its blob is never orphaned
 * (BUG-1 regression; REQ-022). Hierarchy foreign keys are NO ACTION by
 * design (pages own R2 keys, so no cascade), so scope deletes run in strict
 * child→parent order: pages → submissions → material versions → assignments
 * → students → charts → classes. The whole finalize is atomic: either every
 * scope row is gone and the operation is completed, or the transaction rolls
 * back and replay repeats it.
 */

/** Single source of truth for the per-key attempt ceiling. */
export const MAX_ATTEMPTS_PER_KEY = 5;

const DELETION_BATCH_LIMIT = 1000;

export interface DeletionObjectRow {
  id: string;
  storageKey: string;
  status: 'pending' | 'completed' | 'failed';
  attempts: number;
}

export interface DeletionOperationRow {
  id: string;
  targetType: DeletionTargetType;
  targetId: string;
  status: 'pending' | 'completed' | 'failed';
}

const rowSchema = z.object({
  id: z.string(),
  storage_key: z.string(),
  status: z.string(),
  attempts: z.coerce.number().int().min(0),
});

const operationSchema = z.object({
  id: z.string(),
  target_type: deletionTargetTypeSchema,
  target_id: z.string(),
  status: z.enum(['pending', 'completed', 'failed']),
});

/**
 * Deletes one scope's relational rows leaf-first. Runs inside the finalize
 * transaction; every statement is a plain DELETE (idempotent under replay).
 *
 * Materials scope nulls `submissions.materials_version_id` first so the
 * destructive delete cannot be blocked by an immutable review-context
 * reference: REQ-022 makes the deleted target unavailable immediately, so the
 * captured context legitimately ceases to resolve. The API layer (TASK-018)
 * may pre-validate scopes; the consumer stays unblocked either way.
 */
export const deleteScopeRelationalRows = async (
  tx: Sql,
  targetType: DeletionTargetType,
  targetId: string,
): Promise<void> => {
  const target = targetId;
  switch (targetType) {
    case 'page':
      // page_reviews, question_segments, question_judgments, and
      // transcription_attempts cascade from pages.
      await tx`delete from public.pages where id = ${target}::uuid`;
      return;
    case 'materials':
      // TASK-018 contract: the API creates this scope with target_id =
      // the ASSIGNMENT id (manifest §1.4 removes draft + current + every
      // historical version of the assignment in one operation). Null the
      // immutable review-context references first, then delete pages and
      // every material version of that assignment.
      await tx`update public.submissions
        set materials_version_id = null, updated_at_ms = ${Date.now()}
        where assignment_id = ${target}::uuid`;
      await tx`delete from public.pages
        where materials_version_id in (
          select id from public.assignment_material_versions
          where assignment_id = ${target}::uuid
        )`;
      await tx`delete from public.assignment_material_versions
        where assignment_id = ${target}::uuid`;
      return;
    case 'submission':
      await tx`delete from public.pages where submission_id = ${target}::uuid`;
      await tx`delete from public.submissions where id = ${target}::uuid`;
      return;
    case 'student_data':
      await tx`delete from public.pages
        where submission_id in (select id from public.submissions where student_id = ${target}::uuid)`;
      await tx`delete from public.submissions where student_id = ${target}::uuid`;
      await tx`delete from public.students where id = ${target}::uuid`;
      return;
    case 'assignment':
      await tx`delete from public.pages
        where materials_version_id in (
          select id from public.assignment_material_versions where assignment_id = ${target}::uuid
        )
        or submission_id in (
          select id from public.submissions where assignment_id = ${target}::uuid
        )`;
      await tx`delete from public.submissions where assignment_id = ${target}::uuid`;
      await tx`delete from public.assignment_material_versions where assignment_id = ${target}::uuid`;
      await tx`delete from public.assignments where id = ${target}::uuid`;
      return;
    case 'class':
      await tx`delete from public.pages
        where materials_version_id in (
          select v.id from public.assignment_material_versions v
          join public.assignments a on a.id = v.assignment_id
          where a.class_id = ${target}::uuid
        )
        or submission_id in (
          select s.id from public.submissions s
          join public.assignments a on a.id = s.assignment_id
          where a.class_id = ${target}::uuid
        )`;
      await tx`delete from public.submissions
        where assignment_id in (select id from public.assignments where class_id = ${target}::uuid)`;
      await tx`delete from public.assignment_material_versions
        where assignment_id in (select id from public.assignments where class_id = ${target}::uuid)`;
      await tx`delete from public.assignments where class_id = ${target}::uuid`;
      await tx`delete from public.students where class_id = ${target}::uuid`;
      await tx`delete from public.saved_seating_charts where class_id = ${target}::uuid`;
      await tx`delete from public.classes where id = ${target}::uuid`;
      return;
    case 'account':
      // Assignment Reader scope only: the users row and non-AR domains
      // (billing, seating jobs) belong to the account-deletion API (TASK-018).
      await tx`delete from public.pages where teacher_id = ${target}::uuid`;
      await tx`delete from public.submissions where teacher_id = ${target}::uuid`;
      await tx`delete from public.assignment_material_versions where teacher_id = ${target}::uuid`;
      await tx`delete from public.assignments where teacher_id = ${target}::uuid`;
      await tx`delete from public.students where teacher_id = ${target}::uuid`;
      await tx`delete from public.saved_seating_charts where teacher_id = ${target}::uuid`;
      await tx`delete from public.classes where teacher_id = ${target}::uuid`;
      return;
  }
};

export class DeletionRepository {
  constructor(private readonly sql: Sql) {}

  /**
   * Loads the operation when it is still pending; returns null for unknown,
   * already-completed, or failed operations so replay is a no-op.
   */
  async loadPendingOperation(operationId: string): Promise<DeletionOperationRow | null> {
    const rows = await this.sql`
      select id, target_type, target_id, status
      from public.deletion_operations
      where id = ${operationId}::uuid and status = 'pending'
      limit 1`;
    const parsed = z.array(operationSchema).safeParse(rows);
    if (!parsed.success || parsed.data.length === 0) {
      return null;
    }
    const row = parsed.data[0];
    return {
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      status: row.status,
    };
  }

  /** Claims up to 1000 pending object rows for this operation. */
  async loadPendingObjects(operationId: string): Promise<DeletionObjectRow[]> {
    const rows = await this.sql`
      select id, storage_key, status, attempts
      from public.deletion_objects
      where operation_id = ${operationId}::uuid and status = 'pending'
      order by created_at_ms, id
      limit ${DELETION_BATCH_LIMIT}`;
    const parsed = z.array(rowSchema).safeParse(rows);
    if (!parsed.success) {
      throw new Error('deletion_objects row shape invalid');
    }
    return parsed.data.map((row) => ({
      id: row.id,
      storageKey: row.storage_key,
      status: row.status as DeletionObjectRow['status'],
      attempts: row.attempts,
    }));
  }

  /** Marks one object key completed; idempotent per key. */
  async markObjectCompleted(objectId: string): Promise<void> {
    await this.sql`
      update public.deletion_objects
      set status = 'completed', completed_at_ms = ${Date.now()}
      where id = ${objectId}::uuid and status = 'pending'`;
  }

  /** Records a failed delete attempt and bumps the attempt counter. */
  async markObjectFailed(objectId: string, failureCode: string, message: string): Promise<void> {
    const safeCode = failureCodeSchema.catch('storage_failure').parse(failureCode);
    const safeMessage = message.slice(0, 500);
    await this.sql`
      update public.deletion_objects
      set attempts = attempts + 1,
          status = case
            when attempts + 1 >= ${MAX_ATTEMPTS_PER_KEY} then 'failed' else 'pending'
          end,
          last_error = ${`${safeCode}: ${safeMessage}`}
      where id = ${objectId}::uuid and status = 'pending'`;
  }

  /**
   * Finalizes the operation: locks the pending row, verifies every object
   * row for the operation is completed (pending means work remains; failed
   * means a blob was never deleted and must not be orphaned), deletes the
   * scope's relational rows leaf-first, and marks the operation completed —
   * all in one transaction. Returns false when the operation is no longer
   * pending (another replay finalized it) or when the object gate fails
   * (outstanding keys); true only when this call completed it.
   */
  async finalizeRelationalDeletion(operation: DeletionOperationRow): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const locked = await tx`
        select id from public.deletion_operations
        where id = ${operation.id}::uuid and status = 'pending'
        for update`;
      if (locked.length === 0) {
        return false; // another replay finalized it first
      }
      // Completion gate inside the locked transaction: any key for this
      // operation that is not completed (pending work or a hard-failed row
      // awaiting operator recovery) blocks relational deletion (BUG-1).
      const outstanding = await tx`
        select count(*)::int as n from public.deletion_objects
        where operation_id = ${operation.id}::uuid and status <> 'completed'`;
      if (Number(outstanding[0]?.n ?? 0) > 0) {
        return false; // outstanding keys; resume/recover before finalizing
      }
      await deleteScopeRelationalRows(tx, operation.targetType, operation.targetId);
      await tx`
        update public.deletion_operations
        set status = 'completed', updated_at_ms = ${Date.now()}
        where id = ${operation.id}::uuid`;
      return true;
    });
  }

  /**
   * Outstanding (pending or hard-failed) object count for DLQ recovery
   * visibility; drives scripts/deletion-recovery.sh.
   */
  async outstandingObjectCount(operationId: string): Promise<number> {
    const rows = await this.sql`
      select count(*) as n from public.deletion_objects
      where operation_id = ${operationId}::uuid and status <> 'completed'`;
    const parsed = z.array(z.object({ n: z.coerce.number() })).safeParse(rows);
    return parsed.success ? parsed.data[0].n : 0;
  }
}
