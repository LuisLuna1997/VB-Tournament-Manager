// Edge-case regression probes for the 2026-06 bug-fix pass (standings tie/h2h
// handling, evade-last scheduling, cap enforcement with preserved results).
import { describe, it, expect } from 'vitest';
import { computeStandings } from '../standings';
import { generateRoundRobin, collectPreservedResults } from '../round-robin';
import type { Match, Team } from '@/types/tournament';

function makeTeam(id: string, name: string): Team {
  return { id, name, color: '#000', manager: '', playerIds: [], divisionId: 'div1', checkinStatus: 'wip', maxGames: null, evadeTeamIds: [] };
}

let seq = 0;
function makeMatch(home: string, away: string, hs: number, as: number, opts: Partial<Match> = {}): Match {
  return {
    id: `m${seq++}`, roundNumber: 1, homeTeamId: home, awayTeamId: away,
    homeScore: hs, awayScore: as, courtNumber: 1, status: 'completed',
    divisionId: 'div1', isFinals: false, ...opts,
  };
}

describe('standings probes', () => {
  it('adjacent 2-team groups swap independently', () => {
    // a,b: 2-2 each (pct .5, wins 2). c,d: 1-1 each (pct .5, wins 1)
    const teams = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map(id => [id, makeTeam(id, id.toUpperCase())]));
    const matches = [
      // a: beats b (close), beats e, loses to e, loses to f => 2-2
      makeMatch('a', 'b', 21, 19),
      makeMatch('a', 'e', 25, 5),
      makeMatch('e', 'a', 25, 5),
      makeMatch('f', 'a', 25, 5),
      // b: beats e big twice, loses to f => with loss to a, 2-2, much better diff than a
      makeMatch('b', 'e', 25, 1),
      makeMatch('b', 'f', 25, 1),
      makeMatch('e', 'b', 25, 24),
      // c: beats d close, loses to f => 1-1
      makeMatch('c', 'd', 21, 19),
      makeMatch('f', 'c', 25, 1),
      // d: beats e big => 1-1 with better diff than c
      makeMatch('d', 'e', 25, 1),
    ];
    const s = computeStandings(matches, teams, 'div1');
    const rankOf = (id: string) => s.find(x => x.teamId === id)!.rank;
    // a beat b head-to-head: a above b despite worse diff
    expect(rankOf('a')).toBeLessThan(rankOf('b'));
    // c beat d head-to-head: c above d despite worse diff
    expect(rankOf('c')).toBeLessThan(rankOf('d'));
  });

  it('0-game team vs all-loss team grouping', () => {
    const teams = Object.fromEntries(['a', 'b', 'z'].map(id => [id, makeTeam(id, id)]));
    // z played 0 games; b lost both
    const matches = [
      makeMatch('a', 'b', 25, 10),
      makeMatch('a', 'b', 25, 10),
    ];
    const s = computeStandings(matches, teams, 'div1');
    expect(s[0].teamId).toBe('a');
  });

  it('h2h between teams whose pct equality comes from different denominators', () => {
    // a: 1-1 (pct .5, wins 1), b: 1-1-0 different games... craft b 1-1 too but 2 ties? wins differ then.
    // craft: a = 2-2 (pct .5 wins 2), b = 1-1-2 => (1+1)/4 = .5 wins 1 -> different wins, no group
    const teams = Object.fromEntries(['a', 'b', 'x', 'y'].map(id => [id, makeTeam(id, id)]));
    const matches = [
      makeMatch('a', 'x', 25, 10), makeMatch('a', 'x', 25, 10),
      makeMatch('x', 'a', 25, 10), makeMatch('y', 'a', 25, 10),
      makeMatch('b', 'y', 25, 10), makeMatch('y', 'b', 25, 10),
      makeMatch('b', 'x', 20, 20), makeMatch('b', 'y', 20, 20),
    ];
    const s = computeStandings(matches, teams, 'div1');
    const a = s.find(x => x.teamId === 'a')!;
    const b = s.find(x => x.teamId === 'b')!;
    // a: 2-2 (pct .5, 2 wins); b: 1-1-2 (pct .5, 1 win) — equal pct, wins breaks it
    expect(a.ties).toBe(0);
    expect(b.ties).toBe(2);
    expect(a.rank).toBeLessThan(b.rank);
  });

  it('two teams tied where the pair played twice with split results (net 0)', () => {
    const teams = Object.fromEntries(['a', 'b', 'x'].map(id => [id, makeTeam(id, id)]));
    const matches = [
      makeMatch('a', 'b', 21, 15), // a beats b
      makeMatch('b', 'a', 21, 15), // b beats a
      makeMatch('a', 'x', 25, 5),  // pad: a 2-1
      makeMatch('b', 'x', 25, 1),  // pad: b 2-1, better diff
      makeMatch('x', 'a', 25, 20), // a 2-2... let me keep simpler
    ];
    const s = computeStandings(matches.slice(0, 4), teams, 'div1');
    // a and b both 2-1; b better diff -> b first (h2h net 0)
    const rankOf = (id: string) => s.find(x => x.teamId === id)!.rank;
    expect(rankOf('b')).toBeLessThan(rankOf('a'));
  });
});

