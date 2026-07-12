import type { Match } from '@/types/tournament';
import { generateId } from './id';

const BYE = '__BYE__';

export interface RoundRobinOptions {
  teamIds: string[];
  courtCount: number;
  divisionId: string;
  preservedResults?: Map<string, { homeScore: number; awayScore: number }>;
  /** Hard per-team CEILINGS (team.maxGames) — a team never plays more than this. */
  teamMaxGames?: Map<string, number>;
  /**
   * Division FLOOR: every team plays AT LEAST this many games (bounded by its
   * ceiling and by n−1). When parity forces an odd total, a team plays
   * target+1 rather than target−1 — no team is ever left below the target.
   */
  targetGames?: number;
  /** Set of "teamA::teamB" (sorted) pairs to schedule last / cut first. */
  evadePairs?: Set<string>;
  /** Teams checked in & ready — prioritized onto the first courts (round 1). */
  readyTeamIds?: Set<string>;
}

function makeResultKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

function isEvaded(m: Match, evadePairs?: Set<string>): boolean {
  if (!evadePairs || evadePairs.size === 0) return false;
  if (!m.homeTeamId || !m.awayTeamId) return false;
  return evadePairs.has(makeResultKey(m.homeTeamId, m.awayTeamId));
}

function bothReady(m: Match, readyTeamIds?: Set<string>): boolean {
  if (!readyTeamIds || readyTeamIds.size === 0) return false;
  return !!m.homeTeamId && !!m.awayTeamId
    && readyTeamIds.has(m.homeTeamId) && readyTeamIds.has(m.awayTeamId);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Arrange the team list (adding a BYE sentinel when odd) so that the FIRST
 * round-1 court slots are Ready-vs-Ready. The circle method pairs mirror
 * positions (i, n−1−i) in round 1, and courts are assigned in slot order, so
 * placing Ready teams at the first mirror pairs makes Court 1 / Court 2 start
 * with Ready teams (Feature 4). Without readiness info this is just a shuffle.
 * The BYE sentinel is filled last so a WIP team — never a Ready team — sits out
 * round 1.
 */
export function arrangeTeams(teamIds: string[], readyTeamIds?: Set<string>, playedPairs?: Set<string>): string[] {
  const base = [...teamIds];
  const odd = base.length % 2 !== 0;
  const n = odd ? base.length + 1 : base.length;
  const half = n / 2;

  const isReady = (t: string) => !!readyTeamIds && readyTeamIds.has(t);
  const shuffledReady = shuffle(base.filter(isReady));
  const others = shuffle(base.filter(t => !isReady(t)));
  if (odd) others.push(BYE); // BYE fills last → pairs with a WIP in round 1

  // Pair up the Ready teams for round 1, PREFERRING pairs that haven't already
  // been played. On a regenerate mid-tournament, an already-played matchup is
  // stripped as a duplicate, so re-pairing it into round 1 would silently seat a
  // WIP match on the low courts instead. Greedy match avoids that.
  const readyPairs: [string, string][] = [];
  const used = new Set<string>();
  for (let i = 0; i < shuffledReady.length; i++) {
    if (used.has(shuffledReady[i])) continue;
    let partner = -1;
    let fallback = -1;
    for (let k = i + 1; k < shuffledReady.length; k++) {
      if (used.has(shuffledReady[k])) continue;
      if (fallback === -1) fallback = k;
      const key = [shuffledReady[i], shuffledReady[k]].sort().join('::');
      if (!playedPairs || !playedPairs.has(key)) { partner = k; break; }
    }
    const chosen = partner !== -1 ? partner : fallback;
    if (chosen === -1) break; // odd leftover Ready team, no partner
    used.add(shuffledReady[i]);
    used.add(shuffledReady[chosen]);
    readyPairs.push([shuffledReady[i], shuffledReady[chosen]]);
  }
  const leftoverReady = shuffledReady.filter(t => !used.has(t));

  const slots: (string | null)[] = new Array(n).fill(null);

  // Place the Ready pairs at the first mirror-pair indices so they land on the low courts.
  let j = 0;
  for (; j < half && j < readyPairs.length; j++) {
    slots[j] = readyPairs[j][0];
    slots[n - 1 - j] = readyPairs[j][1];
  }
  // Fill the rest: any leftover single Ready first (so it plays a WIP, not the BYE),
  // then the WIP/BYE pool. Fill mirror-pair by mirror-pair so the BYE (last) pairs
  // with the item just before it — a WIP.
  const fill = [...leftoverReady, ...others];
  let fi = 0;
  for (; j < half; j++) {
    slots[j] = fill[fi++];
    slots[n - 1 - j] = fill[fi++];
  }
  return slots as string[];
}

/**
 * Reorder whole rounds (rounds in the circle method are independent). Ready-heavy
 * rounds come first (so the Ready round stays round 1), evaded-heavy rounds last.
 * Round numbers are remapped to 1..k.
 */
function reorderRounds(matches: Match[], readyTeamIds?: Set<string>, evadePairs?: Set<string>): void {
  const readyCount = new Map<number, number>();
  const evadedCount = new Map<number, number>();
  const rounds = new Set<number>();
  for (const m of matches) {
    rounds.add(m.roundNumber);
    if (bothReady(m, readyTeamIds)) readyCount.set(m.roundNumber, (readyCount.get(m.roundNumber) ?? 0) + 1);
    if (isEvaded(m, evadePairs)) evadedCount.set(m.roundNumber, (evadedCount.get(m.roundNumber) ?? 0) + 1);
  }
  const ordered = Array.from(rounds).sort((a, b) => {
    const rd = (readyCount.get(b) ?? 0) - (readyCount.get(a) ?? 0); // ready DESC
    if (rd !== 0) return rd;
    const ed = (evadedCount.get(a) ?? 0) - (evadedCount.get(b) ?? 0); // evaded ASC
    if (ed !== 0) return ed;
    return a - b; // stable
  });
  const remap = new Map<number, number>();
  ordered.forEach((oldRound, idx) => remap.set(oldRound, idx + 1));
  for (const m of matches) {
    m.roundNumber = remap.get(m.roundNumber)!;
  }
}

/**
 * Reduce a full round-robin toward the target FLOOR while respecting hard
 * per-team ceilings. Completed games are locked (count toward degree, never
 * removed). Scheduled games are converted to (double-)BYEs, cutting evaded /
 * later-round / WIP-involving matches first, and NEVER cutting a match if it
 * would push either team below its floor. Round 1 is protected from floor
 * trimming so the Ready-first opening survives.
 */
function reduceToFloor(
  matches: Match[],
  teamIds: string[],
  teamMaxGames?: Map<string, number>,
  targetGames?: number,
  evadePairs?: Set<string>,
  readyTeamIds?: Set<string>,
): void {
  const hasCeilings = !!teamMaxGames && teamMaxGames.size > 0;
  if (targetGames == null && !hasCeilings) return; // full round-robin, nothing to do

  const nMinus1 = teamIds.length - 1;
  const ceilOf = (t: string) => Math.min(teamMaxGames?.get(t) ?? nMinus1, nMinus1);
  const floorOf = (t: string) => (targetGames == null ? ceilOf(t) : Math.min(targetGames, ceilOf(t)));

  const deg = new Map<string, number>();
  for (const t of teamIds) deg.set(t, 0);
  for (const m of matches) {
    if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
    deg.set(m.homeTeamId, (deg.get(m.homeTeamId) ?? 0) + 1);
    deg.set(m.awayTeamId, (deg.get(m.awayTeamId) ?? 0) + 1);
  }

  // Cut priority: evaded first, later rounds first, WIP-involving first. This
  // keeps early Ready-vs-Ready matches for last (they're cut only if unavoidable).
  const cutOrder = matches
    .filter(m => m.status === 'scheduled' && m.homeTeamId && m.awayTeamId)
    .sort((a, b) => {
      const ea = isEvaded(a, evadePairs) ? 1 : 0;
      const eb = isEvaded(b, evadePairs) ? 1 : 0;
      if (ea !== eb) return eb - ea;
      if (a.roundNumber !== b.roundNumber) return b.roundNumber - a.roundNumber;
      const ra = bothReady(a, readyTeamIds) ? 1 : 0;
      const rb = bothReady(b, readyTeamIds) ? 1 : 0;
      return ra - rb; // WIP-involving (0) before Ready-vs-Ready (1)
    });

  const removeMatch = (m: Match) => {
    deg.set(m.homeTeamId!, (deg.get(m.homeTeamId!) ?? 0) - 1);
    deg.set(m.awayTeamId!, (deg.get(m.awayTeamId!) ?? 0) - 1);
    m.status = 'bye';
    m.homeTeamId = null;
    m.awayTeamId = null;
  };

  // Phase 1 — enforce hard ceilings. Each step cut the removable edge that most
  // reduces excess without needless stranding: prefer edges where BOTH teams are
  // over their ceiling (one cut fixes two), then the pair with the most combined
  // slack above their floor, then evaded, then later rounds. Cutting a "both-over,
  // high-slack" edge avoids removing an edge a neighbor needed to reach its floor.
  const overCeil = (t: string) => (deg.get(t) ?? 0) > ceilOf(t);
  let guard = 0;
  while (guard++ < 100000) {
    let bestEdge: Match | null = null;
    let bestKey = -Infinity;
    for (const m of cutOrder) {
      if (m.status === 'bye') continue;
      const h = m.homeTeamId!;
      const a = m.awayTeamId!;
      if (!overCeil(h) && !overCeil(a)) continue; // this edge isn't needed for any ceiling
      const both = overCeil(h) && overCeil(a) ? 1 : 0;
      const slack = ((deg.get(h) ?? 0) - floorOf(h)) + ((deg.get(a) ?? 0) - floorOf(a));
      const evaded = isEvaded(m, evadePairs) ? 1 : 0;
      const key = both * 1e12 + slack * 1e6 + evaded * 1e3 + m.roundNumber;
      if (key > bestKey) { bestKey = key; bestEdge = m; }
    }
    if (!bestEdge) break;
    removeMatch(bestEdge);
  }

  // Phase 2 — trim excess down toward the floor. Only remove when BOTH teams stay
  // at or above their floor (never short a team), and never touch round 1.
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of cutOrder) {
      if (m.status === 'bye') continue;
      if (m.roundNumber === 1) continue; // protect the Ready-first opening
      if ((deg.get(m.homeTeamId!) ?? 0) > floorOf(m.homeTeamId!) && (deg.get(m.awayTeamId!) ?? 0) > floorOf(m.awayTeamId!)) {
        removeMatch(m);
        changed = true;
      }
    }
  }
}

