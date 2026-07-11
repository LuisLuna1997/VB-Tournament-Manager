import { useTournamentStore } from '@/stores/tournament.store';
import { getContrastColor } from '@/lib/colors';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Shield } from 'lucide-react';

interface Props {
  teamId: string;
  className?: string;
}

export function TeamBadge({ teamId, className = '' }: Props) {
  const { tournament } = useTournamentStore();
  const team = tournament.teams[teamId];
  if (!team) return <span>?</span>;

  const players = team.playerIds
    .map(id => tournament.players[id])
    .filter(Boolean);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={`px-2 py-0.5 rounded text-sm font-medium cursor-default ${className}`}
            style={{
              backgroundColor: team.color,
              color: getContrastColor(team.color),
            }}
          />
        }
      >
        {team.name}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{team.name}</span>
          {team.manager && (
            <div className="flex items-center gap-1 text-xs">
              <Shield className="h-3 w-3" />
              <span>{team.manager}</span>
            </div>
          )}
          {players.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              {players.map(p => p.name).join(', ')}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No players</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