describe('round-robin probes', () => {
  it('evade with odd team count places evaded matchup last', () => {
    for (let t = 0; t < 30; t++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd', 'e'],
        courtCount: 2,
        divisionId: 'd1',
        evadePairs: new Set(['a::b']),
      });
      const maxRound = Math.max(...matches.map(m => m.roundNumber));
      const evaded = matches.find(m => m.homeTeamId && m.awayTeamId && [m.homeTeamId, m.awayTeamId].sort().join('::') === 'a::b')!;
      expect(evaded).toBeDefined();
      expect(evaded.roundNumber).toBe(maxRound);
      // round numbers should be contiguous 1..N
      const roundSet = new Set(matches.map(m => m.roundNumber));
      expect(roundSet.size).toBe(maxRound);
    }
  });

  it('preserved completed results restored identically across all candidates (caps active)', () => {
    const preserved = collectPreservedResults([
      makeMatch('a', 'b', 25, 20),
      makeMatch('c', 'd', 15, 25),
    ]);
    for (let t = 0; t < 30; t++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd', 'e'],
        courtCount: 2,
        divisionId: 'd1',
        preservedResults: preserved,
        teamMaxGames: new Map([['a', 2], ['b', 2], ['c', 2], ['d', 2], ['e', 2]]),
      });
      const ab = matches.find(m => m.homeTeamId && m.awayTeamId && [m.homeTeamId, m.awayTeamId].sort().join('::') === 'a::b');
      expect(ab).toBeDefined();
      expect(ab!.status).toBe('completed');
      const scores = [ab!.homeScore, ab!.awayScore].sort((x, y) => x! - y!);
      expect(scores).toEqual([20, 25]);
      // completed games must count toward caps
      const counts = new Map<string, number>();
      for (const m of matches) {
        if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
        counts.set(m.homeTeamId, (counts.get(m.homeTeamId) ?? 0) + 1);
        counts.set(m.awayTeamId, (counts.get(m.awayTeamId) ?? 0) + 1);
      }
      for (const [id, c] of counts) {
        expect(c, `team ${id} over cap`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('caps below already-completed count: what happens', () => {
    // a already played 2 completed games but cap is 1
    const preserved = collectPreservedResults([
      makeMatch('a', 'b', 25, 20),
      makeMatch('a', 'c', 25, 20),
    ]);
    const matches = generateRoundRobin({
      teamIds: ['a', 'b', 'c', 'd'],
      courtCount: 2,
      divisionId: 'd1',
      preservedResults: preserved,
      teamMaxGames: new Map([['a', 1]]),
    });
    const aGames = matches.filter(m => m.status !== 'bye' && (m.homeTeamId === 'a' || m.awayTeamId === 'a'));
    // Already over cap: preserved completed games survive, but no NEW games scheduled
    expect(aGames.filter(m => m.status === 'scheduled')).toHaveLength(0);
    expect(aGames.every(m => m.status === 'completed')).toBe(true);
  });

  it('evade pair already completed (preserved): still pushed last + reorder sanity', () => {
    const preserved = collectPreservedResults([makeMatch('a', 'b', 25, 20)]);
    for (let t = 0; t < 10; t++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd'],
        courtCount: 2,
        divisionId: 'd1',
        preservedResults: preserved,
        evadePairs: new Set(['a::b']),
      });
      const ab = matches.find(m => m.homeTeamId && m.awayTeamId && [m.homeTeamId, m.awayTeamId].sort().join('::') === 'a::b')!;
      const maxRound = Math.max(...matches.map(m => m.roundNumber));
      expect(ab.roundNumber).toBe(maxRound);
      expect(ab.status).toBe('completed');
    }
  });

  it('round numbers contiguous after cap cuts remove whole rounds', () => {
    for (let t = 0; t < 30; t++) {
      const matches = generateRoundRobin({
        teamIds: ['a', 'b', 'c', 'd', 'e', 'f'],
        courtCount: 3,
        divisionId: 'd1',
        teamMaxGames: new Map([['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 1], ['f', 1]]),
      });
      const roundNums = [...new Set(matches.map(m => m.roundNumber))].sort((x, y) => x - y);
      // Every surviving round must contain at least one playable match
      for (const r of roundNums) {
        expect(matches.some(m => m.roundNumber === r && m.status !== 'bye')).toBe(true);
      }
      // With a universal cap of 1, exactly one round of games survives
      const playable = matches.filter(m => m.status !== 'bye');
      expect(playable).toHaveLength(3);
    }
  });

  it('evaded matchup vs caps: evaded kept when caps leave room only via evaded', () => {
    // a::b evaded; cap 3 for everyone in 4-team RR (3 rounds) -> nothing cut, evaded kept (intended)
    const matches = generateRoundRobin({
      teamIds: ['a', 'b', 'c', 'd'],
      courtCount: 2,
      divisionId: 'd1',
      teamMaxGames: new Map([['a', 3], ['b', 3], ['c', 3], ['d', 3]]),
      evadePairs: new Set(['a::b']),
    });
    const playable = matches.filter(m => m.status !== 'bye');
    expect(playable).toHaveLength(6);
  });
});
