import { describe, it, expect, beforeEach } from 'vitest';
import { useTournamentStore } from '../tournament.store';

// Reset store before each test
beforeEach(() => {
  useTournamentStore.getState().resetTournament();
});

describe('Division actions', () => {
  it('addDivision creates with correct defaults and returns ID', () => {
    const store = useTournamentStore.getState();
    const id = store.addDivision('Advanced', 'advanced');
    const div = useTournamentStore.getState().tournament.divisions[id];
    expect(div).toBeDefined();
    expect(div.name).toBe('Advanced');
    expect(div.level).toBe('advanced');
    expect(div.phase).toBe('checkin');
    expect(div.courtCount).toBe(2);
    expect(div.currentRound).toBe(0);
    expect(div.advancingTeamCount).toBe(4);
    expect(div.targetGames).toBeNull();
  });

  it('first division auto-sets as active', () => {
    const store = useTournamentStore.getState();
    const id = store.addDivision('A', 'beginners');
    expect(useTournamentStore.getState().activeDivisionId).toBe(id);
  });

  it('second division does not change active', () => {
    const store = useTournamentStore.getState();
    const id1 = store.addDivision('A', 'beginners');
    store.addDivision('B', 'advanced');
    expect(useTournamentStore.getState().activeDivisionId).toBe(id1);
  });

  it('removeDivision cascades teams, players, matches', () => {
    const store = useTournamentStore.getState();
    const divId = store.addDivision('A', 'beginners');
    useTournamentStore.getState().addTeam(divId, 'Team1', '#F00', ['Alice', 'Bob']);
    const state = useTournamentStore.getState();
    expect(Object.keys(state.tournament.teams)).toHaveLength(1);
    expect(Object.keys(state.tournament.players)).toHaveLength(2);

    useTournamentStore.getState().removeDivision(divId);
    const after = useTournamentStore.getState();
    expect(Object.keys(after.tournament.divisions)).toHaveLength(0);
    expect(Object.keys(after.tournament.teams)).toHaveLength(0);
    expect(Object.keys(after.tournament.players)).toHaveLength(0);
  });

  it('removeDivision switches active to next', () => {
    const store = useTournamentStore.getState();
    const id1 = store.addDivision('A', 'beginners');
    const id2 = useTournamentStore.getState().addDivision('B', 'advanced');
    useTournamentStore.getState().removeDivision(id1);
    expect(useTournamentStore.getState().activeDivisionId).toBe(id2);
  });

  it('setTargetGames stores value', () => {
    const store = useTournamentStore.getState();
    const id = store.addDivision('A', 'beginners');
    useTournamentStore.getState().setTargetGames(id, 5);
    expect(useTournamentStore.getState().tournament.divisions[id].targetGames).toBe(5);
    useTournamentStore.getState().setTargetGames(id, null);
    expect(useTournamentStore.getState().tournament.divisions[id].targetGames).toBeNull();
  });
});

