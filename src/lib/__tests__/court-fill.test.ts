import { describe, it, expect } from 'vitest';
import { fillFreeCourts } from '../court-fill';
import type { Match } from '@/types/tournament';

function mk(id: string, home: string | null, away: string | null, status: Match['status'] = 'scheduled', round = 1): Match {
  return {
    id, roundNumber: round, homeTeamId: home, awayTeamId: away,
    homeScore: null, awayScore: null, courtNumber: 0, status, divisionId: 'd1', isFinals: false,
  };
}

describe('fillFreeCourts', () => {
  it('does NOT double-book: skips a future match sharing a team with a scheduled pooled match', () => {
    // 4 courts, current round has 2 scheduled matches; every future match reuses those teams.
    // (This is the exact double-booking repro the review found.)
    const pool = [mk('m1', '1', '4'), mk('m2', '2', '3')];
    const future = [mk('m3', '1', '3', 'scheduled', 2), mk('m4', '4', '2', 'scheduled', 2)];
    const out = fillFreeCourts(pool, future, new Set(), 4);
    expect(out.map(m => m.id)).toEqual(['m1', 'm2']); // nothing added — all future teams already seated
  });

  it('fills a free court after a regenerate while a match is live (Feature 4 preserved)', () => {
    const live = mk('live', 'A', 'B', 'in-progress', 0);
    const future = [mk('cd', 'C', 'D', 'scheduled', 1), mk('ef', 'E', 'F', 'scheduled', 1)];
    const out = fillFreeCourts([live], future, new Set(['A', 'B']), 2);
    expect(out.map(m => m.id)).toEqual(['live', 'cd']); // one free court -> next non-conflicting match
  });

  it('skips a future match whose team is live-busy, fills the next disjoint ones', () => {
    const live = mk('live', 'A', 'B', 'in-progress', 0);
    const future = [mk('ac', 'A', 'C', 'scheduled', 1), mk('de', 'D', 'E', 'scheduled', 1), mk('fg', 'F', 'G', 'scheduled', 1)];
    const out = fillFreeCourts([live], future, new Set(['A', 'B']), 3);
    expect(out.map(m => m.id)).toEqual(['live', 'de', 'fg']); // AC skipped (A busy), 2 free courts filled
  });

  it('is a no-op when the pool already fills every court', () => {
    const pool = [mk('m1', '1', '2'), mk('m2', '3', '4')];
    const future = [mk('m3', '5', '6', 'scheduled', 2)];
    const out = fillFreeCourts(pool, future, new Set(), 2);
    expect(out).toHaveLength(2);
  });

  it('never adds a match already in the pool', () => {
    const pool = [mk('m1', 'A', 'B')];
    const future = [mk('m1', 'A', 'B', 'scheduled', 1), mk('cd', 'C', 'D', 'scheduled', 1)];
    const out = fillFreeCourts(pool, future, new Set(), 2);
    expect(out.map(m => m.id)).toEqual(['m1', 'cd']); // m1 not duplicated; cd fills the free court
  });
});
