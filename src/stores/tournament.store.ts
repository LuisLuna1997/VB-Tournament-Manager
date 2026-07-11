import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Tournament,
  Division,
  Team,
  Player,
  Match,
  DivisionLevel,
  TournamentPhase,
  CheckinStatus,
  TeamStanding,
} from '@/types/tournament';
import { generateId } from '@/lib/id';
import { TEAM_COLORS, resolveColorName } from '@/lib/colors';
import { generateRoundRobin, collectPreservedResults } from '@/lib/round-robin';
import { computeStandings } from '@/lib/standings';
import { generateBracket, generateFinalRound } from '@/lib/bracket';

function buildTeamMaxGames(activeTeams: Team[], division: Division): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of activeTeams) {
    // Per-team override takes priority, then division-level target
    const cap = t.maxGames ?? division.targetGames;
    if (cap != null) map.set(t.id, cap);
  }
  return map;
}

function buildEvadePairs(activeTeams: Team[]): Set<string> {
  const pairs = new Set<string>();
  for (const team of activeTeams) {
    for (const evadeId of (team.evadeTeamIds ?? [])) {
      pairs.add([team.id, evadeId].sort().join('::'));
    }
  }
  return pairs;
}

function recalcTeamStatus(team: Team, players: Record<string, Player>): CheckinStatus {
  if (team.checkinStatus === 'dropped') return 'dropped';
  const inCount = team.playerIds.filter(pid => players[pid]?.status === 'in').length;
  return inCount >= 6 ? 'ready' : 'wip';
}

// Strip courtNextUp / courtOverrides entries that point at matches which no
// longer exist (e.g. after a regeneration or team removal)
function pruneCourtRefs(
  divisions: Record<string, Division>,
  matches: Record<string, Match>
): Record<string, Division> {
  const result = { ...divisions };
  for (const [divId, div] of Object.entries(result)) {
    let changed = false;
    let courtNextUp = div.courtNextUp;
    let courtOverrides = div.courtOverrides;

    if (courtNextUp) {
      const pruned: Record<number, string> = {};
      for (const [court, matchId] of Object.entries(courtNextUp)) {
        if (matches[matchId]) pruned[Number(court)] = matchId;
        else changed = true;
      }
      courtNextUp = pruned;
    }
    if (courtOverrides) {
      const pruned: Record<string, number> = {};
      for (const [matchId, court] of Object.entries(courtOverrides)) {
        if (matches[matchId]) pruned[matchId] = court;
        else changed = true;
      }
      courtOverrides = pruned;
    }
    if (changed) {
      result[divId] = { ...div, courtNextUp, courtOverrides };
    }
  }
  return result;
}

// Structural validation for imported tournament JSON — catches files with the
// right top-level keys but broken shapes before they corrupt the store
function isValidTournament(t: unknown): t is Tournament {
  if (!t || typeof t !== 'object') return false;
  const obj = t as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.name !== 'string') return false;
  for (const key of ['divisions', 'teams', 'players', 'matches'] as const) {
    if (!obj[key] || typeof obj[key] !== 'object' || Array.isArray(obj[key])) return false;
  }
  const divisions = obj.divisions as Record<string, unknown>;
  for (const d of Object.values(divisions)) {
    const div = d as Record<string, unknown>;
    if (typeof div?.id !== 'string' || typeof div?.name !== 'string' || typeof div?.phase !== 'string') return false;
  }
  const teams = obj.teams as Record<string, unknown>;
  for (const team of Object.values(teams)) {
    const tm = team as Record<string, unknown>;
    if (typeof tm?.id !== 'string' || typeof tm?.divisionId !== 'string' || !Array.isArray(tm?.playerIds)) return false;
  }
  const matches = obj.matches as Record<string, unknown>;
  for (const m of Object.values(matches)) {
    const match = m as Record<string, unknown>;
    if (typeof match?.id !== 'string' || typeof match?.divisionId !== 'string' || typeof match?.status !== 'string') return false;
  }
  const players = obj.players as Record<string, unknown>;
  for (const p of Object.values(players)) {
    const player = p as Record<string, unknown>;
    if (typeof player?.id !== 'string' || typeof player?.divisionId !== 'string') return false;
  }
  return true;
}

function createEmptyTournament(): Tournament {
  return {
    id: generateId(),
    name: 'Tournament',
    date: new Date().toISOString().split('T')[0],
    divisions: {},
    teams: {},
    players: {},
    matches: {},
  };
}

