import { describe, it, expect } from 'vitest';
import { generateBracket, generateFinalRound, resolveMatchWinner } from '../bracket';
import type { TeamStanding, Match } from '@/types/tournament';

function makeStanding(teamId: string, rank: number): TeamStanding {
  return { teamId, teamName: `Team ${rank}`, teamColor: '#000', wins: 0, losses: 0, ties: 0, gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, rank };
}

describe('generateBracket', () => {
  const standings = [
    makeStanding('t1', 1),
    makeStanding('t2', 2),
    makeStanding('t3', 3),
    makeStanding('t4', 4),
  ];

  it('creates a single final for advancingCount=2', () => {
    const matches = generateBracket(standings, 2, 'div1');
    expect(matches).toHaveLength(1);
    expect(matches[0].homeTeamId).toBe('t1');
    expect(matches[0].awayTeamId).toBe('t2');
    expect(matches[0].isFinals).toBe(true);
    expect(matches[0].finalsRound).toBe(1);
    expect(matches[0].status).toBe('scheduled');
  });

  it('creates two semis for advancingCount=4', () => {
    const matches = generateBracket(standings, 4, 'div1');
    expect(matches).toHaveLength(2);
    // Semi 1: #1 vs #4
    expect(matches[0].homeTeamId).toBe('t1');
    expect(matches[0].awayTeamId).toBe('t4');
    expect(matches[0].courtNumber).toBe(1);
    // Semi 2: #2 vs #3
    expect(matches[1].homeTeamId).toBe('t2');
    expect(matches[1].awayTeamId).toBe('t3');
    expect(matches[1].courtNumber).toBe(2);
    // Both are finals
    matches.forEach(m => {
      expect(m.isFinals).toBe(true);
      expect(m.finalsRound).toBe(1);
    });
  });

  it('returns empty for invalid advancingCount', () => {
    expect(generateBracket(standings, 3, 'div1')).toHaveLength(0);
    expect(generateBracket(standings, 0, 'div1')).toHaveLength(0);
  });

  it('sets divisionId on all matches', () => {
    const matches = generateBracket(standings, 4, 'div1');
    matches.forEach(m => expect(m.divisionId).toBe('div1'));
  });
});

describe('generateFinalRound', () => {
  function makeSemi(homeId: string, awayId: string, homeScore: number, awayScore: number): Match {
    return {
      id: `semi-${homeId}`, roundNumber: 1, homeTeamId: homeId, awayTeamId: awayId,
      homeScore, awayScore, courtNumber: 1, status: 'completed', divisionId: 'div1',
      isFinals: true, finalsRound: 1,
    };
  }

  it('generates championship and 3rd place from two completed semis', () => {
    const semis = [
      makeSemi('t1', 't4', 25, 10), // t1 wins
      makeSemi('t2', 't3', 25, 20), // t2 wins
    ];
    const finals = generateFinalRound(semis, 'div1');
    expect(finals).toHaveLength(2);
    // Championship: winners
    const championship = finals.find(m => m.finalsRound === 2)!;
    expect(championship.homeTeamId).toBe('t1');
    expect(championship.awayTeamId).toBe('t2');
    // 3rd place: losers
    const thirdPlace = finals.find(m => m.finalsRound === 3)!;
    expect(thirdPlace.homeTeamId).toBe('t4');
    expect(thirdPlace.awayTeamId).toBe('t3');
  });

  it('returns empty if fewer than 2 completed semis', () => {
    const semis = [
      makeSemi('t1', 't4', 25, 10),
    ];
    // Only 1 completed semi
    expect(generateFinalRound(semis, 'div1')).toHaveLength(0);
  });

  it('returns empty for no semis', () => {
    expect(generateFinalRound([], 'div1')).toHaveLength(0);
  });

  it('ignores non-completed semis', () => {
    const semis = [
      makeSemi('t1', 't4', 25, 10),
      { ...makeSemi('t2', 't3', 0, 0), status: 'in-progress' as const },
    ];
    expect(generateFinalRound(semis, 'div1')).toHaveLength(0);
  });

  it('on tied scores without any manual pick, no final round is generated', () => {
    const semis = [
      makeSemi('t1', 't4', 20, 20),
      makeSemi('t2', 't3', 25, 20),
    ];
    // A tie with no organizer decision must not silently pick a winner
    expect(generateFinalRound(semis, 'div1')).toHaveLength(0);
  });

  it('persisted manualWinnerId on the semi resolves the tie', () => {
    const semis = [
      { ...makeSemi('t1', 't4', 20, 20), manualWinnerId: 't4' },
      makeSemi('t2', 't3', 25, 20),
    ];
    const finals = generateFinalRound(semis, 'div1');
    const championship = finals.find(m => m.finalsRound === 2)!;
    expect([championship.homeTeamId, championship.awayTeamId]).toContain('t4');
    expect([championship.homeTeamId, championship.awayTeamId]).toContain('t2');
  });

  it('manual winner override resolves tied semi', () => {
    const semis = [
      makeSemi('t1', 't4', 20, 20),
      makeSemi('t2', 't3', 25, 20),
    ];
    const manualWinners = { [`semi-t1`]: 't1' }; // manually pick t1 as winner
    const finals = generateFinalRound(semis, 'div1', manualWinners);
    const championship = finals.find(m => m.finalsRound === 2)!;
    expect([championship.homeTeamId, championship.awayTeamId]).toContain('t1');
    expect([championship.homeTeamId, championship.awayTeamId]).toContain('t2');
    const thirdPlace = finals.find(m => m.finalsRound === 3)!;
    expect([thirdPlace.homeTeamId, thirdPlace.awayTeamId]).toContain('t4');
  });
});

describe('resolveMatchWinner', () => {
  function makeMatch(opts: Partial<Match> = {}): Match {
    return {
      id: 'm1', roundNumber: 1, homeTeamId: 'home', awayTeamId: 'away',
      homeScore: null, awayScore: null, courtNumber: 1, status: 'completed',
      divisionId: 'div1', isFinals: false, ...opts,
    };
  }

  it('returns null for null/undefined matches', () => {
    expect(resolveMatchWinner(null)).toBeNull();
    expect(resolveMatchWinner(undefined)).toBeNull();
  });

  it('returns null when the match is not completed', () => {
    expect(resolveMatchWinner(makeMatch({ status: 'scheduled', homeScore: 25, awayScore: 10 }))).toBeNull();
    expect(resolveMatchWinner(makeMatch({ status: 'in-progress', homeScore: 25, awayScore: 10 }))).toBeNull();
  });

  it('returns null when a score is missing', () => {
    expect(resolveMatchWinner(makeMatch({ homeScore: 25, awayScore: null }))).toBeNull();
    expect(resolveMatchWinner(makeMatch({ homeScore: null, awayScore: 10 }))).toBeNull();
  });

  it('returns the higher-scoring side', () => {
    expect(resolveMatchWinner(makeMatch({ homeScore: 25, awayScore: 10 }))).toBe('home');
    expect(resolveMatchWinner(makeMatch({ homeScore: 10, awayScore: 25 }))).toBe('away');
  });

  it('honors manualWinnerId only on a tie', () => {
    expect(resolveMatchWinner(makeMatch({ homeScore: 20, awayScore: 20, manualWinnerId: 'away' }))).toBe('away');
  });

  it('returns null for a tie with no manual pick', () => {
    expect(resolveMatchWinner(makeMatch({ homeScore: 20, awayScore: 20 }))).toBeNull();
  });
});
