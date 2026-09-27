import { describe, expect, it } from 'vitest';

import {
  uploadWithConcurrency,
  validateUploadFile,
  validateUploadSelection,
} from '../src/hooks/use-upload-flow';

type UploadFile = Pick<File, 'name' | 'size' | 'type'>;

const makeFile = (overrides: Partial<UploadFile> = {}): UploadFile => ({
  name: 'page.jpg',
  size: 1_000,
  type: 'image/jpeg',
  ...overrides,
});

describe('validateUploadFile', () => {
  it.each([
    ['JPEG extension', makeFile({ name: 'page.jpg', type: 'application/octet-stream' })],
    ['PNG extension', makeFile({ name: 'page.PNG', type: 'application/octet-stream' })],
    ['uppercase HEIC extension', makeFile({ name: 'page.HEIC', type: 'application/octet-stream' })],
    ['JPEG MIME type', makeFile({ name: 'page.data', type: 'image/jpeg' })],
    ['PNG MIME type', makeFile({ name: 'page.data', type: 'image/png' })],
    ['HEIC MIME type', makeFile({ name: 'page.data', type: 'image/heic' })],
  ])('accepts %s', (_label, file) => {
    expect(validateUploadFile(file)).toBeNull();
  });

  it('rejects a file with both unsupported extension and MIME type', () => {
    expect(validateUploadFile(makeFile({ name: 'page.pdf', type: 'application/pdf' }))).toBe(
      'Not uploaded · JPEG, PNG, or HEIC required',
    );
  });

  it('accepts exactly 10,000,000 bytes but marks larger files over the limit', () => {
    expect(validateUploadFile(makeFile({ size: 10_000_000 }))).toBeNull();
    expect(validateUploadFile(makeFile({ size: 10_000_001 }))).toBe('Not uploaded · over limit');
  });
});

describe('validateUploadSelection', () => {
  it('accepts the twentieth page and rejects a selection with 20 occupied slots', () => {
    const file = makeFile();

    expect(validateUploadSelection(file, 19)).toBeNull();
    expect(validateUploadSelection(file, 20)).toBe('Not uploaded · 20-page limit reached');
  });
});

describe('uploadWithConcurrency', () => {
  it('preserves input order while allowing at most three active workers', async () => {
    const values = ['first', 'second', 'third', 'fourth', 'fifth'];
    const releases = new Map<number, () => void>();
    let active = 0;
    let maxActive = 0;

    const pending = uploadWithConcurrency(values, 3, (value, index) => {
      active += 1;
      maxActive = Math.max(maxActive, active);

      return new Promise<string>((resolve) => {
        releases.set(index, () => {
          active -= 1;
          resolve(`${value}:done`);
        });
      });
    });

    await Promise.resolve();
    expect(active).toBe(3);
    expect(maxActive).toBe(3);

    const finish = async (index: number) => {
      const release = releases.get(index);
      if (!release) throw new Error(`Worker ${index} did not start`);
      release();
      await Promise.resolve();
      await Promise.resolve();
    };

    await finish(2);
    await finish(0);
    await finish(1);
    await finish(3);
    await finish(4);

    await expect(pending).resolves.toEqual([
      { status: 'fulfilled', value: 'first:done' },
      { status: 'fulfilled', value: 'second:done' },
      { status: 'fulfilled', value: 'third:done' },
      { status: 'fulfilled', value: 'fourth:done' },
      { status: 'fulfilled', value: 'fifth:done' },
    ]);
    expect(maxActive).toBe(3);
  });

  it('settles one rejected worker without dropping later results', async () => {
    const settled = await uploadWithConcurrency(
      ['first', 'rejected', 'third', 'fourth'],
      2,
      async (value) => {
        if (value === 'rejected') throw new Error('upload failed');
        return `${value}:done`;
      },
    );

    expect(settled).toEqual([
      { status: 'fulfilled', value: 'first:done' },
      { status: 'rejected', reason: expect.any(Error) },
      { status: 'fulfilled', value: 'third:done' },
      { status: 'fulfilled', value: 'fourth:done' },
    ]);
    expect((settled[1] as PromiseRejectedResult).reason.message).toBe('upload failed');
  });
});
