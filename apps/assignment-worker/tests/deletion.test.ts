import { describe, expect, it, vi } from 'vitest';
import {
  DeletionRepository,
  MAX_ATTEMPTS_PER_KEY,
} from '../src/db/deletion.repository';
import { DeletionService } from '../src/deletion/deletion.service';
import {
  classifyQueueMessage,
  parseTranscriptionConfig,
} from '../src/queue-messages';

const UUID_OP = 'aaaaaaaa-0000-4000-8000-000000000001';
const UUID_TARGET = 'cccccccc-0000-4000-8000-000000000001';
const UUID_OBJ = 'bbbbbbbb-0000-4000-8000-000000000001';
const KEY = 'teacher/t1/class/c/assignment/a/materials/page.jpg';

type FakeRow = {
  id: string;
  target_type: string;
  status: string;
};

const repositoryOver = (overrides: {
  operation?: (FakeRow & { target_id?: string }) | null;
  objects?: Array<{ id: string; storageKey: string; status: string; attempts: number }> | null;
  finalized?: boolean;
}) => {
  const repo = Object.create(DeletionRepository.prototype) as DeletionRepository;
  repo.loadPendingOperation = vi.fn().mockResolvedValue(
    overrides.operation === undefined
      ? {
          id: UUID_OP,
          targetType: 'page',
          targetId: UUID_TARGET,
          status: 'pending',
        }
      : overrides.operation,
  );
  // The service drains pending keys until the repository returns an empty
  // batch, so the default must yield its objects once and then drain — a
  // plain mockResolvedValue would loop forever (OOM).
  repo.loadPendingObjects = vi
    .fn()
    .mockResolvedValueOnce(
      overrides.objects === undefined
        ? [{ id: UUID_OBJ, storageKey: KEY, status: 'pending', attempts: 0 }]
        : (overrides.objects ?? []),
    )
    .mockResolvedValue([]);
  repo.markObjectCompleted = vi.fn().mockResolvedValue(undefined);
  repo.markObjectFailed = vi.fn().mockResolvedValue(undefined);
  repo.finalizeRelationalDeletion = vi.fn().mockResolvedValue(overrides.finalized ?? true);
  repo.outstandingObjectCount = vi.fn().mockResolvedValue(0);
  return repo;
};

const bucketOver = (failFirst: boolean) => {
  let calls = 0;
  return {
    delete: vi.fn(async (_key: string) => {
      calls += 1;
      if (failFirst && calls === 1) {
        throw new Error('r2 unavailable');
      }
      return;
    }),
    calls: () => calls,
  };
};

