import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../components/ImportDialog';

// Build an .xlsx ArrayBuffer from a 2D array of cells, matching the real sheet
// layout: each "Player N" header is followed by two empty-header columns
// (status, link).
function toArrayBuffer(aoa: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Teams');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const HEADER = [
  'Team manager:', 'Division', 'Team Name', 'Color',
  'Player 1 (captain)', '', '', 'Player 2', '', '', 'Player 3', '', '',
];

describe('parseSpreadsheet — player status + link parsing', () => {
  it('keeps the CAPTAIN\'s status and link (regression: empty-header column key)', () => {
    // The status column right after "Player 1 (captain)" gets an empty-string key
    // from SheetJS. The old `if (statusKey && ...)` guard treated it as falsy and
    // dropped the captain's status + link.
    const ab = toArrayBuffer([
      HEADER,
      ['Chelsea', 'Intermediate', 'Free Agents', '', 'Eric Oh', 'IN', 'A', 'Ryan Oh', 'IN', 'A', 'Nathan Luo', 'IN', 'A'],
    ]);
    const { rows } = parseSpreadsheet(ab);
    expect(rows).toHaveLength(1);
    const players = rows[0].players;
    expect(players.map(p => p.name)).toEqual(['Eric Oh', 'Ryan Oh', 'Nathan Luo']);
    // Every player — including the captain — keeps IN + link A.
    for (const p of players) {
      expect(p.status).toBe('in');
      expect(p.linkGroup).toBe('A');
    }
  });

  it('detects a free-agent pool row by team name', () => {
    const ab = toArrayBuffer([
      HEADER,
      ['', 'Advanced', '(Free agents)', '', 'Khoi Truong', 'IN', 'B', 'Sharmad', 'IN', 'B', 'Liam', 'IN', 'B'],
    ]);
    const { rows } = parseSpreadsheet(ab);
    expect(rows[0].isFreeAgentPool).toBe(true);
    expect(rows[0].players[0]).toMatchObject({ name: 'Khoi Truong', status: 'in', linkGroup: 'B' });
  });

  it('still parses a normal team row (captain link preserved)', () => {
    const ab = toArrayBuffer([
      HEADER,
      ['Connie', 'Advanced', 'ATL Fly Girls', 'Red', 'Alishba', 'IN', 'C', 'Aliza', 'OUT', '', 'Inaya', 'LATE', ''],
    ]);
    const { rows } = parseSpreadsheet(ab);
    const p = rows[0].players;
    expect(p[0]).toMatchObject({ name: 'Alishba', status: 'in', linkGroup: 'C' });
    expect(p[1]).toMatchObject({ name: 'Aliza', status: 'out', linkGroup: null });
    expect(p[2]).toMatchObject({ name: 'Inaya', status: 'late', linkGroup: null });
  });
});
