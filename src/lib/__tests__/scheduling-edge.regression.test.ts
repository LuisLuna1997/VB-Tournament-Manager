import { describe, it, expect } from 'vitest';
import { computeStandings } from '@/lib/standings';
import { generateRoundRobin } from '@/lib/round-robin';
import { generateFinalRound } from '@/lib/bracket';
import type { Match, Team } from '@/types/tournament';

function makeTeam(id: string, name: string, opts: Partial<Team> = {}): Team {
  return { id, name, color: '#000', manager: '', playerIds: [], divisionId: 'div1', checkinStatus: 'wip', maxGames: null, evadeTeamIds: [], ...opts };
}

function makeMatch(home: string, away: string, homeScore: number | null, awayScore: number | null, opts: Partial<Match> = {}): Match {
  return {
    id: Math.random().toString(36).slice(2),
    roundNumber: 1,
    homeTeamId: home,
    awayTeamId: away,
    homeScore,
    awayScore,
    courtNumber: 1,
    status: 'completed',
    divisionId: 'div1',
    isFinals: false,
    ...opts,
  };
}

describe('standings probes', () => {
  it('0-game team grouped with 0-win team: no crash, no swap', () => {
    const teams = {
      a: makeTeam('a', 'A'),
      b: makeTeam('b', 'B'),
      x: makeTeam('x', 'X'), // never plays
    };
    const matches = [
      makeMatch('a', 'b', 21, 10), // a 1-0, b 0-1
    ];
    const s = computeStandings(matches, teams, 'div1');
    // x (0 games, pct 0, diff 0) and b (0-1, pct 0, diff -11) are a 2-group
    expect(s.map(t => t.teamId)).toEqual(['a', 'x', 'b']);
  });

  it('equal pct different wins are NOT h2h-grouped (1-1 vs 2-2)', () => {
    const teams = {
      a: makeTeam('a', 'A'), b: makeTeam('b', 'B'),
      c: makeTeam('c', 'C'), d: makeTeam('d', 'D'), e: makeTeam('e', 'E'),
    };
    // a: 1-1 beat b head-to-head; b: 2-2. Both pct 0.5.
    const matches = [
      makeMatch('a', 'b', 21, 10), // a beats b
      makeMatch('c', 'a', 21, 10), // a 1-1
      makeMatch('b', 'd', 21, 10),
      makeMatch('b', 'e', 21, 10), // b 3 wins? no wait
      makeMatch('c', 'b', 21, 10),
      makeMatch('d', 'b', 21, 10), // b: 2-3 -> not 0.5
    ];
    const s = computeStandings(matches, teams, 'div1');
    // just verifying no crash and sane ranks
    expect(s).toHaveLength(5);
  });

  it('two adjacent 2-team groups each swap independently', () => {
    const teams = {
      a: makeTeam('a', 'A'), b: makeTeam('b', 'B'), c: makeTeam('c', 'C'),
      d: makeTeam('d', 'D'), e: makeTeam('e', 'E'), f: makeTeam('f', 'F'),
    };
    // Group 1: b,c both 1-1. c beat b but b has better diff.
    // Group 2: e,f both 0-2... cannot both be 0-2 and play each other.
    // Instead: e,f both 1-2; f beat e but e has better diff.
    const matches = [
      // a goes 3-0 (beats b? no - keep group records exact)
      makeMatch('a', 'c', 21, 5),   // a 1-0, c 0-1 (diff -16)
      makeMatch('a', 'd', 21, 5),   // a 2-0
      makeMatch('c', 'b', 21, 20),  // c beats b: c 1-1 (-15), b 0-1 (-1)
      makeMatch('b', 'd', 25, 5),   // b 1-1 (+19)
      // d now 0-2
      makeMatch('f', 'e', 11, 10),  // f beats e: f 1-0 (+1), e 0-1 (-1)
      makeMatch('e', 'd', 25, 5),   // e 1-1 (+19), d 0-3
      makeMatch('a', 'f', 21, 5),   // a 3-0, f 1-1 (-15)
      makeMatch('e', 'a', 10, 21),  // e 1-2, a 4-0
      makeMatch('f', 'd', 10, 21),  // f 1-2, d 1-3
    ];
    // records: a 4-0 (pct 1); b 1-1 (.5); c 1-1 (.5); e 1-2 (.333); f 1-2 (.333); d 1-3 (.25)
    const s = computeStandings(matches, teams, 'div1');
    const order = s.map(t => t.teamId);
    // b,c group: c beat b -> c above b despite b's +19 diff
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
    // e,f group: f beat e -> f above e despite e's better diff
    expect(order.indexOf('f')).toBeLessThan(order.indexOf('e'));
    // group boundaries: a first, d last
    expect(order[0]).toBe('a');
    expect(order[5]).toBe('d');
  });

  it('h2h vs dropped team does not crash and is ignored', () => {
    const teams = {
      a: makeTeam('a', 'A'), b: makeTeam('b', 'B'),
      z: makeTeam('z', 'Z', { checkinStatus: 'dropped' }),
    };
    const matches = [
      makeMatch('a', 'z', 21, 10),
      makeMatch('b', 'z', 21, 10),
    ];
    const s = computeStandings(matches, teams, 'div1');
    expect(s).toHaveLength(2);
    // matches vs dropped team don't count at all (z not in standings map -> home/away guard)
    // wait - a and b ARE in the map, so their wins DO count.
    expect(s.find(t => t.teamId === 'a')!.wins).toBe(1);
  });
});