describe('TASK-006 cleanup consumer', () => {
  it('deletes pending keys, marks complete, and finalizes relational deletion', async () => {
    const repo = repositoryOver({});
    const bucket = bucketOver(false);
    const service = new DeletionService(repo, bucket as never);
    const outcome = await service.processOperation(UUID_OP);
    expect(outcome).toBe('completed');
    expect(bucket.delete).toHaveBeenCalledWith(KEY);
    expect(repo.markObjectCompleted).toHaveBeenCalledWith(UUID_OBJ);
    // The finalize call must carry the full operation (type + target id), not
    // just the operation id: relational deletion is type-dispatched.
    expect(repo.finalizeRelationalDeletion).toHaveBeenCalledWith({
      id: UUID_OP,
      targetType: 'page',
      targetId: UUID_TARGET,
      status: 'pending',
    });
  });

  it('completes as no-op when the operation is unknown or already finalized', async () => {
    const repo = repositoryOver({ operation: null });
    const bucket = bucketOver(false);
    const service = new DeletionService(repo, bucket as never);
    const outcome = await service.processOperation(UUID_OP);
    expect(outcome).toBe('no_op');
    expect(bucket.delete).not.toHaveBeenCalled();
    expect(repo.finalizeRelationalDeletion).not.toHaveBeenCalled();
  });

  it('injects a mid-batch failure, stays incomplete, and resumes skipping the completed key', async () => {
    const repo = repositoryOver({
      objects: [
        { id: 'obj-1', storageKey: 'k/1.jpg', status: 'pending', attempts: 0 },
        { id: 'obj-2', storageKey: 'k/2.jpg', status: 'pending', attempts: 0 },
      ],
    });
    // First delete fails, subsequent succeed: replay completes both keys.
    const bucket = bucketOver(true);
    const service = new DeletionService(repo, bucket as never);
    // First pass: obj-1 fails, obj-2 completes; finalize refused (pending remains).
    repo.finalizeRelationalDeletion = vi.fn().mockResolvedValue(false);
    const first = await service.processOperation(UUID_OP);
    expect(first).toBe('incomplete');
    expect(repo.markObjectFailed).toHaveBeenCalledWith('obj-1', 'storage_failure', 'R2 delete failed');
    expect(repo.markObjectCompleted).toHaveBeenCalledWith('obj-2');
    // Replay: obj-1 still pending, deletes now succeed.
    repo.loadPendingObjects = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'obj-1', storageKey: 'k/1.jpg', status: 'pending', attempts: 1 }])
      .mockResolvedValue([]);
    repo.finalizeRelationalDeletion = vi.fn().mockResolvedValue(true);
    const second = await service.processOperation(UUID_OP);
    expect(second).toBe('completed');
    expect(repo.markObjectCompleted).toHaveBeenCalledWith('obj-1');
  });

  it('maps a lost finalize race to a replay-safe no-op', async () => {
    // All keys deleted, but another redelivery finalized first: finalize
    // returns false and the operation is no longer pending. The duplicate
    // message must ack rather than retry forever.
    const repo = repositoryOver({ finalized: false });
    repo.loadPendingOperation = vi
      .fn()
      .mockResolvedValueOnce({
        id: UUID_OP,
        targetType: 'page',
        targetId: UUID_TARGET,
        status: 'pending',
      })
      .mockResolvedValueOnce(null); // post-finalize check: already completed
    const bucket = bucketOver(false);
    const service = new DeletionService(repo, bucket as never);
    const outcome = await service.processOperation(UUID_OP);
    expect(outcome).toBe('no_op');
  });

  it('keeps retrying when finalize is blocked by outstanding keys (BUG-1 regression)', async () => {
    // Every key row is already hard-failed (not pending), so the delete loop
    // runs on an empty batch and finalize's completion gate must refuse:
    // the blob stays in R2 and the operation stays pending/visible.
    const repo = repositoryOver({ finalized: false });
    repo.loadPendingObjects = vi.fn().mockResolvedValue([]); // nothing deletable
    repo.loadPendingOperation = vi
      .fn()
      .mockResolvedValueOnce({
        id: UUID_OP,
        targetType: 'page',
        targetId: UUID_TARGET,
        status: 'pending',
      })
      .mockResolvedValueOnce({
        id: UUID_OP,
        targetType: 'page',
        targetId: UUID_TARGET,
        status: 'pending',
      }); // post-finalize check: still pending -> incomplete
    repo.outstandingObjectCount = vi.fn().mockResolvedValue(1);
    const bucket = bucketOver(false);
    const service = new DeletionService(repo, bucket as never);
    const outcome = await service.processOperation(UUID_OP);
    expect(outcome).toBe('incomplete');
    expect(bucket.delete).not.toHaveBeenCalled();
    expect(repo.finalizeRelationalDeletion).toHaveBeenCalledTimes(1);
  });

  it('drains multiple batches when an operation has more than 1000 keys (BUG-2 regression)', async () => {
    // 1001 keys across two repository batches: the service must keep
    // loading until the pending set is empty instead of finalizing early.
    const batch = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `obj-${i}`,
        storageKey: `k/${i}.jpg`,
        status: 'pending',
        attempts: 0,
      }));
    const repo = repositoryOver({});
    repo.loadPendingObjects = vi
      .fn()
      .mockResolvedValueOnce(batch(1000))
      .mockResolvedValueOnce(batch(1))
      .mockResolvedValueOnce([]); // drained
    const bucket = bucketOver(false);
    const service = new DeletionService(repo, bucket as never);
    const outcome = await service.processOperation(UUID_OP);
    expect(outcome).toBe('completed');
    expect(repo.finalizeRelationalDeletion).toHaveBeenCalledTimes(1);
    expect(bucket.delete).toHaveBeenCalledTimes(1001);
  });

  it('hard-fails a key after the attempt ceiling and leaves the operation pending', async () => {
    const repo = repositoryOver({
      objects: [
        { id: 'obj-9', storageKey: 'k/9.jpg', status: 'pending', attempts: MAX_ATTEMPTS_PER_KEY },
      ],
    });
    const bucket = bucketOver(false);
    const service = new DeletionService(repo, bucket as never);
    const outcome = await service.processOperation(UUID_OP);
    expect(outcome).toBe('incomplete');
    // Attempt ceiling exceeded: no delete call, no completion mark.
    expect(bucket.delete).not.toHaveBeenCalled();
    expect(repo.markObjectCompleted).not.toHaveBeenCalled();
    expect(repo.markObjectFailed).toHaveBeenCalledWith('obj-9', 'storage_failure', 'R2 delete failed');
    expect(repo.finalizeRelationalDeletion).not.toHaveBeenCalled();
  });

  it('survives a missing R2 binding by failing keys instead of throwing', async () => {
    const repo = repositoryOver({});
    const service = new DeletionService(repo, undefined);
    const outcome = await service.processOperation(UUID_OP);
    expect(outcome).toBe('incomplete');
    expect(repo.markObjectFailed).toHaveBeenCalled();
    expect(repo.finalizeRelationalDeletion).not.toHaveBeenCalled();
  });
});

