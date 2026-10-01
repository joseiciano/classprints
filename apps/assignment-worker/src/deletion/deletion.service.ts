import type { R2Bucket } from '@cloudflare/workers-types';
import {
  DeletionRepository,
  type DeletionObjectRow,
  MAX_ATTEMPTS_PER_KEY,
} from '../db/deletion.repository';

/**
 * Generic cleanup consumer (TASK-006): locks a pending operation, deletes
 * pending R2 keys batch by batch (batches of at most 1000, drained until the
 * pending set is empty), marks each key complete, then finalizes relational
 * deletion leaf-first inside one transaction. Replay skips completed keys
 * and resumes partial failures; per-key hard-fail after the attempt ceiling
 * marks the row failed so the operation stays pending and visible (DLQ
 * recovery, REQ-022) — and a failed key blocks relational finalization just
 * like a pending one, so a later delivery can never orphan its blob.
 */
export class DeletionService {
  constructor(
    private readonly repository: DeletionRepository,
    private readonly bucket: R2Bucket | undefined,
  ) {}

  /** Returns true when the operation was processed (possibly partially). */
  async processOperation(operationId: string): Promise<ProcessedOutcome> {
    const operation = await this.repository.loadPendingOperation(operationId);
    if (!operation) {
      return 'no_op'; // unknown, completed, or failed: replay-safe no-op
    }

    // Drain pending keys batch by batch: operations with more than 1000
    // objects span several batches (BUG-2 regression). Each pass strictly
    // shrinks the pending set — completed and hard-failed rows leave it —
    // so the loop terminates.
    let batch = await this.repository.loadPendingObjects(operationId);
    let incomplete = false;
    while (batch.length > 0) {
      for (const object of batch) {
        const ok = await this.deleteOne(object);
        if (ok) {
          await this.repository.markObjectCompleted(object.id);
        } else {
          incomplete = true;
          await this.repository.markObjectFailed(
            object.id,
            'storage_failure',
            'R2 delete failed',
          );
        }
      }
      if (incomplete) {
        break; // remaining pending keys resume on the next delivery
      }
      batch = await this.repository.loadPendingObjects(operationId);
    }
    if (incomplete) {
      // Never run relational finalization while a key still needs deletion.
      // Surface outstanding (pending + hard-failed) keys for DLQ recovery
      // visibility (REQ-022); the operator runbook is scripts/deletion-recovery.sh.
      const outstanding = await this.repository.outstandingObjectCount(operationId);
      console.error('cleanup incomplete; relational finalization blocked', {
        operationId,
        outstandingKeys: outstanding,
      });
      return 'incomplete';
    }
    const finalized = await this.repository.finalizeRelationalDeletion(operation);
    if (finalized) {
      return 'completed';
    }
    // finalizeRelationalDeletion returns false for a lost finalize race
    // (another delivery completed the operation — ack this duplicate) or for
    // outstanding non-completed keys (hard-failed blob awaiting operator
    // recovery — keep the operation visible and retry until the DLQ).
    const stillPending = await this.repository.loadPendingOperation(operationId);
    return stillPending ? 'incomplete' : 'no_op';
  }

  private async deleteOne(object: DeletionObjectRow & { attempts: number }): Promise<boolean> {
    if (!this.bucket) {
      return false; // no binding in this environment: fail the key, replay retries
    }
    if (object.attempts >= MAX_ATTEMPTS_PER_KEY) {
      return false; // hard-failed: stays pending-failed for DLQ recovery
    }
    try {
      await this.bucket.delete(object.storageKey);
      return true;
    } catch {
      return false;
    }
  }
}

export type ProcessedOutcome = 'no_op' | 'completed' | 'incomplete';
