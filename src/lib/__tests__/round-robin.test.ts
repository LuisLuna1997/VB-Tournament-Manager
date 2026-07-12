import { describe, it, expect } from 'vitest';
import { generateRoundRobin, collectPreservedResults, getCompletedRoundCount, getRoundsGrouped } from '../round-robin';
import type { Match } from '@/types/tournament';

function countGamesPerTeam(matches: Match[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of matches) {
    if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
    counts.set(m.homeTeamId, (counts.get(m.homeTeamId) ?? 0) + 1);
    counts.set(m.awayTeamId, (counts.get(m.awayTeamId) ?? 0) + 1);
  }
  return counts;
}

describe('generateRoundRobin', () => {
  it('returns empty array for fewer than 2 teams', () => {
    expect(generateRoundRobin({ teamIds: [], courtCount: 2, divisionId: 'd1' })).toEqual([]);
    expect(generateRoundRobin({ teamIds: ['a'], courtCount: 2, divisionId: 'd1' })).toEqual([]);
  });

  it('generates 1 round for 2 teams', () => {
    const matches = generateRoundRobin({ teamIds: ['a', 'b'], courtCount: 1, divisionId: 'd1' });
    const playable = matches.filter(m => m.status !== 'bye');
    expect(playable).toHaveLength(1);
    const ids = [playable[0].homeTeamId, playable[0].awayTeamId].sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('generates correct schedule for 4 teams (even)', () => {
    const matches = generateRoundRobin({ teamIds: ['a', 'b', 'c', 'd'], courtCount: 2, divisionId: 'd1' });
    const playable = matches.filter(m => m.status !== 'bye');
    // 4 teams: C(4,2) = 6 matches total, 3 rounds
    expect(playable).toHaveLength(6);
    const rounds = getRoundsGrouped(matches);
    expect(rounds.size).toBe(3);
    // Each team plays exactly 3 games
    const counts = countGamesPerTeam(playable);
    expect(counts.get('a')).toBe(3);
    expect(counts.get('b')).toBe(3);
    expect(counts.get('c')).toBe(3);
    expect(counts.get('d')).toBe(3);
  });

  it('handles odd number of teams with BYE', () => {
    const matches = generateRoundRobin({ teamIds: ['a', 'b', 'c'], courtCount: 2, divisionId: 'd1' });
    const byeMatches = matches.filter(m => m.status === 'bye');
    const playable = matches.filter(m => m.status !== 'bye');
    // 3 teams: each plays 2 games, 3 total matches
    expect(playable).toHaveLength(3);
    // Each team gets exactly 1 BYE
    expect(byeMatches).toHaveLength(3);
    // Each BYE match has exactly one team (either home or away is null)
    byeMatches.forEach(m => {
      // At least one team ID is present
      expect(m.homeTeamId ?? m.awayTeamId).not.toBeNull();
    });
  });

  it('handles 5 teams (odd)', () => {
    const matches = generateRoundRobin({ teamIds: ['a', 'b', 'c', 'd', 'e'], courtCount: 2, divisionId: 'd1' });
    const playable = matches.filter(m => m.status !== 'bye');
    // 5 teams: C(5,2) = 10 matches
    expect(playable).toHaveLength(10);
    // Each team plays 4 games
    const counts = countGamesPerTeam(playable);
    ['a', 'b', 'c', 'd', 'e'].forEach(t => expect(counts.get(t)).toBe(4));
  });

  it('ensures no team plays itself', () => {
    const matches = generateRoundRobin({ teamIds: ['a', 'b', 'c', 'd', 'e', 'f'], courtCount: 2, divisionId: 'd1' });
    matches.filter(m => m.status !== 'bye').forEach(m => {
      expect(m.homeTeamId).not.toBe(m.awayTeamId);
    });
  });

  it('ensures every pair plays exactly once', () => {
    const teams = ['a', 'b', 'c', 'd'];
    const matches = generateRoundRobin({ teamIds: teams, courtCount: 2, divisionId: 'd1' });
    const playable = matches.filter(m => m.status !== 'bye');
    const pairs = new Set(playable.map(m => [m.homeTeamId!, m.awayTeamId!].sort().join(':')));
    // C(4,2) = 6 unique pairs
    expect(pairs.size).toBe(6);
  });

  it('assigns court numbers correctly', () => {
    const matches = generateRoundRobin({ teamIds: ['a', 'b', 'c', 'd'], courtCount: 2, divisionId: 'd1' });
    const playable = matches.filter(m => m.status !== 'bye');
    playable.forEach(m => {
      expect(m.courtNumber).toBeGreaterThanOrEqual(1);
      expect(m.courtNumber).toBeLessThanOrEqual(2);
    });
  });

  it('restores preserved results with correct scores regardless of home/away order', () => {
    // Simulate: team 'a' (home) beat team 'b' (away) 25-20
    // collectPreservedResults stores in sorted order: key 'a::b', a's score first
    const originalMatches: Match[] = [{
      id: 'orig', roundNumber: 1, homeTeamId: 'a', awayTeamId: 'b',
      homeScore: 25, awayScore: 20, courtNumber: 1, status: 'completed',
      divisionId: 'd1', isFinals: false,
    }];
    const preserved = collectPreservedResults(originalMatches);

    const matches = generateRoundRobin({
      teamIds: ['a', 'b', 'c'], courtCount: 2, divisionId: 'd1', preservedResults: preserved,
    });
    const restored = matches.find(m =>
      (m.homeTeamId === 'a' && m.awayTeamId === 'b') || (m.homeTeamId === 'b' && m.awayTeamId === 'a')
    );
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('completed');

    // Regardless of which team is home in the new schedule,
    // 'a' should have 25 and 'b' should have 20
    if (restored!.homeTeamId === 'a') {
      expect(restored!.homeScore).toBe(25);
      expect(restored!.awayScore).toBe(20);
    } else {
      expect(restored!.homeScore).toBe(20);
      expect(restored!.awayScore).toBe(25);
    }
  });

  it('enforces teamMaxGames cap', () => {
    const teamMaxGames = new Map([['a', 2]]);
    const matches = generateRoundRobin({
      teamIds: ['a', 'b', 'c', 'd'], courtCount: 2, divisionId: 'd1', teamMaxGames,
    });
    const gamesForA = countGamesPerTeam(matches.filter(m => m.status !== 'bye')).get('a') ?? 0;
    expect(gamesForA).toBeLessThanOrEqual(2);
  });

  it('removes rounds with only BYE matches after maxGames enforcement', () => {
    // All teams capped at 1 game with 4 teams
    const teamMaxGames = new Map([['a', 1], ['b', 1], ['c', 1], ['d', 1]]);
    const matches = generateRoundRobin({
      teamIds: ['a', 'b', 'c', 'd'], courtCount: 2, divisionId: 'd1', teamMaxGames,
    });
    // Should have minimal rounds, no empty/BYE-only rounds
    const rounds = getRoundsGrouped(matches);
    for (const [, roundMatches] of rounds) {
      const hasPlayable = roundMatches.some(m => m.status !== 'bye');
      expect(hasPlayable).toBe(true);
    }
  });

  it('sets divisionId on all matches', () => {
    const matches = generateRoundRobin({ teamIds: ['a', 'b', 'c'], courtCount: 1, divisionId: 'myDiv' });
    matches.forEach(m => expect(m.divisionId).toBe('myDiv'));
  });

  it('sets isFinals to false on all matches', () => {
    const matches = generateRoundRobin({ teamIds: ['a', 'b', 'c'], courtCount: 1, divisionId: 'd1' });
    matches.forEach(m => expect(m.isFinals).toBe(false));
  });
});

describe('collectPreservedResults', () => {
  function makeMatch(home: string, away: string, hs: number, as: number, status: string = 'completed'): Match {
    return {
      id: 'x', roundNumber: 1, homeTeamId: home, awayTeamId: away,
      homeScore: hs, awayScore: as, courtNumber: 1, status: status as Match['status'],
      divisionId: 'd1', isFinals: false,
    };
  }

  it('returns empty map for no completed matches', () => {
    const results = collectPreservedResults([]);
    expect(results.size).toBe(0);
  });

  it('collects completed matches', () => {
    const matches = [makeMatch('a', 'b', 25, 20)];
    const results = collectPreservedResults(matches);
    expect(results.size).toBe(1);
    expect(results.get('a::b')).toEqual({ homeScore: 25, awayScore: 20 });
  });

  it('uses sorted key regardless of home/away order', () => {
    const matches = [makeMatch('b', 'a', 25, 20)];
    const results = collectPreservedResults(matches);
    expect(results.has('a::b')).toBe(true);
  });

  it('skips non-completed matches', () => {
    const matches = [makeMatch('a', 'b', 25, 20, 'scheduled')];
    const results = collectPreservedResults(matches);
    expect(results.size).toBe(0);
  });

  it('skips matches with null scores', () => {
    const matches = [makeMatch('a', 'b', null as unknown as number, null as unknown as number)];
    const results = collectPreservedResults(matches);
    expect(results.size).toBe(0);
  });

  it('skips matches with null team IDs', () => {
    const matches = [makeMatch(null as unknown as string, 'b', 25, 20)];
    const results = collectPreservedResults(matches);
    expect(results.size).toBe(0);
  });
});

describe('getCompletedRoundCount', () => {
  function makeMatch(round: number, status: string): Match {
    return {
      id: `r${round}`, roundNumber: round, homeTeamId: 'a', awayTeamId: 'b',
      homeScore: null, awayScore: null, courtNumber: 1, status: status as Match['status'],
      divisionId: 'd1', isFinals: false,
    };
  }

  it('returns 0 for empty array', () => {
    expect(getCompletedRoundCount([])).toBe(0);
  });

  it('counts fully completed rounds', () => {
    const matches = [
      makeMatch(1, 'completed'),
      makeMatch(1, 'completed'),
      makeMatch(2, 'scheduled'),
    ];
    expect(getCompletedRoundCount(matches)).toBe(1);
  });

  it('does not count partially completed rounds', () => {
    const matches = [
      makeMatch(1, 'completed'),
      makeMatch(1, 'scheduled'),
    ];
    expect(getCompletedRoundCount(matches)).toBe(0);
  });

  it('counts BYE-only rounds as completed', () => {
    const matches = [makeMatch(1, 'bye')];
    expect(getCompletedRoundCount(matches)).toBe(1);
  });
});

describe('getRoundsGrouped', () => {
  it('returns empty map for empty array', () => {
    expect(getRoundsGrouped([]).size).toBe(0);
  });

  it('groups matches by round number', () => {
    const matches: Match[] = [
      { id: '1', roundNumber: 1, homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: null, courtNumber: 1, status: 'scheduled', divisionId: 'd1', isFinals: false },
      { id: '2', roundNumber: 1, homeTeamId: 'c', awayTeamId: 'd', homeScore: null, awayScore: null, courtNumber: 2, status: 'scheduled', divisionId: 'd1', isFinals: false },
      { id: '3', roundNumber: 2, homeTeamId: 'a', awayTeamId: 'c', homeScore: null, awayScore: null, courtNumber: 1, status: 'scheduled', divisionId: 'd1', isFinals: false },
    ];
    const rounds = getRoundsGrouped(matches);
    expect(rounds.size).toBe(2);
    expect(rounds.get(1)).toHaveLength(2);
    expect(rounds.get(2)).toHaveLength(1);
  });
});

describe('evade pairs (schedule last)', () => {
  it('places the evaded matchup in the last round', () => {
    for (let trial = 0; trial < 20; trial++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd'],
        courtCount: 2,
        divisionId: 'd1',
        evadePairs: new Set(['a::b']),
      });
      const maxRound = Math.max(...matches.map(m => m.roundNumber));
      const evadedMatch = matches.find(
        m => m.homeTeamId && m.awayTeamId && [m.homeTeamId, m.awayTeamId].sort().join('::') === 'a::b'
      )!;
      expect(evadedMatch.roundNumber).toBe(maxRound);
    }
  });

  it('cuts the evaded matchup first when game caps apply', () => {
    for (let trial = 0; trial < 20; trial++) {
      const caps = new Map([['a', 2], ['b', 2], ['c', 2], ['d', 2]]);
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd'],
        courtCount: 2,
        divisionId: 'd1',
        teamMaxGames: caps,
        evadePairs: new Set(['a::b']),
      });
      const playable = matches.filter(m => m.status !== 'bye');
      const evadedPlayed = playable.some(
        m => [m.homeTeamId, m.awayTeamId].sort().join('::') === 'a::b'
      );
      expect(evadedPlayed).toBe(false);
    }
  });
});

