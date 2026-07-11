import type { Match, TeamStanding } from '@/types/tournament';
import { generateId } from './id';

// Winner of a completed match, honoring the organizer's manual pick for ties.
// Returns null if the match isn't completed or is tied with no manual pick.
export function resolveMatchWinner(match: Match | null | undefined): string | null {
  if (!match || match.status !== 'completed') return null;
  if (match.homeScore === null || match.awayScore === null) return null;
  if (match.homeScore === match.awayScore) return match.manualWinnerId ?? null;
  return match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId;
}

export function generateBracket(
  standings: TeamStanding[],
  advancingCount: number,
  divisionId: string
): Match[] {
  const advancing = standings.slice(0, advancingCount);
  const matches: Match[] = [];

  if (advancingCount === 2) {
    // Simple final: #1 vs #2
    matches.push({
      id: generateId(),
      roundNumber: 1,
      homeTeamId: advancing[0].teamId,
      awayTeamId: advancing[1].teamId,
      homeScore: null,
      awayScore: null,
      courtNumber: 1,
      status: 'scheduled',
      divisionId,
      isFinals: true,
      finalsRound: 1,
    });
  } else if (advancingCount === 4) {
    // Semis: #1 vs #4, #2 vs #3
    matches.push({
      id: generateId(),
      roundNumber: 1,
      homeTeamId: advancing[0].teamId,
      awayTeamId: advancing[3].teamId,
      homeScore: null,
      awayScore: null,
      courtNumber: 1,
      status: 'scheduled',
      divisionId,
      isFinals: true,
      finalsRound: 1,
    });
    matches.push({
      id: generateId(),
      roundNumber: 1,
      homeTeamId: advancing[1].teamId,
      awayTeamId: advancing[2].teamId,
      homeScore: null,
      awayScore: null,
      courtNumber: 2,
      status: 'scheduled',
      divisionId,
      isFinals: true,
      finalsRound: 1,
    });
    // Final and 3rd place are generated after semis complete
  }

  return matches;
}

export function generateFinalRound(
  semiMatches: Match[],
  divisionId: string,
  manualWinners?: Record<string, string> // matchId -> winnerId (for ties)
): Match[] {
  const completedSemis = semiMatches.filter(m => m.status === 'completed');
  if (completedSemis.length !== 2) return [];

  const winners: string[] = [];
  const losers: string[] = [];

  for (const match of completedSemis) {
    const isTied = match.homeScore === match.awayScore;
    let winnerId: string;

    const manualPick = manualWinners?.[match.id] ?? match.manualWinnerId ?? null;
    if (isTied && manualPick) {
      winnerId = manualPick;
    } else if (isTied) {
      // Tied with no manual pick — cannot derive a winner
      return [];
    } else if (match.homeScore! > match.awayScore!) {
      winnerId = match.homeTeamId!;
    } else {
      winnerId = match.awayTeamId!;
    }

    const loserId = winnerId === match.homeTeamId ? match.awayTeamId! : match.homeTeamId!;
    winners.push(winnerId);
    losers.push(loserId);
  }

  return [
    {
      id: generateId(),
      roundNumber: 2,
      homeTeamId: winners[0],
      awayTeamId: winners[1],
      homeScore: null,
      awayScore: null,
      courtNumber: 1,
      status: 'scheduled',
      divisionId,
      isFinals: true,
      finalsRound: 2, // Championship
    },
    {
      id: generateId(),
      roundNumber: 2,
      homeTeamId: losers[0],
      awayTeamId: losers[1],
      homeScore: null,
      awayScore: null,
      courtNumber: 2,
      status: 'scheduled',
      divisionId,
      isFinals: true,
      finalsRound: 3, // 3rd place
    },
  ];
}
