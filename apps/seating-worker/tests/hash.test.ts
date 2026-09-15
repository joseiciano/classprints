import { describe, expect, it } from 'vitest';
import { generateArrangementHash } from '../src/deduplication/hash';

const arrangement = [
  ['Alice', null],
  [null, 'Bob'],
];

describe('generateArrangementHash', () => {
  it('produces same hash for identical arrangements', async () => {
    const hashA = await generateArrangementHash(arrangement);
    const hashB = await generateArrangementHash(arrangement);
    expect(hashA).toBe(hashB);
  });

  it('produces different hash for different positions', async () => {
    const hashA = await generateArrangementHash(arrangement);
    const hashB = await generateArrangementHash([
      [null, 'Alice'],
      ['Bob', null],
    ]);
    expect(hashA).not.toBe(hashB);
  });
});
