export const TEAM_COLORS = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Lime', hex: '#84CC16' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Sky', hex: '#0EA5E9' },
] as const;

// Map common color names (from spreadsheet) to hex values
const COLOR_NAME_MAP: Record<string, string> = {
  red: '#EF4444',
  blue: '#3B82F6',
  green: '#22C55E',
  yellow: '#EAB308',
  purple: '#A855F7',
  orange: '#F97316',
  pink: '#EC4899',
  teal: '#14B8A6',
  lime: '#84CC16',
  'lime green': '#84CC16',
  cyan: '#06B6D4',
  rose: '#F43F5E',
  indigo: '#6366F1',
  amber: '#F59E0B',
  emerald: '#10B981',
  violet: '#8B5CF6',
  sky: '#0EA5E9',
  'hot pink': '#EC4899',
  'light blue': '#0EA5E9',
  'light pink': '#F9A8D4',
  'dark green': '#166534',
  'dark blue': '#1E40AF',
  gold: '#EAB308',
  silver: '#9CA3AF',
  black: '#374151',
  white: '#F3F4F6',
  maroon: '#991B1B',
  navy: '#1E3A5F',
  coral: '#F87171',
  magenta: '#D946EF',
};

export function resolveColorName(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  // If it's already a hex color, return it (uppercased so color comparisons
  // against TEAM_COLORS are case-insensitive)
  if (lower.startsWith('#') && (lower.length === 4 || lower.length === 7)) return lower.toUpperCase();
  return COLOR_NAME_MAP[lower] ?? null;
}

export function getContrastColor(hex: string): string {
  // Expand 3-char hex to 6-char: #F00 -> #FF0000
  let h = hex;
  if (h.length === 4) {
    h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
