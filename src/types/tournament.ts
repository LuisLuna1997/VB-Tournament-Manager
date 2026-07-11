export type DivisionLevel = 'beginners' | 'intermediate' | 'advanced';
export type TournamentPhase = 'checkin' | 'round-robin' | 'finals' | 'complete';
export type MatchStatus = 'scheduled' | 'in-progress' | 'completed' | 'bye';
export type CheckinStatus = 'wip' | 'ready' | 'dropped';
export type PlayerStatus = 'unknown' | 'in' | 'out' | 'late';

export interface Player {
  id: string;
  name: string;
  teamId: string | null;
  divisionId: string;
  status: PlayerStatus;
  linkGroup: string | null; // players with same linkGroup move together
}

export interface Team {
  id: string;
  name: string;
  color: string;
  manager: string;
  playerIds: string[];
  divisionId: string;
  checkinStatus: CheckinStatus;
  maxGames: number | null; // null = unlimited (full round-robin)
  evadeTeamIds: string[]; // teams to avoid playing if possible
}

export interface Match {
  id: string;
  roundNumber: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  courtNumber: number;
  status: MatchStatus;
  divisionId: string;
  isFinals: boolean;
  finalsRound?: number;
  completedAt?: number;
  manualWinnerId?: string | null; // organizer-picked winner for tied finals matches
}

export interface Division {
  id: string;
  name: string;
  level: DivisionLevel;
  phase: TournamentPhase;
  courtCount: number;
  currentRound: number;
  advancingTeamCount: number;
  targetGames: number | null; // null = full round-robin (every team plays every other)
  courtNextUp?: Record<number, string>; // courtNumber -> matchId staged as next
  courtOverrides?: Record<string, number>; // matchId -> courtNumber pinned
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  divisions: Record<string, Division>;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  matches: Record<string, Match>;
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  teamColor: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  rank: number;
}
