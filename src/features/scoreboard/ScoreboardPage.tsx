import { useState } from 'react';
import { useTournamentStore } from '@/stores/tournament.store';
import { getContrastColor } from '@/lib/colors';
import { resolveMatchWinner } from '@/lib/bracket';
import type { Match } from '@/types/tournament';

function TeamName({ teamId, large }: { teamId: string | null; large?: boolean }) {
  const team = useTournamentStore(s => teamId ? s.tournament.teams[teamId] : null);
  if (!team) return <span className="text-muted-foreground">TBD</span>;
  return (
    <span
      className={`rounded font-bold ${large ? 'px-4 py-2 text-lg' : 'px-3 py-1.5 text-base'}`}
      style={{ backgroundColor: team.color, color: getContrastColor(team.color) }}
    >
      {team.name}
    </span>
  );
}

function MatchDisplay({ match, large }: { match: Match; large?: boolean }) {
  if (!match.homeTeamId || !match.awayTeamId) return null;

  return (
    <div className={`flex items-center px-4 ${large ? 'py-4' : 'py-2.5'}`}>
      <div className="flex-1 flex justify-start">
        <TeamName teamId={match.homeTeamId} large={large} />
      </div>
      <span className={`text-muted-foreground font-light mx-4 ${large ? 'text-2xl' : 'text-sm'}`}>vs</span>
      <div className="flex-1 flex justify-end">
        <TeamName teamId={match.awayTeamId} large={large} />
      </div>
    </div>
  );
}

function DivisionScoreboard({ divisionId }: { divisionId: string }) {
  const { tournament, getRoundRobinMatches, getFinalsMatches } = useTournamentStore();
  const division = tournament.divisions[divisionId];
  if (!division) return null;

  const isFinals = division.phase === 'finals' || division.phase === 'complete';
  const rrMatches = getRoundRobinMatches(divisionId);
  const finalsMatches = getFinalsMatches(divisionId);
  const matches = isFinals ? finalsMatches : rrMatches;
  const allPlayable = matches.filter(m => m.status !== 'bye' && m.homeTeamId && m.awayTeamId);

  const liveMatches = allPlayable.filter(m => m.status === 'in-progress');

  const upcoming = allPlayable
    .filter(m => m.status === 'scheduled')
    .slice(0, 2);

  // Finals label
  const getFinalsLabel = (m: Match) => {
    if (!isFinals) return null;
    if (m.finalsRound === 1 && finalsMatches.filter(x => x.finalsRound === 1).length === 1) return 'Final';
    if (m.finalsRound === 1) return `Semi ${m.courtNumber}`;
    if (m.finalsRound === 2) return 'Championship';
    if (m.finalsRound === 3) return '3rd Place';
    return null;
  };

  // Champion detection (resolveMatchWinner honors manual tie-break picks)
  let championTeam: { name: string; color: string } | null = null;
  if (isFinals) {
    const championship = finalsMatches.find(m => m.finalsRound === 2) ?? (finalsMatches.length === 1 ? finalsMatches[0] : null);
    const winnerId = resolveMatchWinner(championship);
    if (winnerId) championTeam = tournament.teams[winnerId] ?? null;
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold">{division.name}</h2>
        {isFinals && (
          <span className="text-sm font-semibold text-amber-500 uppercase tracking-wider">Finals</span>
        )}
      </div>

      {/* Champion banner */}
      {championTeam && (
        <div className="text-center py-4 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <span className="text-2xl font-bold text-amber-500">Champion: </span>
          <span
            className="px-4 py-2 rounded text-xl font-bold"
            style={{ backgroundColor: championTeam.color, color: getContrastColor(championTeam.color) }}
          >
            {championTeam.name}
          </span>
        </div>
      )}

      {/* Live matches on top, then up-next underneath */}
      {liveMatches.length > 0 ? (
        <div className="flex flex-col gap-2 mb-6">
          {/* All live matches first */}
          {liveMatches.map(m => {
            const label = getFinalsLabel(m) ?? (m.courtNumber > 0 ? `Court ${m.courtNumber}` : null);
            return (
              <div key={m.id} className={`rounded-lg p-4 ${isFinals ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}>
                {label && <div className={`text-xs font-bold uppercase mb-1 ${isFinals ? 'text-amber-500' : 'text-muted-foreground'}`}>{label}</div>}
                <MatchDisplay match={m} large />
              </div>
            );
          })}

          {/* Then every staged up-next slot, keyed by its actual court */}
          {(() => {
            const staged = Object.entries(division.courtNextUp ?? {})
              .map(([courtNum, matchId]) => ({
                courtNum: Number(courtNum),
                match: allPlayable.find(x => x.id === matchId && x.status === 'scheduled') ?? null,
              }))
              .filter(s => s.match)
              .sort((a, b) => a.courtNum - b.courtNum);
            if (staged.length === 0) return null;
            return (
              <div className="flex flex-col gap-1.5 mt-1">
                {staged.map(({ courtNum, match }) => (
                  <div key={courtNum} className="px-3 py-2 rounded bg-muted/20 border border-muted/30">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Up Next</span>
                      <span className="text-[10px] text-muted-foreground">Court {courtNum}</span>
                    </div>
                    <MatchDisplay match={match!} />
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground mb-6">
          No matches in progress
        </div>
      )}

      {/* Upcoming finals matches */}
      {isFinals && upcoming.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Coming Up</h3>
          <div className="flex flex-col gap-1 border rounded-lg p-2">
            {upcoming.map(m => {
              const label = getFinalsLabel(m);
              return (
                <div key={m.id}>
                  {label && <span className="text-[10px] font-bold text-amber-500 uppercase">{label}</span>}
                  <MatchDisplay match={m} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allPlayable.length > 0 && allPlayable.every(m => m.status === 'completed') && !championTeam && (
        <div className="text-center py-8">
          <span className="text-xl font-bold text-amber-500">
            {isFinals ? 'Finals Complete' : 'Round Robin Complete'}
          </span>
        </div>
      )}
    </div>
  );
}

export function ScoreboardPage() {
  const { tournament } = useTournamentStore();
  const divisions = Object.values(tournament.divisions);
  const [hiddenDivisions, setHiddenDivisions] = useState<Set<string>>(new Set());

  const toggleDivision = (id: string) => {
    setHiddenDivisions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleDivisions = divisions.filter(d => !hiddenDivisions.has(d.id));

  if (divisions.length === 0) {
    return (
      <div className="flex items-center justify-center h-[80vh] text-muted-foreground">
        No divisions created yet
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="flex items-center justify-center gap-3 mb-6">
        {divisions.map(div => (
          <button
            key={div.id}
            onClick={() => toggleDivision(div.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              hiddenDivisions.has(div.id)
                ? 'opacity-40 border-muted text-muted-foreground'
                : 'border-primary/50 bg-primary/10 text-foreground'
            }`}
          >
            {div.name}
          </button>
        ))}
      </div>
      <h1 className="text-4xl font-bold text-center mb-8">{tournament.name}</h1>
      <div className={`grid gap-8 ${
        visibleDivisions.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto' :
        visibleDivisions.length === 2 ? 'grid-cols-2' :
        'grid-cols-3'
      }`}>
        {visibleDivisions.map(div => (
          <div key={div.id} className="border rounded-xl p-6 bg-card">
            <DivisionScoreboard divisionId={div.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