describe('maxGames fairness (best-of-K generation)', () => {
  it('reaches the feasible optimum with mixed caps instead of stranding teams', () => {
    // a,b capped at 1; c,d capped at 2. Optimum keeps 3 matches
    // (e.g. a-c, b-d, c-d); naive greedy could strand everyone at 1 game.
    const caps = new Map([['a', 1], ['b', 1], ['c', 2], ['d', 2]]);
    for (let trial = 0; trial < 10; trial++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd'],
        courtCount: 2,
        divisionId: 'd1',
        teamMaxGames: caps,
      });
      const playable = matches.filter(m => m.status !== 'bye');
      expect(playable.length).toBe(3);
    }
  });

  it('never exceeds any team cap', () => {
    const caps = new Map([['a', 1], ['b', 2], ['c', 3]]);
    for (let trial = 0; trial < 10; trial++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd', 'e'],
        courtCount: 2,
        divisionId: 'd1',
        teamMaxGames: caps,
      });
      const counts = countGamesPerTeam(matches.filter(m => m.status !== 'bye'));
      expect(counts.get('a') ?? 0).toBeLessThanOrEqual(1);
      expect(counts.get('b') ?? 0).toBeLessThanOrEqual(2);
      expect(counts.get('c') ?? 0).toBeLessThanOrEqual(3);
    }
  });
});