function generateOnce(options: RoundRobinOptions): Match[] {
  const { teamIds, courtCount, divisionId, preservedResults, teamMaxGames, targetGames, evadePairs, readyTeamIds } = options;

  // Arrange so round 1's low courts are Ready-vs-Ready (adds a BYE when odd).
  // Pairs already played (on regenerate) are avoided so they aren't stripped.
  const playedPairs = preservedResults ? new Set(preservedResults.keys()) : undefined;
  const teams = arrangeTeams(teamIds, readyTeamIds, playedPairs);
  const n = teams.length;
  const matches: Match[] = [];
  let roundNumber = 1;

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];
      const isBye = home === BYE || away === BYE;
      const homeTeamId = home === BYE ? null : home;
      const awayTeamId = away === BYE ? null : away;

      const match: Match = {
        id: generateId(),
        roundNumber,
        homeTeamId,
        awayTeamId,
        homeScore: null,
        awayScore: null,
        courtNumber: 0, // assigned below
        status: isBye ? 'bye' : 'scheduled',
        divisionId,
        isFinals: false,
      };

      // Restore preserved results if available
      if (preservedResults && homeTeamId && awayTeamId) {
        const key = makeResultKey(homeTeamId, awayTeamId);
        const result = preservedResults.get(key);
        if (result) {
          // result.homeScore belongs to sorted-first team
          const sorted = [homeTeamId, awayTeamId].sort();
          const homeIsFirst = sorted[0] === homeTeamId;
          match.homeScore = homeIsFirst ? result.homeScore : result.awayScore;
          match.awayScore = homeIsFirst ? result.awayScore : result.homeScore;
          match.status = 'completed';
          match.completedAt = Date.now();
        }
      }

      matches.push(match);
    }
    roundNumber++;

    // Rotate: fix teams[0], move the last element to position 1 (circle method)
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  // Order rounds: Ready-first (round 1 stays the Ready round), evaded-last.
  reorderRounds(matches, readyTeamIds, evadePairs);

  // Trim toward the target floor / enforce ceilings (converts excess to byes).
  reduceToFloor(matches, teamIds, teamMaxGames, targetGames, evadePairs, readyTeamIds);

  // Remove double-BYE matches (both teams null)
  const filtered = matches.filter(m => m.homeTeamId !== null || m.awayTeamId !== null);

  // Remove rounds that have zero playable matches (only BYEs left)
  const roundPlayable = new Map<number, boolean>();
  for (const m of filtered) {
    if (m.status !== 'bye') {
      roundPlayable.set(m.roundNumber, true);
    } else if (!roundPlayable.has(m.roundNumber)) {
      roundPlayable.set(m.roundNumber, false);
    }
  }
  const kept = filtered.filter(m => roundPlayable.get(m.roundNumber) === true);

  // Assign courts per round: playable matches in slot order get courts 1..courtCount
  // (so round 1's Ready-vs-Ready matches, which are the lowest slots, take Court 1/2).
  const byRound = new Map<number, Match[]>();
  for (const m of kept) {
    if (!byRound.has(m.roundNumber)) byRound.set(m.roundNumber, []);
    byRound.get(m.roundNumber)!.push(m);
  }
  for (const roundMatches of byRound.values()) {
    const playable = roundMatches.filter(m => m.status !== 'bye');
    playable.forEach((m, idx) => {
      m.courtNumber = (idx % courtCount) + 1;
    });
  }

  return kept;
}

