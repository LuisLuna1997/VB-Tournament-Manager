import type { Tournament } from '@/types/tournament';
import { computeStandings } from '@/lib/standings';

// Names are pasted/written into Google Sheets, where a leading =, +, or @ is
// executed as a formula. Prefix with an apostrophe (renders as plain text)
// and collapse tabs/newlines that would break TSV columns.
function sanitizeForSheet(value: string): string {
  const cleaned = value.replace(/[\t\n\r]+/g, ' ');
  return /^[=+@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

export interface ScheduleRow {
  matchId: string;
  division: string;
  round: number;
  court: number;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface StandingRow {
  division: string;
  rank: number;
  team: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
}

export function buildScheduleRows(tournament: Tournament): ScheduleRow[] {
  const divisions = Object.values(tournament.divisions);
  const rows: ScheduleRow[] = [];

  for (const div of divisions) {
    const divMatches = Object.values(tournament.matches)
      .filter(m => m.divisionId === div.id)
      .sort((a, b) => a.roundNumber - b.roundNumber);

    for (const m of divMatches) {
      const home = m.homeTeamId ? tournament.teams[m.homeTeamId]?.name ?? '' : 'BYE';
      const away = m.awayTeamId ? tournament.teams[m.awayTeamId]?.name ?? '' : 'BYE';
      rows.push({
        matchId: m.id,
        division: div.name,
        round: m.roundNumber,
        court: m.courtNumber,
        home,
        away,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        status: m.status,
      });
    }
  }

  return rows;
}

export function buildStandingRows(tournament: Tournament): StandingRow[] {
  const divisions = Object.values(tournament.divisions);
  const rows: StandingRow[] = [];

  for (const div of divisions) {
    const standings = computeStandings(
      Object.values(tournament.matches),
      tournament.teams,
      div.id
    );
    for (const s of standings) {
      rows.push({
        division: div.name,
        rank: s.rank,
        team: s.teamName,
        wins: s.wins,
        losses: s.losses,
        pointsFor: s.pointsFor,
        pointsAgainst: s.pointsAgainst,
        diff: s.diff,
      });
    }
  }

  return rows;
}

export function buildTsvClipboard(tournament: Tournament): string {
  const lines: string[] = [];
  const scheduleRows = buildScheduleRows(tournament);

  // Skip bye matches
  const playableRows = scheduleRows.filter(r => r.status !== 'bye');

  // Collect match IDs staged as "next up" on courts, with their court number
  const nextUpMatchCourts = new Map<string, number>();
  for (const div of Object.values(tournament.divisions)) {
    const courtNextUp = div.courtNextUp;
    if (!courtNextUp) continue;
    for (const [courtNum, matchId] of Object.entries(courtNextUp)) {
      nextUpMatchCourts.set(matchId, Number(courtNum));
    }
  }

  // Group by division
  const divisions: string[] = [];
  const byDivision = new Map<string, typeof playableRows>();
  for (const r of playableRows) {
    if (!byDivision.has(r.division)) {
      divisions.push(r.division);
      byDivision.set(r.division, []);
    }
    byDivision.get(r.division)!.push(r);
  }

  for (const div of divisions) {
    if (lines.length > 0) lines.push('');
    lines.push(`Division: ${sanitizeForSheet(div)}`);
    lines.push(['Court', 'Team Home', 'Team Away', 'Score', 'Status'].join('\t'));
    for (const r of byDivision.get(div)!) {
      let status: string;
      let court: string | number;
      if (r.status === 'in-progress') {
        status = 'NOW PLAYING';
        court = r.court;
      } else if (r.status === 'completed') {
        status = 'DONE';
        court = r.court;
      } else if (nextUpMatchCourts.has(r.matchId)) {
        status = 'Up Next';
        court = nextUpMatchCourts.get(r.matchId)!;
      } else {
        status = 'TBD';
        court = 'n/a';
      }
      const score = r.status === 'completed' ? `${r.homeScore} - ${r.awayScore}` : '';
      lines.push([
        court,
        sanitizeForSheet(r.home),
        sanitizeForSheet(r.away),
        score,
        status,
      ].join('\t'));
    }
  }

  return lines.join('\n');
}

export interface SheetPayload {
  tournamentName: string;
  date: string;
  schedule: ScheduleRow[];
  standings: StandingRow[];
}

export function buildSheetPayload(tournament: Tournament): SheetPayload {
  return {
    tournamentName: sanitizeForSheet(tournament.name),
    date: tournament.date,
    schedule: buildScheduleRows(tournament).map(r => ({
      ...r,
      division: sanitizeForSheet(r.division),
      home: sanitizeForSheet(r.home),
      away: sanitizeForSheet(r.away),
    })),
    standings: buildStandingRows(tournament).map(r => ({
      ...r,
      division: sanitizeForSheet(r.division),
      team: sanitizeForSheet(r.team),
    })),
  };
}