describe('Team actions', () => {
  let divId: string;

  beforeEach(() => {
    divId = useTournamentStore.getState().addDivision('A', 'beginners');
  });

  it('addTeam creates with wip status', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'Team1', '#F00');
    const team = useTournamentStore.getState().tournament.teams[teamId];
    expect(team.name).toBe('Team1');
    expect(team.color).toBe('#F00');
    expect(team.checkinStatus).toBe('wip');
    expect(team.maxGames).toBeNull();
    expect(team.playerIds).toHaveLength(0);
  });

  it('addTeam with playerNames creates players', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'Team1', '#F00', ['Alice', 'Bob', 'Charlie']);
    const team = useTournamentStore.getState().tournament.teams[teamId];
    expect(team.playerIds).toHaveLength(3);
    const players = useTournamentStore.getState().tournament.players;
    team.playerIds.forEach(pid => {
      expect(players[pid]).toBeDefined();
      expect(players[pid].teamId).toBe(teamId);
      expect(players[pid].divisionId).toBe(divId);
    });
  });

  it('addTeam with maxGames stores value', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'Late', '#F00', undefined, undefined, 3);
    expect(useTournamentStore.getState().tournament.teams[teamId].maxGames).toBe(3);
  });

  it('removeTeam makes players free agents', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'T', '#F00', ['Alice']);
    const playerIds = useTournamentStore.getState().tournament.teams[teamId].playerIds;
    useTournamentStore.getState().removeTeam(teamId);
    const state = useTournamentStore.getState();
    expect(state.tournament.teams[teamId]).toBeUndefined();
    // Player still exists but unassigned
    expect(state.tournament.players[playerIds[0]]).toBeDefined();
    expect(state.tournament.players[playerIds[0]].teamId).toBeNull();
  });

  it('updateTeamMaxGames updates value', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'T', '#F00');
    useTournamentStore.getState().updateTeamMaxGames(teamId, 5);
    expect(useTournamentStore.getState().tournament.teams[teamId].maxGames).toBe(5);
    useTournamentStore.getState().updateTeamMaxGames(teamId, null);
    expect(useTournamentStore.getState().tournament.teams[teamId].maxGames).toBeNull();
  });

  it('importTeams auto-sets ready when 6+ IN players', () => {
    const players = Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, status: 'in' }));
    useTournamentStore.getState().importTeams(divId, [
      { manager: 'Coach', teamName: 'Ready Team', color: 'red', players },
    ]);
    const teams = Object.values(useTournamentStore.getState().tournament.teams);
    const team = teams.find(t => t.name === 'Ready Team')!;
    expect(team.checkinStatus).toBe('ready');
  });

  it('importTeams sets wip when <6 IN players', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, status: 'in' }));
    useTournamentStore.getState().importTeams(divId, [
      { manager: 'Coach', teamName: 'WIP Team', color: 'blue', players },
    ]);
    const teams = Object.values(useTournamentStore.getState().tournament.teams);
    const team = teams.find(t => t.name === 'WIP Team')!;
    expect(team.checkinStatus).toBe('wip');
  });
});

describe('Player actions', () => {
  let divId: string;

  beforeEach(() => {
    divId = useTournamentStore.getState().addDivision('A', 'beginners');
  });

  it('addPlayer as free agent has null teamId', () => {
    const pid = useTournamentStore.getState().addPlayer(divId, 'Alice');
    const player = useTournamentStore.getState().tournament.players[pid];
    expect(player.teamId).toBeNull();
    expect(player.status).toBe('unknown');
  });

  it('addPlayer to team adds to playerIds', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'T', '#F00');
    const pid = useTournamentStore.getState().addPlayer(divId, 'Alice', teamId);
    const team = useTournamentStore.getState().tournament.teams[teamId];
    expect(team.playerIds).toContain(pid);
  });

  it('removePlayer removes from team playerIds', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'T', '#F00', ['Alice']);
    const pid = useTournamentStore.getState().tournament.teams[teamId].playerIds[0];
    useTournamentStore.getState().removePlayer(pid);
    const team = useTournamentStore.getState().tournament.teams[teamId];
    expect(team.playerIds).not.toContain(pid);
    expect(useTournamentStore.getState().tournament.players[pid]).toBeUndefined();
  });

  it('assignPlayerToTeam recalcs both teams', () => {
    const t1 = useTournamentStore.getState().addTeam(divId, 'T1', '#F00');
    const t2 = useTournamentStore.getState().addTeam(divId, 'T2', '#00F');
    // Add 6 IN players to T1 to make it ready
    for (let i = 0; i < 6; i++) {
      const pid = useTournamentStore.getState().addPlayer(divId, `P${i}`, t1);
      useTournamentStore.getState().updatePlayerStatus(pid, 'in');
    }
    expect(useTournamentStore.getState().tournament.teams[t1].checkinStatus).toBe('ready');
    // Move one player to T2
    const movePid = useTournamentStore.getState().tournament.teams[t1].playerIds[0];
    useTournamentStore.getState().assignPlayerToTeam(movePid, t2);
    // T1 now has 5 IN -> wip
    expect(useTournamentStore.getState().tournament.teams[t1].checkinStatus).toBe('wip');
  });

  it('removePlayerFromTeam recalcs team status', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'T', '#F00');
    for (let i = 0; i < 6; i++) {
      const pid = useTournamentStore.getState().addPlayer(divId, `P${i}`, teamId);
      useTournamentStore.getState().updatePlayerStatus(pid, 'in');
    }
    expect(useTournamentStore.getState().tournament.teams[teamId].checkinStatus).toBe('ready');
    const removePid = useTournamentStore.getState().tournament.teams[teamId].playerIds[0];
    useTournamentStore.getState().removePlayerFromTeam(removePid);
    expect(useTournamentStore.getState().tournament.teams[teamId].checkinStatus).toBe('wip');
  });

  it('updatePlayerStatus recalcs team: 5 IN = wip, 6 IN = ready', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'T', '#F00');
    const pids: string[] = [];
    for (let i = 0; i < 6; i++) {
      pids.push(useTournamentStore.getState().addPlayer(divId, `P${i}`, teamId));
    }
    // Set 5 to IN
    for (let i = 0; i < 5; i++) {
      useTournamentStore.getState().updatePlayerStatus(pids[i], 'in');
    }
    expect(useTournamentStore.getState().tournament.teams[teamId].checkinStatus).toBe('wip');
    // Set 6th to IN
    useTournamentStore.getState().updatePlayerStatus(pids[5], 'in');
    expect(useTournamentStore.getState().tournament.teams[teamId].checkinStatus).toBe('ready');
    // Set one back to OUT
    useTournamentStore.getState().updatePlayerStatus(pids[0], 'out');
    expect(useTournamentStore.getState().tournament.teams[teamId].checkinStatus).toBe('wip');
  });

  it('updatePlayerStatus on dropped team stays dropped', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'T', '#F00');
    const pid = useTournamentStore.getState().addPlayer(divId, 'P', teamId);
    useTournamentStore.getState().updateTeamStatus(teamId, 'dropped');
    useTournamentStore.getState().updatePlayerStatus(pid, 'in');
    expect(useTournamentStore.getState().tournament.teams[teamId].checkinStatus).toBe('dropped');
  });
});