describe('targetGames as a FLOOR (round up, never short a team)', () => {
  const counts = (m: Match[]) => countGamesPerTeam(m.filter(x => x.status !== 'bye'));

  it('4 teams, target 2 -> everyone plays exactly 2 (even parity)', () => {
    for (let t = 0; t < 12; t++) {
      const m = generateRoundRobin({ teamIds: ['a', 'b', 'c', 'd'], courtCount: 2, divisionId: 'd1', targetGames: 2 });
      ['a', 'b', 'c', 'd'].forEach(x => expect(counts(m).get(x)).toBe(2));
    }
  });

  it('5 teams, target 3 -> everyone >=3, exactly ONE team rounds up to 4', () => {
    for (let t = 0; t < 15; t++) {
      const m = generateRoundRobin({ teamIds: ['a', 'b', 'c', 'd', 'e'], courtCount: 2, divisionId: 'd1', targetGames: 3 });
      const vals = ['a', 'b', 'c', 'd', 'e'].map(x => counts(m).get(x) ?? 0);
      vals.forEach(v => expect(v).toBeGreaterThanOrEqual(3)); // NO team below the target
      expect(vals.filter(v => v === 4)).toHaveLength(1);       // parity rounds UP, not down
      expect(vals.filter(v => v === 3)).toHaveLength(4);
    }
  });

  it('never leaves any team below the target (random n & target)', () => {
    for (let t = 0; t < 48; t++) {
      const nTeams = 4 + (t % 6); // 4..9
      const ids = Array.from({ length: nTeams }, (_, i) => `t${i}`);
      const target = 1 + (t % (nTeams - 1));
      const m = generateRoundRobin({ teamIds: ids, courtCount: 2, divisionId: 'd1', targetGames: target });
      const c = counts(m);
      const floor = Math.min(target, nTeams - 1);
      ids.forEach(x => expect(c.get(x) ?? 0).toBeGreaterThanOrEqual(floor));
    }
  });

  it('a per-team hard cap still wins over the target floor', () => {
    for (let t = 0; t < 12; t++) {
      const m = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd', 'e'], courtCount: 2, divisionId: 'd1',
        targetGames: 3, teamMaxGames: new Map([['a', 1]]),
      });
      const c = counts(m);
      expect(c.get('a') ?? 0).toBeLessThanOrEqual(1);                              // cap respected
      ['b', 'c', 'd', 'e'].forEach(x => expect(c.get(x) ?? 0).toBeGreaterThanOrEqual(3)); // others meet floor
    }
  });
});