interface TournamentState {
  tournament: Tournament;
  activeDivisionId: string | null;

  // Division actions
  addDivision: (name: string, level: DivisionLevel) => string;
  removeDivision: (divisionId: string) => void;
  setActiveDivision: (divisionId: string | null) => void;
  updateDivisionCourtCount: (divisionId: string, count: number) => void;
  setTargetGames: (divisionId: string, target: number | null) => void;
  setCourtNextUp: (divisionId: string, courtNextUp: Record<number, string>) => void;
  setCourtOverrides: (divisionId: string, courtOverrides: Record<string, number>) => void;

  // Team actions
  addTeam: (divisionId: string, name: string, color: string, playerNames?: string[], manager?: string, maxGames?: number | null) => string;
  removeTeam: (teamId: string) => void;
  dropTeam: (teamId: string) => void;
  updateTeamName: (teamId: string, name: string) => void;
  updateTeamColor: (teamId: string, color: string) => void;
  updateTeamManager: (teamId: string, manager: string) => void;
  updateTeamStatus: (teamId: string, status: CheckinStatus) => void;
  updateTeamMaxGames: (teamId: string, maxGames: number | null) => void;
  toggleEvadeTeam: (teamId: string, evadeTeamId: string) => void;
  importTeams: (divisionId: string, rows: { manager: string; teamName: string; color: string; players: { name: string; status: string; linkGroup?: string | null }[] }[]) => void;

  // Player actions
  addPlayer: (divisionId: string, name: string, teamId?: string) => string;
  removePlayer: (playerId: string) => void;
  assignPlayerToTeam: (playerId: string, teamId: string) => void;
  removePlayerFromTeam: (playerId: string) => void;
  updatePlayerStatus: (playerId: string, status: import('@/types/tournament').PlayerStatus) => void;
  setPlayerLinkGroup: (playerId: string, linkGroup: string | null) => void;

  // Schedule actions
  replaceMatches: (divisionId: string, newMatches: Match[]) => void;
  generateSchedule: (divisionId: string) => void;
  regenerateSchedule: (divisionId: string) => void;
  advancePhase: (divisionId: string, phase: TournamentPhase) => void;

  // Scoring actions
  updateScore: (matchId: string, homeScore: number, awayScore: number) => void;
  completeMatch: (matchId: string) => void;
  startMatch: (matchId: string, courtNumber?: number) => void;
  reopenMatch: (matchId: string) => void;
  resetMatch: (matchId: string) => void;
  setManualWinner: (matchId: string, teamId: string) => void;

  // Finals actions
  startFinals: (divisionId: string, advancingCount: number) => void;
  generateFinals: (divisionId: string, manualWinners?: Record<string, string>) => void;

  // Selectors
  getTeamsForDivision: (divisionId: string) => Team[];
  getPlayersForDivision: (divisionId: string) => Player[];
  getFreeAgents: (divisionId: string) => Player[];
  getMatchesForDivision: (divisionId: string) => Match[];
  getRoundRobinMatches: (divisionId: string) => Match[];
  getFinalsMatches: (divisionId: string) => Match[];
  getStandings: (divisionId: string) => TeamStanding[];
  getActiveTeams: (divisionId: string) => Team[];
  getNextAvailableColor: (divisionId: string) => string;

