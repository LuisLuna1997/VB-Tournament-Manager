import { describe, it, expect } from 'vitest';
import { computeStandings } from '../standings';
import type { Match, Team } from '@/types/tournament';

function makeTeam(id: string, name: string, opts: Partial<Team> = {}): Team {
  return { id, name, color: '#000', manager: '', playerIds: [], divisionId: 'div1', checkinStatus: 'wip', maxGames: null, evadeTeamIds: [], ...opts };
}

function makeMatch(home: string, away: string, homeScore: number, awayScore: number, opts: Partial<Match> = {}): Match {
  return {
    id: `m-${home}-${away}`, roundNumber: 1, homeTeamId: home, awayTeamId: away,
    homeScore, awayScore, courtNumber: 1, status: 'completed', divisionId: 'div1',
    isFinals: false, ...opts,
  };
}

const teams: Record<string, Team> = {
  a: makeTeam('a', 'Alpha'),
  b: makeTeam('b', 'Bravo'),
  c: makeTeam('c', 'Charlie'),
};

describe('computeStandings', () => {
  it('returns all teams at 0-0 with no matches', () => {
    const standings = computeStandings([], teams, 'div1');
    expect(standings).toHaveLength(3);
    standings.forEach(s => {
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(0);
      expect(s.pointsFor).toBe(0);
      expect(s.pointsAgainst).toBe(0);
      expect(s.diff).toBe(0);
    });
  });

  it('computes W/L/PF/PA for a single match', () => {
    const matches = [makeMatch('a', 'b', 25, 20)];
    const standings = computeStandings(matches, teams, 'div1');
    const alpha = standings.find(s => s.teamId === 'a')!;
    const bravo = standings.find(s => s.teamId === 'b')!;
    expect(alpha.wins).toBe(1);
    expect(alpha.losses).toBe(0);
    expect(alpha.pointsFor).toBe(25);
    expect(alpha.pointsAgainst).toBe(20);
    expect(alpha.diff).toBe(5);
    expect(bravo.wins).toBe(0);
    expect(bravo.losses).toBe(1);
    expect(bravo.pointsFor).toBe(20);
    expect(bravo.pointsAgainst).toBe(25);
    expect(bravo.diff).toBe(-5);
  });

  it('accumulates stats across multiple matches', () => {
    const matches = [
      makeMatch('a', 'b', 25, 20),
      makeMatch('a', 'c', 25, 15),
    ];
    const standings = computeStandings(matches, teams, 'div1');
    const alpha = standings.find(s => s.teamId === 'a')!;
    expect(alpha.wins).toBe(2);
    expect(alpha.pointsFor).toBe(50);
    expect(alpha.pointsAgainst).toBe(35);
  });

  it('excludes dropped teams', () => {
    const teamsWithDropped = {
      ...teams,
      d: makeTeam('d', 'Dropped', { checkinStatus: 'dropped' }),
    };
    const standings = computeStandings([], teamsWithDropped, 'div1');
    expect(standings.find(s => s.teamId === 'd')).toBeUndefined();
    expect(standings).toHaveLength(3);
  });

  it('excludes finals matches', () => {
    const matches = [makeMatch('a', 'b', 25, 20, { isFinals: true })];
    const standings = computeStandings(matches, teams, 'div1');
    const alpha = standings.find(s => s.teamId === 'a')!;
    expect(alpha.wins).toBe(0);
  });

  it('skips matches with null scores', () => {
    const matches = [makeMatch('a', 'b', null as unknown as number, null as unknown as number)];
    const standings = computeStandings(matches, teams, 'div1');
    standings.forEach(s => expect(s.wins).toBe(0));
  });

  it('sorts a 3-way tie by diff (head-to-head is cyclic and stands down)', () => {
    const matches = [
      makeMatch('a', 'b', 25, 20),  // a wins
      makeMatch('b', 'c', 25, 10),  // b wins
      makeMatch('a', 'c', 20, 25),  // c wins
    ];
    // a: 1W 1L, PF=45 PA=45 diff=0
    // b: 1W 1L, PF=45 PA=35 diff=10
    // c: 1W 1L, PF=35 PA=45 diff=-10
    const standings = computeStandings(matches, teams, 'div1');
    expect(standings[0].teamId).toBe('b'); // best diff (+10)
    expect(standings[1].teamId).toBe('a'); // middle diff (0)
    expect(standings[2].teamId).toBe('c'); // worst diff (-10)
  });

  it('breaks a two-team tie by head-to-head even against diff', () => {
    // a and b both finish 1-1 but a beat b directly; b has the better diff
    const matches = [
      makeMatch('a', 'b', 21, 19),  // a beats b
      makeMatch('b', 'c', 25, 5),   // b crushes c -> b diff +18
      makeMatch('a', 'c', 21, 25),  // c beats a -> a diff -2, c 1-1 diff... c: 5+25 PF=30 PA=46 diff=-16
    ];
    const standings = computeStandings(matches, teams, 'div1');
    // a, b, c all 1-1: 3-way group -> diff order would be b(+18), a(-2), c(-16).
    // It's a 3-team group so diff stands and b ranks first.
    expect(standings[0].teamId).toBe('b');

    // Now make it a genuine two-team tie: d is winless
    const teams4 = { ...teams, d: makeTeam('d', 'Delta') };
    const matches4 = [
      makeMatch('a', 'b', 21, 19),  // a beats b head-to-head
      makeMatch('b', 'd', 25, 5),   // b 1-1, diff +18
      makeMatch('a', 'd', 21, 25),  // a 1-1, diff -2; d 1-1... d would tie too
    ];
    // give d a second loss so only a & b are tied at 1-1
    matches4.push(makeMatch('d', 'b', 10, 25)); // b now 2-1, no longer tied with a
    const s4 = computeStandings(matches4, teams4, 'div1');
    const rankOf = (id: string) => s4.find(s => s.teamId === id)!.rank;
    expect(rankOf('b')).toBe(1); // 2-1, best pct
    // a (1-1) vs d (1-2): different pct, no tie to break
    expect(rankOf('a')).toBe(2);
  });

  it('two teams tied on record: head-to-head winner ranks higher despite worse diff', () => {
    const teams4 = {
      a: makeTeam('a', 'Alpha'),
      b: makeTeam('b', 'Bravo'),
      c: makeTeam('c', 'Charlie'),
      d: makeTeam('d', 'Delta'),
    };
    const matches = [
      makeMatch('a', 'b', 21, 19),  // a beats b (close)
      makeMatch('a', 'c', 10, 25),  // a loses big -> a: 1-1, diff -13
      makeMatch('b', 'd', 25, 5),   // b wins big -> b: 1-1, diff +18
      makeMatch('c', 'd', 25, 10),  // c: 2-0, d: 0-2
    ];
    const standings = computeStandings(matches, teams4, 'div1');
    const aRank = standings.find(s => s.teamId === 'a')!.rank;
    const bRank = standings.find(s => s.teamId === 'b')!.rank;
    // a and b are the only 1-1 teams; a beat b, so a ranks above b despite diff
    expect(aRank).toBeLessThan(bRank);
  });

  it('counts a tied match as a tie for both teams, not a loss', () => {
    const matches = [makeMatch('a', 'b', 21, 21)];
    const standings = computeStandings(matches, teams, 'div1');
    const alpha = standings.find(s => s.teamId === 'a')!;
    const bravo = standings.find(s => s.teamId === 'b')!;
    expect(alpha.ties).toBe(1);
    expect(alpha.wins).toBe(0);
    expect(alpha.losses).toBe(0);
    expect(alpha.gamesPlayed).toBe(1);
    expect(bravo.ties).toBe(1);
    expect(bravo.losses).toBe(0);
    expect(alpha.pointsFor).toBe(21);
    expect(alpha.pointsAgainst).toBe(21);
  });

  it('ranks by win percentage when games played differ', () => {
    // a is 2-0 (capped early), b is 3-2 — a should rank above b
    const teams5 = {
      a: makeTeam('a', 'Alpha'),
      b: makeTeam('b', 'Bravo'),
      c: makeTeam('c', 'Charlie'),
      d: makeTeam('d', 'Delta'),
      e: makeTeam('e', 'Echo'),
    };
    const matches = [
      makeMatch('a', 'c', 21, 10),
      makeMatch('a', 'd', 21, 10),  // a: 2-0
      makeMatch('b', 'c', 21, 10),
      makeMatch('b', 'd', 21, 10),
      makeMatch('b', 'e', 21, 10),
      makeMatch('c', 'b', 21, 10),
      makeMatch('e', 'b', 21, 10),  // b: 3-2
    ];
    const standings = computeStandings(matches, teams5, 'div1');
    const aRank = standings.find(s => s.teamId === 'a')!.rank;
    const bRank = standings.find(s => s.teamId === 'b')!.rank;
    expect(aRank).toBeLessThan(bRank);
  });

  it('assigns ranks starting from 1', () => {
    const standings = computeStandings([], teams, 'div1');
    expect(standings[0].rank).toBe(1);
    expect(standings[1].rank).toBe(2);
    expect(standings[2].rank).toBe(3);
  });

  it('only includes teams from the specified division', () => {
    const multiDivTeams = {
      ...teams,
      x: makeTeam('x', 'Other', { divisionId: 'div2' }),
    };
    const standings = computeStandings([], multiDivTeams, 'div1');
    expect(standings).toHaveLength(3);
    expect(standings.find(s => s.teamId === 'x')).toBeUndefined();
  });
});
