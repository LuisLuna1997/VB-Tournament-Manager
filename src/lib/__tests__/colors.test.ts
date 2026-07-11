import { describe, it, expect } from 'vitest';
import { resolveColorName, getContrastColor } from '../colors';

describe('resolveColorName', () => {
  it('resolves known color names to hex', () => {
    expect(resolveColorName('red')).toBe('#EF4444');
    expect(resolveColorName('blue')).toBe('#3B82F6');
    expect(resolveColorName('green')).toBe('#22C55E');
    expect(resolveColorName('yellow')).toBe('#EAB308');
  });

  it('is case insensitive', () => {
    expect(resolveColorName('Red')).toBe('#EF4444');
    expect(resolveColorName('RED')).toBe('#EF4444');
    expect(resolveColorName('rEd')).toBe('#EF4444');
  });

  it('handles multi-word color names', () => {
    expect(resolveColorName('hot pink')).toBe('#EC4899');
    expect(resolveColorName('lime green')).toBe('#84CC16');
    expect(resolveColorName('light blue')).toBe('#0EA5E9');
    expect(resolveColorName('dark green')).toBe('#166534');
  });

  it('returns hex strings normalized to uppercase', () => {
    expect(resolveColorName('#FF0000')).toBe('#FF0000');
    expect(resolveColorName('#ff0000')).toBe('#FF0000');
    expect(resolveColorName('#f00')).toBe('#F00');
  });

  it('returns null for empty string', () => {
    expect(resolveColorName('')).toBeNull();
  });

  it('returns null for unknown color names', () => {
    expect(resolveColorName('rainbow')).toBeNull();
    expect(resolveColorName('chartreuse')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(resolveColorName(' red ')).toBe('#EF4444');
  });

  it('returns null for invalid hex lengths', () => {
    expect(resolveColorName('#FF')).toBeNull();
    expect(resolveColorName('#FFFFFFF0')).toBeNull();
  });
});

describe('getContrastColor', () => {
  it('returns black for white background', () => {
    expect(getContrastColor('#FFFFFF')).toBe('#000000');
  });

  it('returns white for black background', () => {
    expect(getContrastColor('#000000')).toBe('#FFFFFF');
  });

  it('returns black for bright yellow', () => {
    expect(getContrastColor('#EAB308')).toBe('#000000');
  });

  it('returns white for dark blue', () => {
    expect(getContrastColor('#1E40AF')).toBe('#FFFFFF');
  });

  it('returns black for light green', () => {
    expect(getContrastColor('#22C55E')).toBe('#000000');
  });

  it('returns white for dark red', () => {
    expect(getContrastColor('#991B1B')).toBe('#FFFFFF');
  });
});