/**
 * Score a candidate schedule (higher = better). Shortfall — teams below their
 * floor — is by far the worst; then excess above the floor; then evaded matchups
 * kept. This drives the multi-attempt selection toward "everyone meets the
 * target, minimal overshoot, evaded pairs cut".
 */
function scoreSchedule(matches: Match[], options: RoundRobinOptions): number {
  const { teamIds, teamMaxGames, targetGames, evadePairs, readyTeamIds } = options;
  const nMinus1 = teamIds.length - 1;
  const deg = new Map<string, number>();
  for (const t of teamIds) deg.set(t, 0);
  let evadedKept = 0;
  let round1Ready = 0; // playable Ready-vs-Ready matches in round 1 (Feature 4 — more is better)
  for (const m of matches) {
    if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
    deg.set(m.homeTeamId, (deg.get(m.homeTeamId) ?? 0) + 1);
    deg.set(m.awayTeamId, (deg.get(m.awayTeamId) ?? 0) + 1);
    if (isEvaded(m, evadePairs)) evadedKept++;
    if (m.roundNumber === 1 && bothReady(m, readyTeamIds)) round1Ready++;
  }
  let shortfall = 0;
  let excess = 0;
  for (const t of teamIds) {
    const ceil = Math.min(teamMaxGames?.get(t) ?? nMinus1, nMinus1);
    const floor = targetGames == null ? ceil : Math.min(targetGames, ceil);
    const d = deg.get(t) ?? 0;
    if (d < floor) shortfall += floor - d;
    else excess += d - floor;
  }
  // Priority: fewest shortfall (worst) >> most Ready-vs-Ready on round 1's courts
  // (Feature 4) >> least excess >> fewest evaded kept.
  return -shortfall * 1_000_000_000 + round1Ready * 1_000_000 - excess * 1_000 - evadedKept;
}

