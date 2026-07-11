import type { Match } from '@/types/tournament';
import { generateId } from './id';

const BYE = '__BYE__';

export interface RoundRobinOptions {
  teamIds: string[];
  courtCount: number;
  divisionId: string;
  preservedResults?: Map<string, { homeScore: number; awayScore: number }>;
  teamMaxGames?: Map<string, number>; // teamId -> max games allowed
  evadePairs?: Set<string>; // set of "teamA::teamB" (sorted) pairs to schedule last
}

function makeResultKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

function isEvaded(m: Match, evadePairs?: Set<string>): boolean {
  if (!evadePairs || evadePairs.size === 0) return false;
  if (!m.homeTeamId || !m.awayTeamId) return false;
  return evadePairs.has(makeResultKey(m.homeTeamId, m.awayTeamId));
}

function generateOnce(options: RoundRobinOptions): Match[] {
  const { teamIds, courtCount, divisionId, preservedResults, teamMaxGames, evadePairs } = options;

  // Shuffle team order so regeneration produces different round arrangements
  const teams = [...teamIds];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  if (teams.length % 2 !== 0) {
    teams.push(BYE);
  }

  const n = teams.length;
  const matches: Match[] = [];
  let roundNumber = 1;

  for (let round = 0; round < n - 1; round++) {
    const roundMatches: Match[] = [];

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

      roundMatches.push(match);
    }

    matches.push(...roundMatches);
    roundNumber++;

    // Rotate: fix teams[0], rotate teams[1..n-1]
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  // Schedule evaded pairs last: rounds are independent, so reorder whole rounds so
  // those containing evaded matchups land latest. (Individual matches can't move
  // between rounds — every team plays in every round of a circle-method rotation.)
  if (evadePairs && evadePairs.size > 0) {
    const evadedCountByRound = new Map<number, number>();
    for (const m of matches) {
      const count = evadedCountByRound.get(m.roundNumber) ?? 0;
      evadedCountByRound.set(m.roundNumber, count + (isEvaded(m, evadePairs) ? 1 : 0));
    }
    const orderedRounds = Array.from(evadedCountByRound.keys()).sort((a, b) => {
      const diff = (evadedCountByRound.get(a) ?? 0) - (evadedCountByRound.get(b) ?? 0);
      return diff !== 0 ? diff : a - b;
    });
    const roundRemap = new Map<number, number>();
    orderedRounds.forEach((oldRound, idx) => roundRemap.set(oldRound, idx + 1));
    for (const m of matches) {
      m.roundNumber = roundRemap.get(m.roundNumber)!;
    }
  }

  // Enforce maxGames: convert excess scheduled matches to BYEs for capped teams.
  // Non-evaded matches are processed first so evaded ones get cut preferentially.
  if (teamMaxGames && teamMaxGames.size > 0) {
    // Count completed/preserved games first — they always count toward caps
    const gameCounts = new Map<string, number>();
    for (const m of matches) {
      if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
      if (m.status === 'completed') {
        gameCounts.set(m.homeTeamId, (gameCounts.get(m.homeTeamId) ?? 0) + 1);
        gameCounts.set(m.awayTeamId, (gameCounts.get(m.awayTeamId) ?? 0) + 1);
      }
    }

    const scheduled = matches
      .filter(m => m.status === 'scheduled' && m.homeTeamId && m.awayTeamId)
      .sort((a, b) => a.roundNumber - b.roundNumber);
    const nonEvaded = scheduled.filter(m => !isEvaded(m, evadePairs));
    const evaded = scheduled.filter(m => isEvaded(m, evadePairs));

    for (const m of [...nonEvaded, ...evaded]) {
      const homeMax = teamMaxGames.get(m.homeTeamId!);
      const awayMax = teamMaxGames.get(m.awayTeamId!);
      const homeCount = gameCounts.get(m.homeTeamId!) ?? 0;
      const awayCount = gameCounts.get(m.awayTeamId!) ?? 0;
      const homeOver = typeof homeMax === 'number' && homeCount >= homeMax;
      const awayOver = typeof awayMax === 'number' && awayCount >= awayMax;

      if (homeOver && awayOver) {
        // Both teams are at max, convert to double-BYE (skip match)
        m.status = 'bye';
        m.homeTeamId = null;
        m.awayTeamId = null;
      } else if (homeOver) {
        // Home team hit max, give away team a BYE
        m.status = 'bye';
        m.homeTeamId = m.awayTeamId;
        m.awayTeamId = null;
      } else if (awayOver) {
        // Away team hit max, give home team a BYE
        m.status = 'bye';
        m.awayTeamId = null;
      } else {
        // Both under limit, count them
        gameCounts.set(m.homeTeamId!, homeCount + 1);
        gameCounts.set(m.awayTeamId!, awayCount + 1);
      }
    }
  }

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

  // Assign courts per round: only non-bye matches get court numbers
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

function scoreSchedule(matches: Match[], evadePairs?: Set<string>): number {
  let playable = 0;
  let evadedKept = 0;
  for (const m of matches) {
    if (m.status === 'bye') continue;
    playable++;
    if (isEvaded(m, evadePairs)) evadedKept++;
  }
  // Maximize games played; among equals, prefer schedules keeping fewer evaded matchups
  return playable * 1000 - evadedKept;
}

export function generateRoundRobin(options: RoundRobinOptions): Match[] {
  if (options.teamIds.length < 2) return [];

  // With game caps, the greedy cut pass is shuffle-dependent and can strand teams
  // below their cap. Generate several candidates and keep the best one.
  const attempts = options.teamMaxGames && options.teamMaxGames.size > 0 ? 8 : 1;

  let best: Match[] | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < attempts; i++) {
    const candidate = generateOnce(options);
    const score = scoreSchedule(candidate, options.evadePairs);
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
