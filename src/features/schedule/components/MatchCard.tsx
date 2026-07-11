import { Badge } from '@/components/ui/badge';
import { TeamBadge } from '@/components/TeamBadge';
import type { Match } from '@/types/tournament';

interface Props {
  match: Match;
}

export function MatchCard({ match }: Props) {
  if (match.status === 'bye') {
    const teamId = match.homeTeamId ?? match.awayTeamId;
    return (
      <div className="flex items-center gap-2 py-1.5 px-3 bg-muted/50 rounded text-sm text-muted-foreground">
        {teamId ? <TeamBadge teamId={teamId} /> : <span>Unknown</span>}
        <Badge variant="outline" className="text-xs">BYE</Badge>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded border ${
      match.status === 'completed' ? 'bg-muted/30' :
      match.status === 'in-progress' ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' : ''
    }`}>
      <div className="flex items-center gap-3 flex-1">
        <Badge variant="outline" className="text-xs w-6 justify-center">
          C{match.courtNumber}
        </Badge>
        <div className="flex items-center gap-2 flex-1">
          {match.homeTeamId && <TeamBadge teamId={match.homeTeamId} />}
          <span className="text-xs text-muted-foreground">vs</span>
          {match.awayTeamId && <TeamBadge teamId={match.awayTeamId} />}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {match.status === 'completed' && (
          <span className="font-mono text-sm font-semibold">
            {match.homeScore} - {match.awayScore}
          </span>
        )}
        {match.status === 'in-progress' && (
          <Badge className="bg-blue-500 text-white text-xs">Live</Badge>
        )}
      </div>
    </div>
  );
}
