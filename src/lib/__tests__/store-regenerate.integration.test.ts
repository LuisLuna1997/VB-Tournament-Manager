import { describe, it, expect, beforeEach } from 'vitest';
import { useTournamentStore } from '@/stores/tournament.store';

function pairKey(a: string | null, b: string | null) {
  return [a, b].sort().join('::');
}

describe('store regenerate probes', () => {
  beforeEach(() => {
    useTournamentStore.getState().resetTournament();
  });

  function setup(teamNames: string[]) {
    const store = useTournamentStore.getState();
    const divId = store.addDivision('A', 'beginners');
    const teamIds = teamNames.map(n => useTournamentStore.getState().addTeam(divId, n, '#F00'));
    return { divId, teamIds };
  }

  it('regenerate with evade + completed results: no dup pairs, completed intact, evaded last among scheduled', () => {
    for (let trial = 0; trial < 15; trial++) {
      useTournamentStore.getState().resetTournament();
      const { divId, teamIds } = setup(['T1', 'T2', 'T3', 'T4', 'T5']);
      useTournamentStore.getState().generateSchedule(divId);

      // Complete every match in round 1
      const all = useTournamentStore.getState().getRoundRobinMatches(divId);
      const round1 = all.filter(m => m.roundNumber === 1 && m.status === 'scheduled');
      const completedIds: string[] = [];
      for (const m of round1) {
        useTournamentStore.getState().startMatch(m.id);
        useTournamentStore.getState().updateScore(m.id, 21, 15);
        useTournamentStore.getState().completeMatch(m.id);
        completedIds.push(m.id);
      }
      const completedAtBefore = completedIds.map(
        id => useTournamentStore.getState().tournament.matches[id].completedAt
      );
      const completedPairs = new Set(
        round1.map(m => pairKey(m.homeTeamId, m.awayTeamId))
      );

      // Evade between two teams whose matchup is NOT yet completed
      let evadeA = '', evadeB = '';
      outer: for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          if (!completedPairs.has(pairKey(teamIds[i], teamIds[j]))) {
            evadeA = teamIds[i]; evadeB = teamIds[j];
            break outer;
          }
        }
      }
      useTournamentStore.getState().toggleEvadeTeam(evadeA, evadeB);

      useTournamentStore.getState().regenerateSchedule(divId);

      const after = useTournamentStore.getState().getRoundRobinMatches(divId);

      // 1. Completed matches kept verbatim (same id, same completedAt)
      for (let k = 0; k < completedIds.length; k++) {
        const m = useTournamentStore.getState().tournament.matches[completedIds[k]];
        expect(m).toBeDefined();
        expect(m.status).toBe('completed');
        expect(m.completedAt).toBe(completedAtBefore[k]);
      }

      // 2. No pair appears in more than one non-bye match
      const seen = new Map<string, number>();
      for (const m of after) {
        if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
        const key = pairKey(m.homeTeamId, m.awayTeamId);
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      for (const [key, count] of seen) {
        expect(count, `pair ${key} appears ${count} times (trial ${trial})`).toBe(1);
      }

      // 3. All 10 pairs present (full RR, no caps)
      expect(seen.size).toBe(10);

      // 4. Evaded scheduled match is in the highest round among scheduled matches
      const scheduled = after.filter(m => m.status === 'scheduled');
      const maxScheduledRound = Math.max(...scheduled.map(m => m.roundNumber));
      const evadedMatch = scheduled.find(
        m => pairKey(m.homeTeamId, m.awayTeamId) === pairKey(evadeA, evadeB)
      );
      expect(evadedMatch, `evaded pair missing from scheduled (trial ${trial})`).toBeDefined();
      expect(evadedMatch!.roundNumber).toBe(maxScheduledRound);
    }
  });

  it('regenerate when caps already met by completed games: no new matches for capped teams', () => {
    const { divId, teamIds } = setup(['T1', 'T2', 'T3', 'T4']);
    useTournamentStore.getState().generateSchedule(divId);
    const all = useTournamentStore.getState().getRoundRobinMatches(divId);
    // Complete one match
    const first = all.find(m => m.status === 'scheduled')!;
    useTournamentStore.getState().startMatch(first.id);
    useTournamentStore.getState().updateScore(first.id, 21, 15);
    useTournamentStore.getState().completeMatch(first.id);

    // Cap the two teams that played at 1
    useTournamentStore.getState().updateTeamMaxGames(first.homeTeamId!, 1);
    useTournamentStore.getState().updateTeamMaxGames(first.awayTeamId!, 1);

    useTournamentStore.getState().regenerateSchedule(divId);
    const after = useTournamentStore.getState().getRoundRobinMatches(divId);
    const counts = new Map<string, number>();
    for (const m of after) {
      if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
      counts.set(m.homeTeamId, (counts.get(m.homeTeamId) ?? 0) + 1);
      counts.set(m.awayTeamId, (counts.get(m.awayTeamId) ?? 0) + 1);
    }
    expect(counts.get(first.homeTeamId!) ?? 0).toBe(1);
    expect(counts.get(first.awayTeamId!) ?? 0).toBe(1);
    // the two uncapped teams should still get their game vs each other
    const others = teamIds.filter(t => t !== first.homeTeamId && t !== first.awayTeamId);
    expect(counts.get(others[0]) ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('regenerate with an in-progress match keeps it and does not duplicate its pair', () => {
    const { divId } = setup(['T1', 'T2', 'T3', 'T4']);
    useTournamentStore.getState().generateSchedule(divId);
    const all = useTournamentStore.getState().getRoundRobinMatches(divId);
    const first = all.find(m => m.status === 'scheduled')!;
    useTournamentStore.getState().startMatch(first.id);
    useTournamentStore.getState().updateScore(first.id, 7, 5);

    useTournamentStore.getState().regenerateSchedule(divId);
    const after = useTournamentStore.getState().getRoundRobinMatches(divId);
    const inProg = after.filter(m => m.status === 'in-progress');
    expect(inProg).toHaveLength(1);
    expect(inProg[0].id).toBe(first.id);
    expect(inProg[0].homeScore).toBe(7);
    expect(inProg[0].roundNumber).toBe(0); // moved to "always current"
    const pairCount = after.filter(
      m => m.status !== 'bye' && m.homeTeamId && m.awayTeamId &&
        pairKey(m.homeTeamId, m.awayTeamId) === pairKey(first.homeTeamId, first.awayTeamId)
    );
    expect(pairCount).toHaveLength(1);
  });

  it('dropTeam then regenerate (the SchedulePage flow) leaves consistent schedule', () => {
    const { divId, teamIds } = setup(['T1', 'T2', 'T3', 'T4', 'T5']);
    useTournamentStore.getState().generateSchedule(divId);
    const all = useTournamentStore.getState().getRoundRobinMatches(divId);
    // complete a match involving T1
    const t1Match = all.find(m => m.status === 'scheduled' && (m.homeTeamId === teamIds[0] || m.awayTeamId === teamIds[0]))!;
    useTournamentStore.getState().startMatch(t1Match.id);
    useTournamentStore.getState().updateScore(t1Match.id, 21, 15);
    useTournamentStore.getState().completeMatch(t1Match.id);

    useTournamentStore.getState().dropTeam(teamIds[0]);
    useTournamentStore.getState().regenerateSchedule(divId);

    const after = useTournamentStore.getState().getRoundRobinMatches(divId);
    // No matches reference the dropped team
    expect(after.some(m => m.homeTeamId === teamIds[0] || m.awayTeamId === teamIds[0])).toBe(false);
    // Remaining 4 teams have a full RR (6 pairs)
    const pairs = new Set(
      after.filter(m => m.status !== 'bye' && m.homeTeamId && m.awayTeamId)
        .map(m => pairKey(m.homeTeamId, m.awayTeamId))
    );
    expect(pairs.size).toBe(6);
  });
});
