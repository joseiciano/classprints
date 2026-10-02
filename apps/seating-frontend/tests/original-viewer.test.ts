import { describe, expect, it } from 'vitest';
import {
  rotateNormalizedRect,
  type NormalizedRect,
} from '../src/components/assignment-reader/workspace/original-viewer';

const closeRect = (a: NormalizedRect, b: NormalizedRect) => {
  expect(a.x).toBeCloseTo(b.x, 10);
  expect(a.y).toBeCloseTo(b.y, 10);
  expect(a.width).toBeCloseTo(b.width, 10);
  expect(a.height).toBeCloseTo(b.height, 10);
};

describe('rotateNormalizedRect', () => {
  it('leaves a rect unchanged at rotation 0', () => {
    const rect: NormalizedRect = { x: 0.2, y: 0.3, width: 0.1, height: 0.15 };
    closeRect(rotateNormalizedRect(rect, 0), rect);
  });

  it('reflects both axes at rotation 180', () => {
    const rect: NormalizedRect = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 };
    closeRect(rotateNormalizedRect(rect, 180), { x: 0.6, y: 0.7, width: 0.3, height: 0.1 });
  });

  it('maps a top-left corner region through a 90° rotation to the original top-right', () => {
    // A small square pinned to the rotated view's top-left corner should
    // land at the original image's top-right corner once rotated back.
    const rect: NormalizedRect = { x: 0, y: 0, width: 0.1, height: 0.1 };
    closeRect(rotateNormalizedRect(rect, 90), { x: 0, y: 0.9, width: 0.1, height: 0.1 });
  });

  it('maps the same corner region through a 270° rotation to the original bottom-left', () => {
    const rect: NormalizedRect = { x: 0, y: 0, width: 0.1, height: 0.1 };
    closeRect(rotateNormalizedRect(rect, 270), { x: 0.9, y: 0, width: 0.1, height: 0.1 });
  });

  it('round-trips through 90 then 270 back to the original rect', () => {
    const rect: NormalizedRect = { x: 0.15, y: 0.4, width: 0.2, height: 0.05 };
    const rotated = rotateNormalizedRect(rect, 90);
    const restored = rotateNormalizedRect(rotated, 270);
    closeRect(restored, rect);
  });

  it('round-trips through 180 twice back to the original rect', () => {
    const rect: NormalizedRect = { x: 0.05, y: 0.6, width: 0.25, height: 0.3 };
    const restored = rotateNormalizedRect(rotateNormalizedRect(rect, 180), 180);
    closeRect(restored, rect);
  });
});