describe('TASK-006 relational finalize dispatch', () => {
  it('issues leaf-first scope deletes per target type inside one transaction', async () => {
    // Fake a postgres.js transaction: begin(cb) replays the tagged templates
    const statements: string[] = [];
    const capture = (template: ArrayLike<string>): string =>
      Array.from(template as string[]).join('?');
    const fakeTx = (template: ArrayLike<string>) => {
      const text = capture(template);
      statements.push(text);
      // Only the lock select returns a row; every delete affects none.
      return Promise.resolve(text.includes('for update') ? [{ id: UUID_OP }] : []);
    };
    const sql = {
      begin: (cb: (tx: unknown) => Promise<boolean>) => cb(fakeTx),
    } as never;
    const repo = new DeletionRepository(sql);

    await repo.finalizeRelationalDeletion({
      id: UUID_OP,
      targetType: 'class',
      targetId: UUID_TARGET,
      status: 'pending',
    });

    const text = statements.join('\n');
    // Class scope must delete descendants before the class row itself.
    const pagesPos = text.indexOf('delete from public.pages');
    const submissionsPos = text.indexOf('delete from public.submissions');
    const materialsPos = text.indexOf('delete from public.assignment_material_versions');
    const assignmentsPos = text.indexOf('delete from public.assignments');
    const studentsPos = text.indexOf('delete from public.students');
    const classesPos = text.indexOf('delete from public.classes');
    expect(pagesPos).toBeGreaterThan(-1);
    expect(classesPos).toBeGreaterThan(pagesPos);
    expect(classesPos).toBeGreaterThan(submissionsPos);
    expect(classesPos).toBeGreaterThan(materialsPos);
    expect(classesPos).toBeGreaterThan(assignmentsPos);
    expect(classesPos).toBeGreaterThan(studentsPos);
  });

  it('refuses to finalize when the pending row cannot be locked', async () => {
    const fakeTx = (template: ArrayLike<string>) => {
      const text = Array.from(template as string[]).join('?');
      // The lock select returns no row; the final update is never reached in
      // this scenario because the repository returns early.
      return Promise.resolve(text.includes('for update') ? [] : []);
    };
    const sql = {
      begin: (cb: (tx: unknown) => Promise<boolean>) => cb(fakeTx),
    } as never;
    const repo = new DeletionRepository(sql);
    const finalized = await repo.finalizeRelationalDeletion({
      id: UUID_OP,
      targetType: 'page',
      targetId: UUID_TARGET,
      status: 'pending',
    });
    expect(finalized).toBe(false);
  });
});

describe('TASK-006 queue routing', () => {
  it('classifies transcription, deletion, and DLQ envelopes', () => {
    expect(
      classifyQueueMessage({
        kind: 'transcription_page',
        pageId: 'a0000000-0000-4000-8000-000000000001',
        transcriptionRevision: 1,
        documentType: 'materials',
        attemptCount: 0,
        queuedAtMs: 1,
        isRetry: false,
      }),
    ).toEqual({ kind: 'transcription' });
    expect(
      classifyQueueMessage({ kind: 'deletion_operation', operationId: UUID_OP, targetType: 'page' }),
    ).toEqual({ kind: 'deletion' });
    expect(classifyQueueMessage({ kind: 'unrelated' })).toBeNull();
  });
});

describe('TASK-006 model configuration (REQ-024, ASSUMPTION-003)', () => {
  it('rejects deployment without a primary model and parses fallback CSV', () => {
    expect(parseTranscriptionConfig(undefined, 'x')).toBeNull();
    expect(parseTranscriptionConfig('', 'x')).toBeNull();
    // Unresolved wrangler-var placeholders must fail the same way (ASSUMPTION-003).
    expect(parseTranscriptionConfig('<TRANSCRIPTION_MODEL_PRODUCTION>', 'x')).toBeNull();
    expect(parseTranscriptionConfig('z/glm-5.3-flash', '<TRANSCRIPTION_FALLBACK_MODELS_PRODUCTION>'))
      .toEqual({ primaryModel: 'z/glm-5.3-flash', fallbackModels: [] });
    expect(parseTranscriptionConfig('z/glm-5.3-flash', 'a/b, c/d ,')).toEqual({
      primaryModel: 'z/glm-5.3-flash',
      fallbackModels: ['a/b', 'c/d'],
    });
  });
});
