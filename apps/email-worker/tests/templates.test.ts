import { describe, expect, it } from 'vitest';
import { baseLayout } from '../src/email/templates';

describe('baseLayout', () => {
  it('wraps content in styled container', () => {
    const html = baseLayout('<p>Hello</p>');
    expect(html).toContain('<div');
    expect(html).toContain('Hello');
  });
});
