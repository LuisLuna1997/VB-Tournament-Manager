import { describe, it, expect } from 'vitest';
import {
  buildScheduleRows,
  buildStandingRows,
  buildTsvClipboard,
  buildSheetPayload,
} from '../schedule-export';
import type { Tournament, Division, Team, Match } from '@/types/tournament';

// --- Fixture builders ---------------------------------------------------------

function makeDivision(id: string, name: string, opts: Partial<Division> = {}): Division {
  return {
    id, name, level: 'beginners', phase: 'round-robin',
    courtCount: 2, currentRound: 1, advancingTeamCount: 4, targetGames: null,
    ...opts,
  };
}

function makeTeam(id: string, name: string, divisionId: string): Team {
  return { id, name, color: '#000', manager: '', playerIds: [], divisionId, checkinStatus: 'wip', maxGames: null, evadeTeamIds: [] };
}

function makeMatch(id: string, divisionId: string, opts: Partial<Match> = {}): Match {
  return {
    id, roundNumber: 1, homeTeamId: null, awayTeamId: null,
    homeScore: null, awayScore: null, courtNumber: 1, status: 'scheduled',
    divisionId, isFinals: false, ...opts,
  };
}

function makeTournament(parts: {
  id?: string;
  name?: string;
  date?: string;
  divisions: Division[];
  teams: Team[];
  matches: Match[];
}): Tournament {
  const toRecord = <T extends { id: string }>(arr: T[]) => Object.fromEntries(arr.map(x => [x.id, x]));
  return {
    id: parts.id ?? 'tourn1',
    name: parts.name ?? 'Summer Open',
    date: parts.date ?? '2026-06-21',
    divisions: toRecord(parts.divisions),
    teams: toRecord(parts.teams),
    players: {},
    matches: toRecord(parts.matches),
  };
}

// A realistic single-division fixture covering every match status.
function makeStatusFixture() {
  const div = makeDivision('d1', 'Open', { courtCount: 2 });
  const a = makeTeam('a', 'Alpha', 'd1');
  const b = makeTeam('b', 'Bravo', 'd1');
  const c = makeTeam('c', 'Charlie', 'd1');
  const d = makeTeam('d', 'Delta', 'd1');

  const completed = makeMatch('m-done', 'd1', { homeTeamId: 'a', awayTeamId: 'b', homeScore: 25, awayScore: 20, courtNumber: 1, status: 'completed', roundNumber: 1 });
  const bye = makeMatch('m-bye', 'd1', { homeTeamId: 'c', awayTeamId: null, courtNumber: 0, status: 'bye', roundNumber: 1 });
  const live = makeMatch('m-live', 'd1', { homeTeamId: 'c', awayTeamId: 'd', homeScore: 10, awayScore: 8, courtNumber: 2, status: 'in-progress', roundNumber: 1 });
  const tbd = makeMatch('m-tbd', 'd1', { homeTeamId: 'a', awayTeamId: 'c', courtNumber: 1, status: 'scheduled', roundNumber: 2 });
  const nextUp = makeMatch('m-next', 'd1', { homeTeamId: 'b', awayTeamId: 'd', courtNumber: 2, status: 'scheduled', roundNumber: 2 });

  // Stage m-next as "up next" on court 2
  div.courtNextUp = { 2: 'm-next' };

  return makeTournament({
    divisions: [div],
    teams: [a, b, c, d],
    matches: [completed, bye, live, tbd, nextUp],
  });
}

// --- buildScheduleRows --------------------------------------------------------

describe('buildScheduleRows', () => {
  it('resolves team names and marks missing sides as BYE', () => {
    const rows = buildScheduleRows(makeStatusFixture());
    const done = rows.find(r => r.matchId === 'm-done')!;
    expect(done.home).toBe('Alpha');
    expect(done.away).toBe('Bravo');
    const bye = rows.find(r => r.matchId === 'm-bye')!;
    expect(bye.home).toBe('Charlie');
    expect(bye.away).toBe('BYE');
  });

  it('sorts matches by round number within a division', () => {
    const rows = buildScheduleRows(makeStatusFixture());
    const rounds = rows.map(r => r.round);
    expect(rounds).toEqual([...rounds].sort((x, y) => x - y));
  });

  it('passes through scores, court, and status unchanged', () => {
    const rows = buildScheduleRows(makeStatusFixture());
    const done = rows.find(r => r.matchId === 'm-done')!;
    expect(done.homeScore).toBe(25);
    expect(done.awayScore).toBe(20);
    expect(done.court).toBe(1);
    expect(done.status).toBe('completed');
  });

  it('does NOT sanitize names (sanitization is only for TSV / sheet payloads)', () => {
    const div = makeDivision('d1', '@Night');
    const evil = makeTeam('x', '=cmd()', 'd1');
    const ok = makeTeam('y', 'Normal', 'd1');
    const m = makeMatch('m1', 'd1', { homeTeamId: 'x', awayTeamId: 'y', status: 'completed', homeScore: 1, awayScore: 0 });
    const rows = buildScheduleRows(makeTournament({ divisions: [div], teams: [evil, ok], matches: [m] }));
    expect(rows[0].home).toBe('=cmd()');
    expect(rows[0].division).toBe('@Night');
  });
});

