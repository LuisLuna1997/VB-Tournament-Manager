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
