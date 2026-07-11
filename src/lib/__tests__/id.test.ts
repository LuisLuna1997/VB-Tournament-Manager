import { describe, it, expect } from 'vitest';
import { generateId } from '../id';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(generateId()).toBeTruthy();
    expect(typeof generateId()).toBe('string');
  });

  it('has three parts separated by hyphens', () => {
    const id = generateId();
    const parts = id.split('-');
    expect(parts.length).toBe(3);
    parts.forEach(p => expect(p.length).toBeGreaterThan(0));
  });

  it('generates 100 unique IDs in rapid succession', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