// --- buildStandingRows --------------------------------------------------------

describe('buildStandingRows', () => {
  it('produces rank-ordered rows per division from completed matches', () => {
    const div = makeDivision('d1', 'Open');
    const a = makeTeam('a', 'Alpha', 'd1');
    const b = makeTeam('b', 'Bravo', 'd1');
    const m = makeMatch('m1', 'd1', { homeTeamId: 'a', awayTeamId: 'b', homeScore: 25, awayScore: 10, status: 'completed' });
    const rows = buildStandingRows(makeTournament({ divisions: [div], teams: [a, b], matches: [m] }));
    expect(rows).toHaveLength(2);
    expect(rows[0].rank).toBe(1);
    expect(rows[0].team).toBe('Alpha'); // winner ranks first
    expect(rows[0].wins).toBe(1);
    expect(rows[0].diff).toBe(15);
    expect(rows[1].team).toBe('Bravo');
    expect(rows[1].losses).toBe(1);
  });
});

// --- buildTsvClipboard --------------------------------------------------------

describe('buildTsvClipboard', () => {
  it('groups by division with a header row and skips byes', () => {
    const tsv = buildTsvClipboard(makeStatusFixture());
    expect(tsv).toContain('Division: Open');
    expect(tsv).toContain(['Court', 'Team Home', 'Team Away', 'Score', 'Status'].join('\t'));
    // The bye team appears in no playable row
    expect(tsv).not.toContain('BYE');
  });

  it('maps each status to its display label', () => {
    const tsv = buildTsvClipboard(makeStatusFixture());
    expect(tsv).toContain('NOW PLAYING'); // in-progress
    expect(tsv).toContain('DONE');        // completed
    expect(tsv).toContain('25 - 20');     // completed score formatting
    expect(tsv).toContain('Up Next');     // staged via courtNextUp
    expect(tsv).toContain('TBD');         // scheduled, not staged
  });

  it('uses n/a as the court for TBD matches and the staged court for Up Next', () => {
    const tsv = buildTsvClipboard(makeStatusFixture());
    const lines = tsv.split('\n');
    const tbdLine = lines.find(l => l.includes('TBD'))!;
    expect(tbdLine.startsWith('n/a\t')).toBe(true);
    const nextLine = lines.find(l => l.includes('Up Next'))!;
    expect(nextLine.startsWith('2\t')).toBe(true); // staged on court 2
  });

  it('sanitizes formula-prefixed and whitespace-laden names', () => {
    const div = makeDivision('d1', '@Night');
    const evil = makeTeam('x', '=cmd()', 'd1');
    const tabbed = makeTeam('y', 'Multi\tWord', 'd1');
    const m = makeMatch('m1', 'd1', { homeTeamId: 'x', awayTeamId: 'y', status: 'completed', homeScore: 1, awayScore: 0 });
    const tsv = buildTsvClipboard(makeTournament({ divisions: [div], teams: [evil, tabbed], matches: [m] }));
    expect(tsv).toContain("Division: '@Night"); // leading @ neutralized
    expect(tsv).toContain("'=cmd()");            // leading = neutralized
    expect(tsv).toContain('Multi Word');         // tab collapsed to space
  });
});

// --- buildSheetPayload --------------------------------------------------------

describe('buildSheetPayload', () => {
  it('carries tournament name and date', () => {
    const payload = buildSheetPayload(makeStatusFixture());
    expect(payload.tournamentName).toBe('Summer Open');
    expect(payload.date).toBe('2026-06-21');
    expect(payload.schedule.length).toBeGreaterThan(0);
    expect(payload.standings.length).toBeGreaterThan(0);
  });

  it('sanitizes names across tournament, schedule, and standings', () => {
    const div = makeDivision('d1', '@Night');
    const evil = makeTeam('x', '=cmd()', 'd1');
    const ok = makeTeam('y', '+Plus', 'd1');
    const m = makeMatch('m1', 'd1', { homeTeamId: 'x', awayTeamId: 'y', status: 'completed', homeScore: 25, awayScore: 5 });
    const payload = buildSheetPayload(makeTournament({
      name: '=Evil Cup', divisions: [div], teams: [evil, ok], matches: [m],
    }));
    expect(payload.tournamentName).toBe("'=Evil Cup");
    expect(payload.schedule[0].division).toBe("'@Night");
    expect(payload.schedule[0].home).toBe("'=cmd()");
    expect(payload.schedule[0].away).toBe("'+Plus");
    expect(payload.standings.every(s => !/^[=+@]/.test(s.team))).toBe(true);
    expect(payload.standings.every(s => !/^[=+@]/.test(s.division))).toBe(true);
  });
});