export function generateRoundRobin(options: RoundRobinOptions): Match[] {
  if (options.teamIds.length < 2) return [];

  // Reduction (caps / a target floor) is shuffle-dependent and can strand teams,
  // and the Ready-first pairing also varies by shuffle — so when any of those
  // apply, generate several candidates and keep the best by scoreSchedule.
  const multiAttempt =
    options.targetGames != null ||
    (options.teamMaxGames != null && options.teamMaxGames.size > 0) ||
    (options.readyTeamIds != null && options.readyTeamIds.size > 0);
  const attempts = multiAttempt ? 16 : 1;

  let best: Match[] | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < attempts; i++) {
    const candidate = generateOnce(options);
    const score = scoreSchedule(candidate, options);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best ?? [];
}

export function collectPreservedResults(matches: Match[]): Map<string, { homeScore: number; awayScore: number }> {
  const results = new Map<string, { homeScore: number; awayScore: number }>();

  for (const match of matches) {
    if (
      match.status === 'completed' &&
      match.homeTeamId &&
      match.awayTeamId &&
      match.homeScore !== null &&
      match.awayScore !== null
    ) {
      const key = makeResultKey(match.homeTeamId, match.awayTeamId);
      // Store scores in sorted team order so restoration is unambiguous
      const sorted = [match.homeTeamId, match.awayTeamId].sort();
      const firstIsHome = sorted[0] === match.homeTeamId;
      results.set(key, {
        homeScore: firstIsHome ? match.homeScore : match.awayScore,
        awayScore: firstIsHome ? match.awayScore : match.homeScore,
      });
    }
  }

  return results;
}

export function getCompletedRoundCount(matches: Match[]): number {
  if (matches.length === 0) return 0;

  const rounds = new Map<number, Match[]>();
  for (const m of matches) {
    if (!rounds.has(m.roundNumber)) rounds.set(m.roundNumber, []);
    rounds.get(m.roundNumber)!.push(m);
  }

  let completed = 0;
  for (const [, roundMatches] of rounds) {
    const allDone = roundMatches.every(m => m.status === 'completed' || m.status === 'bye');
    if (allDone) completed++;
  }
  return completed;
}

export function getRoundsGrouped(matches: Match[]): Map<number, Match[]> {
  const rounds = new Map<number, Match[]>();
  for (const m of matches) {
    if (!rounds.has(m.roundNumber)) rounds.set(m.roundNumber, []);
    rounds.get(m.roundNumber)!.push(m);
  }
  return rounds;
}
