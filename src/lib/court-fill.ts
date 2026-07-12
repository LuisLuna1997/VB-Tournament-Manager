import type { Match } from '@/types/tournament';

/**
 * When the current round can't fill every court (e.g. after a regenerate while a
 * match is live and the live match sits alone in round 0), pull the next
 * schedulable matches onto the free courts — Ready-first round-1 pairs included —
 * so no court sits idle. A team already seated on a court (live OR scheduled) is
 * never pulled onto a second court. No-op when the pool already fills the courts.
 */
export function fillFreeCourts(
  courtPool: Match[],
  futureScheduled: Match[],
  liveBusyTeamIds: Set<string>,
  courtCount: number,
): Match[] {
  const pool = [...courtPool];
  const inPool = new Set(pool.map(m => m.id));
  const busy = new Set(liveBusyTeamIds);
  // Every team already in the pool is occupying a court — can't take a second one.
  for (const m of pool) {
    if (m.homeTeamId) busy.add(m.homeTeamId);
    if (m.awayTeamId) busy.add(m.awayTeamId);
  }
  let free = courtCount - pool.length;
  for (const m of futureScheduled) {
    if (free <= 0) break;
    if (inPool.has(m.id)) continue;
    if ((m.homeTeamId && busy.has(m.homeTeamId)) || (m.awayTeamId && busy.has(m.awayTeamId))) continue;
    pool.push(m);
    inPool.add(m.id);
    if (m.homeTeamId) busy.add(m.homeTeamId);
    if (m.awayTeamId) busy.add(m.awayTeamId);
    free--;
  }
  return pool;
}