  // Tournament actions
  resetTournament: () => void;
  setTournamentName: (name: string) => void;
  exportState: () => string;
  importState: (json: string) => boolean;
}

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => ({
      tournament: createEmptyTournament(),
      activeDivisionId: null,

      // --- Division actions ---
      addDivision: (name, level) => {
        const id = generateId();
        const division: Division = {
          id,
          name,
          level,
          phase: 'checkin',
          courtCount: 2,
          currentRound: 0,
          advancingTeamCount: 4,
          targetGames: null,
        };
        set(state => ({
          tournament: {
            ...state.tournament,
            divisions: { ...state.tournament.divisions, [id]: division },
          },
          activeDivisionId: state.activeDivisionId ?? id,
        }));
        return id;
      },

      removeDivision: (divisionId) => {
        set(state => {
          const divisions = { ...state.tournament.divisions };
          delete divisions[divisionId];

          // Remove teams, players, matches for this division
          const teams = { ...state.tournament.teams };
          const players = { ...state.tournament.players };
          const matches = { ...state.tournament.matches };

          for (const [id, team] of Object.entries(teams)) {
            if (team.divisionId === divisionId) delete teams[id];
          }
          for (const [id, player] of Object.entries(players)) {
            if (player.divisionId === divisionId) delete players[id];
          }
          for (const [id, match] of Object.entries(matches)) {
            if (match.divisionId === divisionId) delete matches[id];
          }

          const divisionIds = Object.keys(divisions);
          return {
            tournament: { ...state.tournament, divisions, teams, players, matches },
            activeDivisionId:
              state.activeDivisionId === divisionId
                ? divisionIds[0] ?? null
                : state.activeDivisionId,
          };
        });
      },

      setActiveDivision: (divisionId) => set({ activeDivisionId: divisionId }),

      updateDivisionCourtCount: (divisionId, count) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            divisions: {
              ...state.tournament.divisions,
              [divisionId]: { ...state.tournament.divisions[divisionId], courtCount: count },
            },
          },
        }));
      },

      setTargetGames: (divisionId, target) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            divisions: {
              ...state.tournament.divisions,
              [divisionId]: { ...state.tournament.divisions[divisionId], targetGames: target },
            },
          },
        }));
      },

      setCourtNextUp: (divisionId, courtNextUp) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            divisions: {
              ...state.tournament.divisions,
              [divisionId]: { ...state.tournament.divisions[divisionId], courtNextUp },
            },
          },
        }));
      },

      setCourtOverrides: (divisionId, courtOverrides) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            divisions: {
              ...state.tournament.divisions,
              [divisionId]: { ...state.tournament.divisions[divisionId], courtOverrides },
            },
          },
        }));
      },

      // --- Team actions ---
      addTeam: (divisionId, name, color, playerNames, manager, maxGames) => {
        const teamId = generateId();
        const playerIds: string[] = [];
        const newPlayers: Record<string, Player> = {};

        if (playerNames) {
          for (const pName of playerNames) {
            if (pName.trim()) {
              const pid = generateId();
              playerIds.push(pid);
              newPlayers[pid] = {
                id: pid,
                name: pName.trim(),
                teamId,
                divisionId,
                status: 'unknown',
                linkGroup: null,
              };
            }
          }
        }

        const team: Team = {
          id: teamId,
          name,
          color,
          manager: manager?.trim() ?? '',
          playerIds,
          divisionId,
          checkinStatus: 'wip',
          maxGames: maxGames ?? null,
          evadeTeamIds: [],
        };

        set(state => ({
          tournament: {
            ...state.tournament,
            teams: { ...state.tournament.teams, [teamId]: team },
            players: { ...state.tournament.players, ...newPlayers },
          },
        }));
        return teamId;
      },

      removeTeam: (teamId) => {
        set(state => {
          const team = state.tournament.teams[teamId];
          if (!team) return state;

          const teams = { ...state.tournament.teams };
          delete teams[teamId];
          const players = { ...state.tournament.players };

          // Unassign players (make them free agents) instead of deleting
          for (const pid of team.playerIds) {
            if (players[pid]) {
              players[pid] = { ...players[pid], teamId: null };
            }
          }

          // Remove dangling evade references on other teams
          for (const [id, t] of Object.entries(teams)) {
            if (t.evadeTeamIds?.includes(teamId)) {
              teams[id] = { ...t, evadeTeamIds: t.evadeTeamIds.filter(eid => eid !== teamId) };
            }
          }

          // Remove matches involving this team
          const matches = { ...state.tournament.matches };
          for (const [id, match] of Object.entries(matches)) {
            if (match.homeTeamId === teamId || match.awayTeamId === teamId) {
              delete matches[id];
            }
          }

          const divisions = pruneCourtRefs(state.tournament.divisions, matches);

          return {
            tournament: { ...state.tournament, teams, players, matches, divisions },
          };
        });
      },

      // Drop a team mid-tournament: marks it dropped and removes its
      // round-robin matches (including completed results, as the drop
      // dialog states). Finals matches are untouched.
      dropTeam: (teamId) => {
        set(state => {
          const team = state.tournament.teams[teamId];
          if (!team) return state;

          const teams = {
            ...state.tournament.teams,
            [teamId]: { ...team, checkinStatus: 'dropped' as const },
          };

          const matches = { ...state.tournament.matches };
          for (const [id, match] of Object.entries(matches)) {
            if (match.isFinals) continue;
            if (match.homeTeamId === teamId || match.awayTeamId === teamId) {
              delete matches[id];
            }
          }

          const divisions = pruneCourtRefs(state.tournament.divisions, matches);

          return {
            tournament: { ...state.tournament, teams, matches, divisions },
          };
        });
      },

      updateTeamName: (teamId, name) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            teams: {
              ...state.tournament.teams,
              [teamId]: { ...state.tournament.teams[teamId], name },
            },
          },
        }));
      },

      updateTeamColor: (teamId, color) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            teams: {
              ...state.tournament.teams,
              [teamId]: { ...state.tournament.teams[teamId], color },
            },
          },
        }));
      },

      updateTeamManager: (teamId, manager) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            teams: {
              ...state.tournament.teams,
              [teamId]: { ...state.tournament.teams[teamId], manager },
            },
          },
        }));
      },

      importTeams: (divisionId, rows) => {
        set(state => {
          const newTeams = { ...state.tournament.teams };
          const newPlayers = { ...state.tournament.players };

          // Track colors in use (including teams created earlier in this same
          // import) so auto-assigned colors don't all collapse to the same one
          const usedColors = new Set(
            Object.values(newTeams)
              .filter(t => t.divisionId === divisionId)
              .map(t => t.color.toUpperCase())
          );
          const nextAvailableColor = () => {
            const available = TEAM_COLORS.find(c => !usedColors.has(c.hex.toUpperCase()));
            return available?.hex ?? TEAM_COLORS[0].hex;
          };

          for (const row of rows) {
            const teamId = generateId();
            const playerIds: string[] = [];
            let inCount = 0;

            for (const p of row.players) {
              if (p.name.trim()) {
                const pid = generateId();
                playerIds.push(pid);
                const pStatus = (['in', 'out', 'late'].includes(p.status) ? p.status : 'unknown') as 'in' | 'out' | 'late' | 'unknown';
                newPlayers[pid] = { id: pid, name: p.name.trim(), teamId, divisionId, status: pStatus, linkGroup: p.linkGroup ?? null };
                if (pStatus === 'in') inCount++;
              }
            }

            // Resolve color name to hex
            const colorHex = resolveColorName(row.color) ?? nextAvailableColor();
            usedColors.add(colorHex.toUpperCase());

            // Auto-set to ready if 6+ players are IN
            const checkinStatus = inCount >= 6 ? 'ready' as const : 'wip' as const;

            newTeams[teamId] = {
              id: teamId,
              name: row.teamName.trim(),
              color: colorHex,
              manager: row.manager.trim(),
              playerIds,
              divisionId,
              checkinStatus,
              maxGames: null,
              evadeTeamIds: [],
            };
          }

          return {
            tournament: { ...state.tournament, teams: newTeams, players: newPlayers },
          };
        });
      },

      updateTeamStatus: (teamId, status) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            teams: {
              ...state.tournament.teams,
              [teamId]: { ...state.tournament.teams[teamId], checkinStatus: status },
            },
          },
        }));
      },

      updateTeamMaxGames: (teamId, maxGames) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            teams: {
              ...state.tournament.teams,
              [teamId]: { ...state.tournament.teams[teamId], maxGames },
            },
          },
        }));
      },

      toggleEvadeTeam: (teamId, evadeTeamId) => {
        set(state => {
          const team = state.tournament.teams[teamId];
          if (!team) return state;
          const evadeTeamIds = team.evadeTeamIds ?? [];
          const has = evadeTeamIds.includes(evadeTeamId);
          return {
            tournament: {
              ...state.tournament,
              teams: {
                ...state.tournament.teams,
                [teamId]: {
                  ...team,
                  evadeTeamIds: has
                    ? evadeTeamIds.filter(id => id !== evadeTeamId)
                    : [...evadeTeamIds, evadeTeamId],
                },
              },
            },
          };
        });
      },

      // --- Player actions ---
      addPlayer: (divisionId, name, teamId) => {
        const id = generateId();
        const player: Player = {
          id,
          name: name.trim(),
          teamId: teamId ?? null,
          divisionId,
          status: 'unknown',
          linkGroup: null,
        };

        set(state => {
          const newState = {
            tournament: {
              ...state.tournament,
              players: { ...state.tournament.players, [id]: player },
            },
          };

          // Add to team's playerIds if assigned
          if (teamId && newState.tournament.teams[teamId]) {
            newState.tournament.teams = {
              ...newState.tournament.teams,
              [teamId]: {
                ...newState.tournament.teams[teamId],
                playerIds: [...newState.tournament.teams[teamId].playerIds, id],
              },
            };
          }

          return newState;
        });
        return id;
      },

      removePlayer: (playerId) => {
        set(state => {
          const player = state.tournament.players[playerId];
          if (!player) return state;

          const players = { ...state.tournament.players };
          delete players[playerId];
          const teams = { ...state.tournament.teams };

          if (player.teamId && teams[player.teamId]) {
            teams[player.teamId] = {
              ...teams[player.teamId],
              playerIds: teams[player.teamId].playerIds.filter(id => id !== playerId),
            };
            // Removing a checked-in player can drop the team below 6 "in"
            teams[player.teamId] = {
              ...teams[player.teamId],
              checkinStatus: recalcTeamStatus(teams[player.teamId], players),
            };
          }

          return { tournament: { ...state.tournament, players, teams } };
        });
      },

      assignPlayerToTeam: (playerId, teamId) => {
        set(state => {
          const player = state.tournament.players[playerId];
          if (!player) return state;

          const teams = { ...state.tournament.teams };
          const players = { ...state.tournament.players };

          // Collect all players to move (linked group moves together)
          const playerIdsToMove = [playerId];
          if (player.linkGroup) {
            for (const [pid, p] of Object.entries(players)) {
              if (pid !== playerId && p.linkGroup === player.linkGroup && p.divisionId === player.divisionId) {
                playerIdsToMove.push(pid);
              }
            }
          }

          const affectedTeamIds = new Set<string>();

          for (const pid of playerIdsToMove) {
            const p = players[pid];
            if (!p) continue;

            // Remove from old team
            const oldTeamId = p.teamId;
            if (oldTeamId && teams[oldTeamId]) {
              teams[oldTeamId] = {
                ...teams[oldTeamId],
                playerIds: teams[oldTeamId].playerIds.filter(id => id !== pid),
              };
              affectedTeamIds.add(oldTeamId);
            }

            // Add to new team
            if (teams[teamId]) {
              teams[teamId] = {
                ...teams[teamId],
                playerIds: [...teams[teamId].playerIds, pid],
              };
            }

            players[pid] = { ...p, teamId };
          }

          affectedTeamIds.add(teamId);

          // Recalc all affected teams
          for (const tid of affectedTeamIds) {
            if (teams[tid]) {
              teams[tid] = { ...teams[tid], checkinStatus: recalcTeamStatus(teams[tid], players) };
            }
          }

          return { tournament: { ...state.tournament, teams, players } };
        });
      },

      removePlayerFromTeam: (playerId) => {
        set(state => {
          const player = state.tournament.players[playerId];
          if (!player || !player.teamId) return state;

          const oldTeamId = player.teamId;
          const teams = { ...state.tournament.teams };
          const players = { ...state.tournament.players };

          if (teams[oldTeamId]) {
            teams[oldTeamId] = {
              ...teams[oldTeamId],
              playerIds: teams[oldTeamId].playerIds.filter(id => id !== playerId),
            };
          }

          players[playerId] = { ...player, teamId: null };

          // Recalc team status
          if (teams[oldTeamId]) {
            teams[oldTeamId] = { ...teams[oldTeamId], checkinStatus: recalcTeamStatus(teams[oldTeamId], players) };
          }

          return { tournament: { ...state.tournament, teams, players } };
        });
      },

      updatePlayerStatus: (playerId, status) => {
        set(state => {
          const player = state.tournament.players[playerId];
          if (!player) return state;

          const players = {
            ...state.tournament.players,
            [playerId]: { ...player, status },
          };

          const teams = { ...state.tournament.teams };
          if (player.teamId && teams[player.teamId]) {
            teams[player.teamId] = { ...teams[player.teamId], checkinStatus: recalcTeamStatus(teams[player.teamId], players) };
          }

          return { tournament: { ...state.tournament, players, teams } };
        });
      },

      setPlayerLinkGroup: (playerId, linkGroup) => {
        set(state => {
          if (!state.tournament.players[playerId]) return state;
          return {
            tournament: {
              ...state.tournament,
              players: {
                ...state.tournament.players,
                [playerId]: { ...state.tournament.players[playerId], linkGroup },
              },
            },
          };
        });
      },

      // --- Schedule actions ---
      replaceMatches: (divisionId, newMatches) => {
        set(state => {
          const matches = { ...state.tournament.matches };
          // Remove existing round-robin matches for this division
          for (const [id, m] of Object.entries(matches)) {
            if (m.divisionId === divisionId && !m.isFinals) delete matches[id];
          }
          // Add new ones
          for (const m of newMatches) {
            matches[m.id] = m;
          }
          return { tournament: { ...state.tournament, matches } };
        });
      },

      generateSchedule: (divisionId) => {
        const state = get();
        const activeTeams = Object.values(state.tournament.teams).filter(
          t => t.divisionId === divisionId && t.checkinStatus !== 'dropped'
        );
        const division = state.tournament.divisions[divisionId];
        if (!division || activeTeams.length < 2) return;

        const teamMaxGames = buildTeamMaxGames(activeTeams, division);

        const evadePairs = buildEvadePairs(activeTeams);

        const matches = generateRoundRobin({
          teamIds: activeTeams.map(t => t.id),
          courtCount: division.courtCount,
          divisionId,
          teamMaxGames: teamMaxGames.size > 0 ? teamMaxGames : undefined,
          evadePairs: evadePairs.size > 0 ? evadePairs : undefined,
        });

        const matchMap: Record<string, Match> = {};
        for (const m of matches) {
          matchMap[m.id] = m;
        }

        set(state => ({
          tournament: {
            ...state.tournament,
            matches: { ...state.tournament.matches, ...matchMap },
            divisions: {
              ...state.tournament.divisions,
              [divisionId]: {
                ...state.tournament.divisions[divisionId],
                phase: 'round-robin',
                currentRound: 1,
              },
            },
          },
        }));
      },

      regenerateSchedule: (divisionId) => {
        const state = get();
        const division = state.tournament.divisions[divisionId];
        if (!division) return;

        const existingMatches = Object.values(state.tournament.matches).filter(
          m => m.divisionId === divisionId && !m.isFinals
        );

        // Preserve completed results for the regenerator
        const preserved = collectPreservedResults(existingMatches);

        // Keep completed and in-progress matches, only remove scheduled ones
        const matches = { ...state.tournament.matches };
        for (const [id, m] of Object.entries(matches)) {
          if (m.divisionId === divisionId && !m.isFinals && m.status === 'scheduled') {
            delete matches[id];
          }
          // Also remove bye matches (they'll be regenerated)
          if (m.divisionId === divisionId && !m.isFinals && m.status === 'bye') {
            delete matches[id];
          }
        }

        // Generate new schedule
        const activeTeams = Object.values(state.tournament.teams).filter(
          t => t.divisionId === divisionId && t.checkinStatus !== 'dropped'
        );

        if (activeTeams.length < 2) {
          set(state => ({
            tournament: {
              ...state.tournament,
              matches,
              divisions: pruneCourtRefs(state.tournament.divisions, matches),
            },
          }));
          return;
        }

        // Also count in-progress matches as "preserved" so they count toward game limits
        for (const m of existingMatches) {
          if (m.status === 'in-progress' && m.homeTeamId && m.awayTeamId) {
            const key = [m.homeTeamId, m.awayTeamId].sort().join('::');
            if (!preserved.has(key)) {
              const sorted = [m.homeTeamId, m.awayTeamId].sort();
              const firstIsHome = sorted[0] === m.homeTeamId;
              preserved.set(key, {
                homeScore: firstIsHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0),
                awayScore: firstIsHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0),
              });
            }
          }
        }

        const teamMaxGames = buildTeamMaxGames(activeTeams, division);
        const evadePairs = buildEvadePairs(activeTeams);

        const newMatches = generateRoundRobin({
          teamIds: activeTeams.map(t => t.id),
          courtCount: division.courtCount,
          divisionId,
          preservedResults: preserved,
          teamMaxGames: teamMaxGames.size > 0 ? teamMaxGames : undefined,
          evadePairs: evadePairs.size > 0 ? evadePairs : undefined,
        });

        // Only add back matches that aren't already kept (completed/in-progress)
        const keptPairs = new Set<string>();
        for (const [, m] of Object.entries(matches)) {
          if (m.divisionId === divisionId && !m.isFinals && m.homeTeamId && m.awayTeamId) {
            keptPairs.add([m.homeTeamId, m.awayTeamId].sort().join('::'));
          }
        }

        for (const m of newMatches) {
          // Skip if this matchup is already kept (completed or in-progress)
          if (m.homeTeamId && m.awayTeamId) {
            const pair = [m.homeTeamId, m.awayTeamId].sort().join('::');
            if (keptPairs.has(pair)) continue;
          }
          matches[m.id] = m;
        }

        // Ensure in-progress matches are in the earliest round so Courts view finds them
        for (const [id, m] of Object.entries(matches)) {
          if (m.divisionId === divisionId && !m.isFinals && m.status === 'in-progress') {
            matches[id] = { ...m, roundNumber: 0 }; // round 0 = always "current"
          }
        }

        set(state => {
          // Drop staged next-up / court-pin entries pointing at removed matches
          const divisions = pruneCourtRefs(state.tournament.divisions, matches);
          return {
            tournament: {
              ...state.tournament,
              matches,
              divisions: {
                ...divisions,
                [divisionId]: {
                  ...divisions[divisionId],
                  currentRound: 1,
                },
              },
            },
          };
        });
      },

      advancePhase: (divisionId, phase) => {
        set(state => ({
          tournament: {
            ...state.tournament,
            divisions: {
              ...state.tournament.divisions,
              [divisionId]: {
                ...state.tournament.divisions[divisionId],
                phase,
              },
            },
          },
        }));
      },

      // --- Scoring actions ---
      updateScore: (matchId, homeScore, awayScore) => {
        set(state => {
          if (!state.tournament.matches[matchId]) return state;
          return {
            tournament: {
              ...state.tournament,
              matches: {
                ...state.tournament.matches,
                [matchId]: {
                  ...state.tournament.matches[matchId],
                  homeScore,
                  awayScore,
                },
              },
            },
          };
        });
      },

      startMatch: (matchId, courtNumber) => {
        set(state => {
          if (!state.tournament.matches[matchId]) return state;
          return {
            tournament: {
              ...state.tournament,
              matches: {
                ...state.tournament.matches,
                [matchId]: {
                  ...state.tournament.matches[matchId],
                  status: 'in-progress',
                  homeScore: state.tournament.matches[matchId].homeScore ?? 0,
                  awayScore: state.tournament.matches[matchId].awayScore ?? 0,
                  ...(courtNumber != null ? { courtNumber } : {}),
                },
              },
            },
          };
        });
      },

      completeMatch: (matchId) => {
        set(state => {
          if (!state.tournament.matches[matchId]) return state;
          return {
            tournament: {
              ...state.tournament,
              matches: {
                ...state.tournament.matches,
                [matchId]: {
                  ...state.tournament.matches[matchId],
                  status: 'completed',
                  completedAt: Date.now(),
                },
              },
            },
          };
        });
      },

      // Reopen a completed match for correction — scores are kept
      reopenMatch: (matchId) => {
        set(state => {
          if (!state.tournament.matches[matchId]) return state;
          return {
            tournament: {
              ...state.tournament,
              matches: {
                ...state.tournament.matches,
                [matchId]: {
                  ...state.tournament.matches[matchId],
                  status: 'in-progress',
                  completedAt: undefined,
                  manualWinnerId: undefined,
                },
              },
            },
          };
        });
      },

      resetMatch: (matchId) => {
        set(state => {
          if (!state.tournament.matches[matchId]) return state;
          return {
            tournament: {
              ...state.tournament,
              matches: {
                ...state.tournament.matches,
                [matchId]: {
                  ...state.tournament.matches[matchId],
                  status: 'scheduled',
                  homeScore: null,
                  awayScore: null,
                  completedAt: undefined,
                  manualWinnerId: undefined,
                },
              },
            },
          };
        });
      },

      setManualWinner: (matchId, teamId) => {
        set(state => {
          if (!state.tournament.matches[matchId]) return state;
          return {
            tournament: {
              ...state.tournament,
              matches: {
                ...state.tournament.matches,
                [matchId]: {
                  ...state.tournament.matches[matchId],
                  manualWinnerId: teamId,
                },
              },
            },
          };
        });
      },

      // --- Finals actions ---
      startFinals: (divisionId, advancingCount) => {
        const standings = get().getStandings(divisionId);

        if (standings.length < advancingCount) return;

        const finalsMatches = generateBracket(standings, advancingCount, divisionId);
        const matchMap: Record<string, Match> = {};
        for (const m of finalsMatches) {
          matchMap[m.id] = m;
        }

        set(state => {
          // Remove any finals matches from a previous bracket so re-starting
          // finals never produces duplicates
          const matches = { ...state.tournament.matches };
          for (const [id, m] of Object.entries(matches)) {
            if (m.divisionId === divisionId && m.isFinals) delete matches[id];
          }
          return {
            tournament: {
              ...state.tournament,
              matches: { ...matches, ...matchMap },
              divisions: {
                ...state.tournament.divisions,
                [divisionId]: {
                  ...state.tournament.divisions[divisionId],
                  phase: 'finals',
                  advancingTeamCount: advancingCount,
                },
              },
            },
          };
        });
      },

      generateFinals: (divisionId, manualWinners) => {
        const state = get();
        const finalsMatches = Object.values(state.tournament.matches).filter(
          m => m.divisionId === divisionId && m.isFinals
        );

        const semiMatches = finalsMatches.filter(m => m.finalsRound === 1).map(m => {
          // Persist organizer tie-break picks on the semi itself
          const pick = manualWinners?.[m.id];
          return pick ? { ...m, manualWinnerId: pick } : m;
        });
        const finalRoundMatches = generateFinalRound(semiMatches, divisionId, manualWinners);

        if (finalRoundMatches.length === 0) return;

        const matchMap: Record<string, Match> = {};
        for (const m of semiMatches) {
          matchMap[m.id] = m;
        }
        for (const m of finalRoundMatches) {
          matchMap[m.id] = m;
        }

        set(state => {
          // Replace any existing final-round matches (regeneration after a
          // semi result was corrected) instead of stacking duplicates
          const matches = { ...state.tournament.matches };
          for (const [id, m] of Object.entries(matches)) {
            if (m.divisionId === divisionId && m.isFinals && (m.finalsRound ?? 0) >= 2) {
              delete matches[id];
            }
          }
          return {
            tournament: {
              ...state.tournament,
              matches: { ...matches, ...matchMap },
            },
          };
        });
      },

      // --- Selectors ---
      getTeamsForDivision: (divisionId) => {
        return Object.values(get().tournament.teams).filter(t => t.divisionId === divisionId);
      },

      getPlayersForDivision: (divisionId) => {
        return Object.values(get().tournament.players).filter(p => p.divisionId === divisionId);
      },

      getFreeAgents: (divisionId) => {
        return Object.values(get().tournament.players).filter(
          p => p.divisionId === divisionId && !p.teamId
        );
      },

      getMatchesForDivision: (divisionId) => {
        return Object.values(get().tournament.matches).filter(m => m.divisionId === divisionId);
      },

      getRoundRobinMatches: (divisionId) => {
        return Object.values(get().tournament.matches).filter(
          m => m.divisionId === divisionId && !m.isFinals
        );
      },

      getFinalsMatches: (divisionId) => {
        return Object.values(get().tournament.matches).filter(
          m => m.divisionId === divisionId && m.isFinals
        );
      },

      getStandings: (divisionId) => {
        return computeStandings(
          Object.values(get().tournament.matches),
          get().tournament.teams,
          divisionId
        );
      },

      getActiveTeams: (divisionId) => {
        return Object.values(get().tournament.teams).filter(
          t => t.divisionId === divisionId && t.checkinStatus !== 'dropped'
        );
      },

      getNextAvailableColor: (divisionId) => {
        const usedColors = new Set(
          Object.values(get().tournament.teams)
            .filter(t => t.divisionId === divisionId)
            .map(t => t.color.toUpperCase())
        );
        const available = TEAM_COLORS.find(c => !usedColors.has(c.hex.toUpperCase()));
        return available?.hex ?? TEAM_COLORS[0].hex;
      },

      // --- Tournament actions ---
      resetTournament: () => {
        set({
          tournament: createEmptyTournament(),
          activeDivisionId: null,
        });
      },

      setTournamentName: (name) => {
        set(state => ({
          tournament: { ...state.tournament, name },
        }));
      },

      exportState: () => {
        return JSON.stringify(get().tournament, null, 2);
      },

      importState: (json) => {
        try {
          const tournament = JSON.parse(json) as Tournament;
          if (!isValidTournament(tournament)) return false;
          const divisionIds = Object.keys(tournament.divisions);
          set({
            tournament,
            activeDivisionId: divisionIds[0] ?? null,
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'vb-tournament',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Identity migration: without this, a future version bump would silently
      // discard the persisted tournament. Add per-version transforms here.
      migrate: (persistedState) => persistedState as { tournament: Tournament; activeDivisionId: string | null },
      partialize: (state) => ({
        tournament: state.tournament,
        activeDivisionId: state.activeDivisionId,
      }),
    }
  )
);
