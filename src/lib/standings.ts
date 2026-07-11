import type { Match, Team, TeamStanding } from '@/types/tournament';

// Win percentage counting a tie as half a win. Teams with no games rank below 0-game ties.
function winPct(s: TeamStanding): number {
  if (s.gamesPlayed === 0) return 0;
  return (s.wins + s.ties * 0.5) / s.gamesPlayed;
}

export function computeStandings(
  matches: Match[],
  teams: Record<string, Team>,
  divisionId: string
): TeamStanding[] {
  const divisionTeams = Object.values(teams).filter(t => t.divisionId === divisionId);

  const standingsMap = new Map<string, TeamStanding>();

  for (const team of divisionTeams) {
    if (team.checkinStatus === 'dropped') continue;
    standingsMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      wins: 0,
      losses: 0,
      ties: 0,
      gamesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      rank: 0,
    });
  }

  const roundRobinMatches = matches.filter(
    m => m.divisionId === divisionId && m.status === 'completed' && !m.isFinals
  );

  // Head-to-head net wins: key "a::b" (sorted) -> wins of sorted-first team minus wins of sorted-second
  const headToHead = new Map<string, number>();

  for (const match of roundRobinMatches) {
    if (!match.homeTeamId || !match.awayTeamId) continue;
    if (match.homeScore === null || match.awayScore === null) continue;

    const home = standingsMap.get(match.homeTeamId);
    const away = standingsMap.get(match.awayTeamId);
    const isTie = match.homeScore === match.awayScore;

    if (home) {
      home.gamesPlayed++;
      home.pointsFor += match.homeScore;
      home.pointsAgainst += match.awayScore;
      if (isTie) home.ties++;
      else if (match.homeScore > match.awayScore) home.wins++;
      else home.losses++;
    }

    if (away) {
      away.gamesPlayed++;
      away.pointsFor += match.awayScore;
      away.pointsAgainst += match.homeScore;
      if (isTie) away.ties++;
      else if (match.awayScore > match.homeScore) away.wins++;
      else away.losses++;
    }

    if (home && away && !isTie) {
      const [first, second] = [match.homeTeamId, match.awayTeamId].sort();
      const key = `${first}::${second}`;
      const winnerId = match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId;
      const delta = winnerId === first ? 1 : -1;
      headToHead.set(key, (headToHead.get(key) ?? 0) + delta);
    }
  }

  const standings = Array.from(standingsMap.values());

  // Compute diff
  for (const s of standings) {
    s.diff = s.pointsFor - s.pointsAgainst;
  }

  // Net head-to-head result between two teams: positive if `a` beat `b` more often
  const h2h = (a: TeamStanding, b: TeamStanding): number => {
    const [first, second] = [a.teamId, b.teamId].sort();
    const net = headToHead.get(`${first}::${second}`) ?? 0;
    return a.teamId === first ? net : -net;
  };

  // Sort: win% desc (fair under unequal games played), then wins desc,
  // then diff desc, then PF desc
  standings.sort((a, b) => {
    const pctA = winPct(a);
    const pctB = winPct(b);
    if (pctB !== pctA) return pctB - pctA;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return b.pointsFor - a.pointsFor;
  });

  // Head-to-head pass: when EXACTLY two teams are tied on win% and wins, the
  // game they played against each other beats the diff ordering. For 3+ tied
  // teams head-to-head can be cyclic (a>b>c>a), so diff stands.
  for (let i = 0; i < standings.length - 1; ) {
    const groupStart = i;
    let groupEnd = i;
    while (
      groupEnd + 1 < standings.length &&
      winPct(standings[groupEnd + 1]) === winPct(standings[groupStart]) &&
      standings[groupEnd + 1].wins === standings[groupStart].wins
    ) {
      groupEnd++;
    }
    if (groupEnd - groupStart === 1) {
      const head = h2h(standings[groupStart], standings[groupStart + 1]);
      if (head < 0) {
        [standings[groupStart], standings[groupStart + 1]] = [standings[groupStart + 1], standings[groupStart]];
      }
    }
    i = groupEnd + 1;
  }

  // Assign ranks
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  return standings;
}