describe('Feature 4: Ready teams start on the first courts', () => {
  const bothReady = (m: Match, ready: Set<string>) =>
    !!m.homeTeamId && !!m.awayTeamId && ready.has(m.homeTeamId) && ready.has(m.awayTeamId);
  const round1FirstOnCourt = (m: Match[], court: number) =>
    m.find(x => x.roundNumber === 1 && x.status !== 'bye' && x.courtNumber === court);

  it('round 1 Court 1 & Court 2 are Ready-vs-Ready (6 teams, 4 ready, 2 courts)', () => {
    const ready = new Set(['r1', 'r2', 'r3', 'r4']);
    for (let t = 0; t < 25; t++) {
      const m = generateRoundRobin({
        teamIds: ['r1', 'r2', 'r3', 'r4', 'w1', 'w2'], courtCount: 2, divisionId: 'd1', readyTeamIds: ready,
      });
      expect(bothReady(round1FirstOnCourt(m, 1)!, ready)).toBe(true);
      expect(bothReady(round1FirstOnCourt(m, 2)!, ready)).toBe(true);
    }
  });

  it('keeps the Ready-first opening even with a target floor', () => {
    const ready = new Set(['r1', 'r2', 'r3', 'r4']);
    for (let t = 0; t < 25; t++) {
      const m = generateRoundRobin({
        teamIds: ['r1', 'r2', 'r3', 'r4', 'w1', 'w2'], courtCount: 2, divisionId: 'd1',
        targetGames: 2, readyTeamIds: ready,
      });
      expect(bothReady(round1FirstOnCourt(m, 1)!, ready)).toBe(true);
      expect(bothReady(round1FirstOnCourt(m, 2)!, ready)).toBe(true);
    }
  });

  it('a WIP team, never a Ready team, takes the bye when the count is odd', () => {
    const ready = new Set(['r1', 'r2', 'r3', 'r4']);
    for (let t = 0; t < 25; t++) {
      const m = generateRoundRobin({
        teamIds: ['r1', 'r2', 'r3', 'r4', 'w1'], courtCount: 2, divisionId: 'd1', readyTeamIds: ready,
      });
      const playingRound1 = new Set<string>();
      for (const x of m.filter(x => x.roundNumber === 1 && x.status !== 'bye')) {
        if (x.homeTeamId) playingRound1.add(x.homeTeamId);
        if (x.awayTeamId) playingRound1.add(x.awayTeamId);
      }
      ['r1', 'r2', 'r3', 'r4'].forEach(r => expect(playingRound1.has(r)).toBe(true));
    }
  });

  it('on regenerate, round 1 seats UNPLAYED Ready pairs (does not re-pair already-played ones)', () => {
    // Reproduces the review finding: r1-r2 and r3-r4 already played; after adding
    // WIP teams and regenerating, round 1's courts must hold UNPLAYED Ready pairs
    // (else regenerate strips them as duplicates and seats WIP matches instead).
    const ready = new Set(['r1', 'r2', 'r3', 'r4']);
    const preserved = new Map([
      ['r1::r2', { homeScore: 21, awayScore: 10 }],
      ['r3::r4', { homeScore: 21, awayScore: 15 }],
    ]);
    for (let t = 0; t < 25; t++) {
      const m = generateRoundRobin({
        teamIds: ['r1', 'r2', 'r3', 'r4', 'w1', 'w2'], courtCount: 2, divisionId: 'd1',
        readyTeamIds: ready, preservedResults: preserved,
      });
      for (const court of [1, 2]) {
        const first = m.find(x => x.roundNumber === 1 && x.status === 'scheduled' && x.courtNumber === court);
        expect(first, `court ${court} scheduled match`).toBeDefined();
        expect(bothReady(first!, ready)).toBe(true);
        const key = [first!.homeTeamId!, first!.awayTeamId!].sort().join('::');
        expect(preserved.has(key), `court ${court} pair already played`).toBe(false);
      }
    }
  });
});