describe('Schedule actions', () => {
  let divId: string;

  beforeEach(() => {
    divId = useTournamentStore.getState().addDivision('A', 'beginners');
    for (let i = 0; i < 4; i++) {
      useTournamentStore.getState().addTeam(divId, `Team${i}`, `#${i}${i}${i}`);
    }
  });

  it('generateSchedule creates matches and sets phase', () => {
    useTournamentStore.getState().generateSchedule(divId);
    const state = useTournamentStore.getState();
    expect(state.tournament.divisions[divId].phase).toBe('round-robin');
    const matches = Object.values(state.tournament.matches).filter(m => m.divisionId === divId);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('generateSchedule with <2 active teams is no-op', () => {
    // Remove 3 teams (leave 1)
    const teams = Object.values(useTournamentStore.getState().tournament.teams);
    teams.slice(0, 3).forEach(t => useTournamentStore.getState().removeTeam(t.id));
    useTournamentStore.getState().generateSchedule(divId);
    expect(useTournamentStore.getState().tournament.divisions[divId].phase).toBe('checkin');
  });

  it('regenerateSchedule preserves completed scores', () => {
    useTournamentStore.getState().generateSchedule(divId);
    const matches = Object.values(useTournamentStore.getState().tournament.matches);
    const firstMatch = matches.find(m => m.status === 'scheduled' && m.homeTeamId && m.awayTeamId)!;
    useTournamentStore.getState().startMatch(firstMatch.id);
    useTournamentStore.getState().updateScore(firstMatch.id, 25, 18);
    useTournamentStore.getState().completeMatch(firstMatch.id);

    const homeId = firstMatch.homeTeamId!;
    const awayId = firstMatch.awayTeamId!;

    useTournamentStore.getState().regenerateSchedule(divId);
    const newMatches = Object.values(useTournamentStore.getState().tournament.matches);
    const restored = newMatches.find(m =>
      (m.homeTeamId === homeId && m.awayTeamId === awayId) ||
      (m.homeTeamId === awayId && m.awayTeamId === homeId)
    );
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('completed');
    const scores = [restored!.homeScore, restored!.awayScore].sort();
    expect(scores).toEqual([18, 25]);
  });
});

describe('Scoring actions', () => {
  let divId: string;
  let matchId: string;

  beforeEach(() => {
    divId = useTournamentStore.getState().addDivision('A', 'beginners');
    for (let i = 0; i < 4; i++) {
      useTournamentStore.getState().addTeam(divId, `T${i}`, `#${i}${i}${i}`);
    }
    useTournamentStore.getState().generateSchedule(divId);
    const matches = Object.values(useTournamentStore.getState().tournament.matches);
    matchId = matches.find(m => m.status === 'scheduled' && m.homeTeamId && m.awayTeamId)!.id;
  });

  it('startMatch sets in-progress and initializes scores', () => {
    useTournamentStore.getState().startMatch(matchId);
    const m = useTournamentStore.getState().tournament.matches[matchId];
    expect(m.status).toBe('in-progress');
    expect(m.homeScore).toBe(0);
    expect(m.awayScore).toBe(0);
  });

  it('updateScore sets scores without changing status', () => {
    useTournamentStore.getState().startMatch(matchId);
    useTournamentStore.getState().updateScore(matchId, 15, 10);
    const m = useTournamentStore.getState().tournament.matches[matchId];
    expect(m.homeScore).toBe(15);
    expect(m.awayScore).toBe(10);
    expect(m.status).toBe('in-progress');
  });

  it('completeMatch sets completed with timestamp', () => {
    useTournamentStore.getState().startMatch(matchId);
    useTournamentStore.getState().completeMatch(matchId);
    const m = useTournamentStore.getState().tournament.matches[matchId];
    expect(m.status).toBe('completed');
    expect(m.completedAt).toBeDefined();
    expect(typeof m.completedAt).toBe('number');
  });

  it('resetMatch reverts to scheduled with null scores', () => {
    useTournamentStore.getState().startMatch(matchId);
    useTournamentStore.getState().updateScore(matchId, 25, 20);
    useTournamentStore.getState().completeMatch(matchId);
    useTournamentStore.getState().resetMatch(matchId);
    const m = useTournamentStore.getState().tournament.matches[matchId];
    expect(m.status).toBe('scheduled');
    expect(m.homeScore).toBeNull();
    expect(m.awayScore).toBeNull();
  });
});

describe('Finals actions', () => {
  let divId: string;

  beforeEach(() => {
    divId = useTournamentStore.getState().addDivision('A', 'beginners');
    for (let i = 0; i < 4; i++) {
      useTournamentStore.getState().addTeam(divId, `T${i}`, `#${i}${i}${i}`);
    }
  });

  it('startFinals with 2 creates single final', () => {
    // Need standings, so generate and complete a schedule
    useTournamentStore.getState().generateSchedule(divId);
    const matches = Object.values(useTournamentStore.getState().tournament.matches);
    matches.forEach(m => {
      if (m.status === 'scheduled' && m.homeTeamId && m.awayTeamId) {
        useTournamentStore.getState().startMatch(m.id);
        useTournamentStore.getState().updateScore(m.id, 25, 20);
        useTournamentStore.getState().completeMatch(m.id);
      }
    });
    useTournamentStore.getState().startFinals(divId, 2);
    const state = useTournamentStore.getState();
    expect(state.tournament.divisions[divId].phase).toBe('finals');
    const finals = Object.values(state.tournament.matches).filter(m => m.isFinals);
    expect(finals).toHaveLength(1);
  });
});

describe('Selectors', () => {
  let divId: string;

  beforeEach(() => {
    divId = useTournamentStore.getState().addDivision('A', 'beginners');
  });

  it('getActiveTeams excludes dropped', () => {
    const t1 = useTournamentStore.getState().addTeam(divId, 'T1', '#F00');
    const t2 = useTournamentStore.getState().addTeam(divId, 'T2', '#00F');
    useTournamentStore.getState().updateTeamStatus(t2, 'dropped');
    const active = useTournamentStore.getState().getActiveTeams(divId);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(t1);
  });

  it('getFreeAgents returns only unassigned players', () => {
    const teamId = useTournamentStore.getState().addTeam(divId, 'T', '#F00');
    useTournamentStore.getState().addPlayer(divId, 'Assigned', teamId);
    useTournamentStore.getState().addPlayer(divId, 'Free');
    const agents = useTournamentStore.getState().getFreeAgents(divId);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Free');
  });

  it('getNextAvailableColor returns first unused', () => {
    const c1 = useTournamentStore.getState().getNextAvailableColor(divId);
    useTournamentStore.getState().addTeam(divId, 'T1', c1);
    const c2 = useTournamentStore.getState().getNextAvailableColor(divId);
    expect(c2).not.toBe(c1);
  });
});

describe('Tournament actions', () => {
  it('resetTournament clears everything', () => {
    const store = useTournamentStore.getState();
    const divId = store.addDivision('A', 'beginners');
    useTournamentStore.getState().addTeam(divId, 'T', '#F00', ['P1']);
    useTournamentStore.getState().resetTournament();
    const state = useTournamentStore.getState();
    expect(Object.keys(state.tournament.divisions)).toHaveLength(0);
    expect(Object.keys(state.tournament.teams)).toHaveLength(0);
    expect(Object.keys(state.tournament.players)).toHaveLength(0);
    expect(state.activeDivisionId).toBeNull();
  });

  it('exportState returns valid JSON', () => {
    const store = useTournamentStore.getState();
    store.addDivision('A', 'beginners');
    const json = useTournamentStore.getState().exportState();
    const parsed = JSON.parse(json);
    expect(parsed.id).toBeDefined();
    expect(parsed.divisions).toBeDefined();
  });

  it('importState restores tournament', () => {
    const store = useTournamentStore.getState();
    const divId = store.addDivision('A', 'beginners');
    useTournamentStore.getState().addTeam(divId, 'T', '#F00');
    const json = useTournamentStore.getState().exportState();
    useTournamentStore.getState().resetTournament();
    const result = useTournamentStore.getState().importState(json);
    expect(result).toBe(true);
    expect(Object.keys(useTournamentStore.getState().tournament.teams)).toHaveLength(1);
  });

  it('importState returns false for invalid JSON', () => {
    expect(useTournamentStore.getState().importState('not json')).toBe(false);
    expect(useTournamentStore.getState().importState('{}')).toBe(false);
    expect(useTournamentStore.getState().importState('{"id":"x"}')).toBe(false);
  });
});

describe('Bug-fix regressions', () => {
  function setupDivisionWithTeams(teamNames: string[]) {
    const store = useTournamentStore.getState();
    const divId = store.addDivision('A', 'beginners');
    const teamIds = teamNames.map(n =>
      useTournamentStore.getState().addTeam(divId, n, '#F00')
    );
    return { divId, teamIds };
  }

  it('reopenMatch keeps the entered scores (Undo must not destroy results)', () => {
    const { divId } = setupDivisionWithTeams(['T1', 'T2']);
    useTournamentStore.getState().generateSchedule(divId);
    const match = useTournamentStore.getState().getRoundRobinMatches(divId)[0];
    useTournamentStore.getState().startMatch(match.id);
    useTournamentStore.getState().updateScore(match.id, 21, 15);
    useTournamentStore.getState().completeMatch(match.id);

    useTournamentStore.getState().reopenMatch(match.id);
    const reopened = useTournamentStore.getState().tournament.matches[match.id];
    expect(reopened.status).toBe('in-progress');
    expect(reopened.homeScore).toBe(21);
    expect(reopened.awayScore).toBe(15);
  });

  it('scoring actions on a missing matchId do not create corrupt entries', () => {
    setupDivisionWithTeams(['T1', 'T2']);
    const before = Object.keys(useTournamentStore.getState().tournament.matches).length;
    useTournamentStore.getState().updateScore('nonexistent', 1, 2);
    useTournamentStore.getState().startMatch('nonexistent');
    useTournamentStore.getState().completeMatch('nonexistent');
    useTournamentStore.getState().resetMatch('nonexistent');
    useTournamentStore.getState().reopenMatch('nonexistent');
    const after = Object.keys(useTournamentStore.getState().tournament.matches).length;
    expect(after).toBe(before);
    expect(useTournamentStore.getState().tournament.matches['nonexistent']).toBeUndefined();
  });

  it('dropTeam removes the team round-robin matches including completed results', () => {
    const { divId, teamIds } = setupDivisionWithTeams(['T1', 'T2', 'T3', 'T4']);
    useTournamentStore.getState().generateSchedule(divId);
    const matches = useTournamentStore.getState().getRoundRobinMatches(divId);
    const t1Match = matches.find(m => m.homeTeamId === teamIds[0] || m.awayTeamId === teamIds[0])!;
    useTournamentStore.getState().startMatch(t1Match.id);
    useTournamentStore.getState().updateScore(t1Match.id, 21, 10);
    useTournamentStore.getState().completeMatch(t1Match.id);

    useTournamentStore.getState().dropTeam(teamIds[0]);
    const after = useTournamentStore.getState();
    expect(after.tournament.teams[teamIds[0]].checkinStatus).toBe('dropped');
    const remaining = after.getRoundRobinMatches(divId);
    expect(remaining.some(m => m.homeTeamId === teamIds[0] || m.awayTeamId === teamIds[0])).toBe(false);
  });

  it('removeTeam cleans dangling evade references', () => {
    const { teamIds } = setupDivisionWithTeams(['T1', 'T2']);
    useTournamentStore.getState().toggleEvadeTeam(teamIds[0], teamIds[1]);
    expect(useTournamentStore.getState().tournament.teams[teamIds[0]].evadeTeamIds).toContain(teamIds[1]);
    useTournamentStore.getState().removeTeam(teamIds[1]);
    expect(useTournamentStore.getState().tournament.teams[teamIds[0]].evadeTeamIds).not.toContain(teamIds[1]);
  });

  it('removePlayer recalculates team check-in status', () => {
    const store = useTournamentStore.getState();
    const divId = store.addDivision('A', 'beginners');
    const teamId = useTournamentStore.getState().addTeam(
      divId, 'T1', '#F00', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
    );
    const players = Object.values(useTournamentStore.getState().tournament.players);
    for (const p of players) {
      useTournamentStore.getState().updatePlayerStatus(p.id, 'in');
    }
    expect(useTournamentStore.getState().tournament.teams[teamId].checkinStatus).toBe('ready');

    useTournamentStore.getState().removePlayer(players[0].id);
    expect(useTournamentStore.getState().tournament.teams[teamId].checkinStatus).toBe('wip');
  });

  it('importTeams assigns distinct auto colors within one batch', () => {
    const store = useTournamentStore.getState();
    const divId = store.addDivision('A', 'beginners');
    useTournamentStore.getState().importTeams(divId, [
      { manager: 'M1', teamName: 'T1', color: 'unknowncolor', players: [] },
      { manager: 'M2', teamName: 'T2', color: 'alsounknown', players: [] },
      { manager: 'M3', teamName: 'T3', color: '', players: [] },
    ]);
    const colors = Object.values(useTournamentStore.getState().tournament.teams).map(t => t.color);
    expect(new Set(colors).size).toBe(3);
  });

  it('startFinals twice does not duplicate bracket matches', () => {
    const { divId } = setupDivisionWithTeams(['T1', 'T2', 'T3', 'T4']);
    useTournamentStore.getState().generateSchedule(divId);
    for (const m of useTournamentStore.getState().getRoundRobinMatches(divId)) {
      if (m.status === 'bye') continue;
      useTournamentStore.getState().startMatch(m.id);
      useTournamentStore.getState().updateScore(m.id, 21, 10);
      useTournamentStore.getState().completeMatch(m.id);
    }
    useTournamentStore.getState().startFinals(divId, 4);
    expect(useTournamentStore.getState().getFinalsMatches(divId)).toHaveLength(2);
    useTournamentStore.getState().startFinals(divId, 4);
    expect(useTournamentStore.getState().getFinalsMatches(divId)).toHaveLength(2);
  });

  it('generateFinals persists manual tie-break winners and replaces stale final rounds', () => {
    const { divId } = setupDivisionWithTeams(['T1', 'T2', 'T3', 'T4']);
    useTournamentStore.getState().generateSchedule(divId);
    for (const m of useTournamentStore.getState().getRoundRobinMatches(divId)) {
      if (m.status === 'bye') continue;
      useTournamentStore.getState().startMatch(m.id);
      useTournamentStore.getState().updateScore(m.id, 21, 10);
      useTournamentStore.getState().completeMatch(m.id);
    }
    useTournamentStore.getState().startFinals(divId, 4);
    const semis = useTournamentStore.getState().getFinalsMatches(divId);

    // Complete one semi tied, resolve manually; complete the other decisively
    useTournamentStore.getState().startMatch(semis[0].id);
    useTournamentStore.getState().updateScore(semis[0].id, 20, 20);
    useTournamentStore.getState().completeMatch(semis[0].id);
    useTournamentStore.getState().startMatch(semis[1].id);
    useTournamentStore.getState().updateScore(semis[1].id, 25, 18);
    useTournamentStore.getState().completeMatch(semis[1].id);

    const pickedWinner = semis[0].awayTeamId!;
    useTournamentStore.getState().generateFinals(divId, { [semis[0].id]: pickedWinner });

    const finals = useTournamentStore.getState().getFinalsMatches(divId);
    const championship = finals.find(m => m.finalsRound === 2)!;
    expect(championship).toBeDefined();
    expect([championship.homeTeamId, championship.awayTeamId]).toContain(pickedWinner);
    // Manual pick persisted on the semi itself
    const semi0 = useTournamentStore.getState().tournament.matches[semis[0].id];
    expect(semi0.manualWinnerId).toBe(pickedWinner);

    // Regenerating replaces (not duplicates) the final round
    useTournamentStore.getState().generateFinals(divId);
    const finalsAfter = useTournamentStore.getState().getFinalsMatches(divId);
    expect(finalsAfter.filter(m => m.finalsRound === 2)).toHaveLength(1);
    expect(finalsAfter.filter(m => m.finalsRound === 3)).toHaveLength(1);
  });

  it('setManualWinner records the champion pick on a tied final', () => {
    const { divId } = setupDivisionWithTeams(['T1', 'T2']);
    useTournamentStore.getState().generateSchedule(divId);
    for (const m of useTournamentStore.getState().getRoundRobinMatches(divId)) {
      if (m.status === 'bye') continue;
      useTournamentStore.getState().startMatch(m.id);
      useTournamentStore.getState().updateScore(m.id, 21, 10);
      useTournamentStore.getState().completeMatch(m.id);
    }
    useTournamentStore.getState().startFinals(divId, 2);
    const final = useTournamentStore.getState().getFinalsMatches(divId)[0];
    useTournamentStore.getState().startMatch(final.id);
    useTournamentStore.getState().updateScore(final.id, 20, 20);
    useTournamentStore.getState().completeMatch(final.id);

    useTournamentStore.getState().setManualWinner(final.id, final.homeTeamId!);
    const updated = useTournamentStore.getState().tournament.matches[final.id];
    expect(updated.manualWinnerId).toBe(final.homeTeamId);
  });

  it('regenerateSchedule prunes stale courtNextUp and courtOverrides entries', () => {
    const { divId } = setupDivisionWithTeams(['T1', 'T2', 'T3', 'T4']);
    useTournamentStore.getState().generateSchedule(divId);
    const matches = useTournamentStore.getState().getRoundRobinMatches(divId);
    const scheduled = matches.find(m => m.status === 'scheduled')!;
    useTournamentStore.getState().setCourtNextUp(divId, { 1: scheduled.id });
    useTournamentStore.getState().setCourtOverrides(divId, { [scheduled.id]: 1 });

    useTournamentStore.getState().regenerateSchedule(divId);
    const div = useTournamentStore.getState().tournament.divisions[divId];
    // The old scheduled match was deleted and regenerated with a new ID,
    // so the stale references must be gone
    const newMatchIds = new Set(useTournamentStore.getState().getRoundRobinMatches(divId).map(m => m.id));
    for (const matchId of Object.values(div.courtNextUp ?? {})) {
      expect(newMatchIds.has(matchId)).toBe(true);
    }
    for (const matchId of Object.keys(div.courtOverrides ?? {})) {
      expect(newMatchIds.has(matchId)).toBe(true);
    }
  });

  it('importState rejects structurally broken tournaments', () => {
    const ok = useTournamentStore.getState().importState(JSON.stringify({
      id: 'x', name: 'Broken', date: '2026-01-01',
      divisions: { d1: { notADivision: true } },
      teams: {}, players: {}, matches: {},
    }));
    expect(ok).toBe(false);
  });

  it('importState accepts a valid exported tournament', () => {
    const { divId } = setupDivisionWithTeams(['T1', 'T2']);
    const json = useTournamentStore.getState().exportState();
    useTournamentStore.getState().resetTournament();
    const ok = useTournamentStore.getState().importState(json);
    expect(ok).toBe(true);
    expect(useTournamentStore.getState().tournament.divisions[divId]).toBeDefined();
  });
});

describe('Finals generation', () => {
  // Stand up a 4-team division, complete the round robin, and open a 4-team
  // bracket. Returns the two semis (finalsRound 1).
  function setupSemis() {
    const divId = useTournamentStore.getState().addDivision('A', 'beginners');
    for (let i = 0; i < 4; i++) {
      useTournamentStore.getState().addTeam(divId, `T${i}`, '#F00');
    }
    useTournamentStore.getState().generateSchedule(divId);
    for (const m of useTournamentStore.getState().getRoundRobinMatches(divId)) {
      if (m.status === 'bye') continue;
      useTournamentStore.getState().startMatch(m.id);
      useTournamentStore.getState().updateScore(m.id, 21, 10);
      useTournamentStore.getState().completeMatch(m.id);
    }
    useTournamentStore.getState().startFinals(divId, 4);
    const semis = useTournamentStore.getState().getFinalsMatches(divId);
    return { divId, semis };
  }

  function completeSemi(id: string, home: number, away: number) {
    useTournamentStore.getState().startMatch(id);
    useTournamentStore.getState().updateScore(id, home, away);
    useTournamentStore.getState().completeMatch(id);
  }

  it('routes decided-semi winners to the championship and losers to 3rd place', () => {
    const { divId, semis } = setupSemis();
    const winners = [semis[0].homeTeamId, semis[1].homeTeamId];
    const losers = [semis[0].awayTeamId, semis[1].awayTeamId];

    completeSemi(semis[0].id, 25, 10); // home wins
    completeSemi(semis[1].id, 25, 10); // home wins
    useTournamentStore.getState().generateFinals(divId);

    const finals = useTournamentStore.getState().getFinalsMatches(divId);
    const championship = finals.find(m => m.finalsRound === 2)!;
    const thirdPlace = finals.find(m => m.finalsRound === 3)!;
    expect([championship.homeTeamId, championship.awayTeamId].sort()).toEqual([...winners].sort());
    expect([thirdPlace.homeTeamId, thirdPlace.awayTeamId].sort()).toEqual([...losers].sort());
  });

  it('does not create a final round while a tied semi is unresolved', () => {
    const { divId, semis } = setupSemis();
    completeSemi(semis[0].id, 20, 20); // tied, no manual pick
    completeSemi(semis[1].id, 25, 18); // decided

    useTournamentStore.getState().generateFinals(divId);

    const finals = useTournamentStore.getState().getFinalsMatches(divId);
    expect(finals.filter(m => (m.finalsRound ?? 0) >= 2)).toHaveLength(0);
    expect(finals.filter(m => m.finalsRound === 1)).toHaveLength(2); // semis intact
  });
});