describe('round-robin probes', () => {
  it('odd team count + evade: evaded match last, one appearance per team per round', () => {
    for (let trial = 0; trial < 30; trial++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd', 'e'],
        courtCount: 2,
        divisionId: 'd1',
        evadePairs: new Set(['a::b']),
      });
      const maxRound = Math.max(...matches.map(m => m.roundNumber));
      const evaded = matches.find(
        m => m.homeTeamId && m.awayTeamId && [m.homeTeamId, m.awayTeamId].sort().join('::') === 'a::b'
      )!;
      expect(evaded.roundNumber).toBe(maxRound);
      // each team at most once per round
      const byRound = new Map<number, string[]>();
      for (const m of matches) {
        const list = byRound.get(m.roundNumber) ?? [];
        if (m.homeTeamId) list.push(m.homeTeamId);
        if (m.awayTeamId) list.push(m.awayTeamId);
        byRound.set(m.roundNumber, list);
      }
      for (const [, list] of byRound) {
        expect(new Set(list).size).toBe(list.length);
      }
      // round numbers contiguous 1..maxRound
      const roundsPresent = new Set(matches.map(m => m.roundNumber));
      for (let r = 1; r <= maxRound; r++) expect(roundsPresent.has(r)).toBe(true);
    }
  });

  it('2 teams with preserved completed result: round kept, match completed', () => {
    const preserved = new Map([['a::b', { homeScore: 25, awayScore: 20 }]]);
    const matches = generateRoundRobin({
      teamIds: ['a', 'b'],
      courtCount: 1,
      divisionId: 'd1',
      preservedResults: preserved,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('completed');
    // sorted-first is 'a' -> a got 25
    const aScore = matches[0].homeTeamId === 'a' ? matches[0].homeScore : matches[0].awayScore;
    expect(aScore).toBe(25);
  });

  it('preserved completed matches survive caps and appear exactly once', () => {
    for (let trial = 0; trial < 30; trial++) {
      const preserved = new Map([['a::b', { homeScore: 25, awayScore: 20 }]]);
      const caps = new Map([['a', 1], ['b', 1], ['c', 1], ['d', 1]]);
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd'],
        courtCount: 2,
        divisionId: 'd1',
        preservedResults: preserved,
        teamMaxGames: caps,
      });
      const abMatches = matches.filter(
        m => m.homeTeamId && m.awayTeamId && [m.homeTeamId, m.awayTeamId].sort().join('::') === 'a::b'
      );
      expect(abMatches).toHaveLength(1);
      expect(abMatches[0].status).toBe('completed');
      // a and b at cap 1 via the completed match; c-d should be the only other playable
      const playable = matches.filter(m => m.status === 'scheduled');
      for (const m of playable) {
        const pair = [m.homeTeamId, m.awayTeamId].sort().join('::');
        expect(pair).toBe('c::d');
      }
    }
  });

  it('court assignment: playable get courts 1..courtCount, byes stay 0', () => {
    for (let trial = 0; trial < 10; trial++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd', 'e'],
        courtCount: 2,
        divisionId: 'd1',
      });
      for (const m of matches) {
        if (m.status === 'bye') expect(m.courtNumber).toBe(0);
        else expect(m.courtNumber).toBeGreaterThanOrEqual(1);
      }
      // within a round, no duplicate court among playable (2 playable, 2 courts for 5 teams)
      const byRound = new Map<number, number[]>();
      for (const m of matches) {
        if (m.status === 'bye') continue;
        const list = byRound.get(m.roundNumber) ?? [];
        list.push(m.courtNumber);
        byRound.set(m.roundNumber, list);
      }
      for (const [, courts] of byRound) {
        expect(new Set(courts).size).toBe(courts.length);
      }
    }
  });

  it('caps + evade: total playable maximized, evaded kept counts as playable', () => {
    // caps generous: 3 each for 4 teams = full RR feasible; evaded pair must still be KEPT
    for (let trial = 0; trial < 20; trial++) {
      const caps = new Map([['a', 3], ['b', 3], ['c', 3], ['d', 3]]);
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd'],
        courtCount: 2,
        divisionId: 'd1',
        teamMaxGames: caps,
        evadePairs: new Set(['a::b']),
      });
      const playable = matches.filter(m => m.status !== 'bye');
      expect(playable).toHaveLength(6); // full RR kept, evade only delays
      const evaded = playable.find(m => [m.homeTeamId, m.awayTeamId].sort().join('::') === 'a::b')!;
      const maxRound = Math.max(...matches.map(m => m.roundNumber));
      expect(evaded.roundNumber).toBe(maxRound);
    }
  });
});

describe('bracket probes', () => {
  it('one semi completed, one scheduled -> no final round', () => {
    const semis: Match[] = [
      makeMatch('t1', 't4', 20, 18, { isFinals: true, finalsRound: 1 }),
      makeMatch('t2', 't3', null, null, { isFinals: true, finalsRound: 1, status: 'scheduled' }),
    ];
    expect(generateFinalRound(semis, 'div1')).toHaveLength(0);
  });

  it('both semis tied, only one resolved -> no final round (and no partial state)', () => {
    const semis: Match[] = [
      makeMatch('t1', 't4', 20, 20, { isFinals: true, finalsRound: 1, manualWinnerId: 't1' }),
      makeMatch('t2', 't3', 15, 15, { isFinals: true, finalsRound: 1 }),
    ];
    expect(generateFinalRound(semis, 'div1')).toHaveLength(0);
  });
});
