import { describe, it, expect } from 'vitest';
import { generateRoundRobin } from '../round-robin';
import type { Match } from '@/types/tournament';

// Structural invariants that MUST hold for every generated schedule, checked
// across a broad sweep of random configurations (team count, courts, target
// floor, per-team ceilings, readiness). This is the adversarial guard for the
// scheduler rewrite.

function degrees(matches: Match[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const m of matches) {
    if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
    d.set(m.homeTeamId, (d.get(m.homeTeamId) ?? 0) + 1);
    d.set(m.awayTeamId, (d.get(m.awayTeamId) ?? 0) + 1);
  }
  return d;
}

// A tiny seeded PRNG so failures are reproducible (avoids Math.random noise).
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe('round-robin structural invariants (property sweep)', () => {
  it('holds all invariants across many random configs', () => {
    const rng = makeRng(12345);
    for (let iter = 0; iter < 400; iter++) {
      const n = 2 + Math.floor(rng() * 9); // 2..10 teams
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      const courtCount = 1 + Math.floor(rng() * 3); // 1..3

      // Optional target floor (~2/3 of the time)
      const useTarget = rng() < 0.66;
      const targetGames = useTarget ? 1 + Math.floor(rng() * (n - 1)) : undefined; // 1..n-1

      // Optional per-team ceilings (~1/3 of the time), on a subset
      const teamMaxGames = new Map<string, number>();
      if (rng() < 0.33) {
        for (const id of ids) {
          if (rng() < 0.4) teamMaxGames.set(id, 1 + Math.floor(rng() * (n - 1)));
        }
      }

      // Optional readiness subset
      const readyTeamIds = new Set<string>();
      if (rng() < 0.5) {
        for (const id of ids) if (rng() < 0.6) readyTeamIds.add(id);
      }

      const matches = generateRoundRobin({
        teamIds: ids,
        courtCount,
        divisionId: 'd1',
        targetGames,
        teamMaxGames: teamMaxGames.size ? teamMaxGames : undefined,
        readyTeamIds: readyTeamIds.size ? readyTeamIds : undefined,
      });

      const ctx = `iter=${iter} n=${n} courts=${courtCount} target=${targetGames}`;
      const playable = matches.filter(m => m.status !== 'bye');

      // 1. No team plays itself.
      for (const m of playable) expect(m.homeTeamId, ctx).not.toBe(m.awayTeamId);

      // 2. Court numbers within range.
      for (const m of playable) {
        expect(m.courtNumber, ctx).toBeGreaterThanOrEqual(1);
        expect(m.courtNumber, ctx).toBeLessThanOrEqual(courtCount);
      }

      // 3. No team is double-booked within a round; no court is reused within a
      //    single "wave" is NOT required (courts cycle), but a team must appear
      //    at most once per round.
      const perRoundTeams = new Map<number, Set<string>>();
      for (const m of playable) {
        if (!perRoundTeams.has(m.roundNumber)) perRoundTeams.set(m.roundNumber, new Set());
        const set = perRoundTeams.get(m.roundNumber)!;
        for (const tid of [m.homeTeamId!, m.awayTeamId!]) {
          expect(set.has(tid), `${ctx} team ${tid} twice in round ${m.roundNumber}`).toBe(false);
          set.add(tid);
        }
      }

      // 4. No pair plays more than once.
      const pairSeen = new Set<string>();
      for (const m of playable) {
        const key = [m.homeTeamId!, m.awayTeamId!].sort().join('::');
        expect(pairSeen.has(key), `${ctx} duplicate pair ${key}`).toBe(false);
        pairSeen.add(key);
      }

      const deg = degrees(matches);

      // 5. Ceilings never exceeded.
      for (const [id, cap] of teamMaxGames) {
        expect(deg.get(id) ?? 0, `${ctx} ${id} over ceiling`).toBeLessThanOrEqual(cap);
      }

      // 6. Floor met: absent hard ceilings, every team plays >= min(target, n-1).
      //    (A hard per-team ceiling can force a neighbor below the target — that's
      //    "ceiling wins over floor" — so this is only guaranteed with no ceilings.)
      if (targetGames != null && teamMaxGames.size === 0) {
        for (const id of ids) {
          const floor = Math.min(targetGames, n - 1);
          expect(deg.get(id) ?? 0, `${ctx} ${id} below floor ${floor}`).toBeGreaterThanOrEqual(floor);
        }
      }

      // 7. Ready-first: when at least `courtCount` disjoint Ready-vs-Ready pairs
      //    exist (and no hard ceilings, which can force cutting a round-1 match),
      //    the first match on each of courts 1..courtCount in round 1 is Ready-vs-Ready.
      const readyCount = ids.filter(id => readyTeamIds.has(id)).length;
      const readyPairsAvailable = Math.floor(readyCount / 2);
      if (readyPairsAvailable >= courtCount && teamMaxGames.size === 0) {
        for (let court = 1; court <= courtCount; court++) {
          const first = matches.find(m => m.roundNumber === 1 && m.status !== 'bye' && m.courtNumber === court);
          expect(first, `${ctx} no round1 court ${court}`).toBeDefined();
          const ok = !!first && readyTeamIds.has(first.homeTeamId!) && readyTeamIds.has(first.awayTeamId!);
          expect(ok, `${ctx} court ${court} round1 not Ready-vs-Ready`).toBe(true);
        }
      }
    }
  });
});
