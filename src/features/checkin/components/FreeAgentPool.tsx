import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useTournamentStore } from '@/stores/tournament.store';
import { PlayerChip } from './PlayerChip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

interface Props {
  divisionId: string;
  hoveredLinkGroup?: string | null;
  onHoverLinkGroup?: (group: string | null) => void;
}

export function FreeAgentPool({ divisionId, hoveredLinkGroup, onHoverLinkGroup }: Props) {
  const { getFreeAgents, getTeamsForDivision, assignPlayerToTeam, removePlayer, removePlayerFromTeam, setPlayerLinkGroup } =
    useTournamentStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const freeAgents = getFreeAgents(divisionId);
  const teams = getTeamsForDivision(divisionId);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const playerId = e.dataTransfer.getData('application/vb-player-id');
    if (playerId) {
      removePlayerFromTeam(playerId);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  return (
    <Card
      className={`border-dashed transition-colors ${
        isDragOver ? 'ring-2 ring-amber-500 bg-amber-500/5 border-amber-500' : ''
      } ${freeAgents.length === 0 && !isDragOver ? 'border-muted' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Free Agents
          <Badge variant="secondary">{freeAgents.length}</Badge>
          {isDragOver && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-normal">
              Drop to unassign
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {freeAgents.length === 0 && !isDragOver && (
          <p className="text-xs text-muted-foreground py-1">
            Drag players here to unassign them from a team
          </p>
        )}
        <div className="flex flex-col gap-2">
          {freeAgents.map(agent => (
            <div key={agent.id} className="flex items-center justify-between gap-2 py-1">
              <PlayerChip
                player={agent}
                highlighted={!!agent.linkGroup && agent.linkGroup === hoveredLinkGroup}
                onMouseEnter={() => agent.linkGroup && onHoverLinkGroup?.(agent.linkGroup)}
                onMouseLeave={() => onHoverLinkGroup?.(null)}
              />
              <div className="flex items-center gap-1">
                <select
                  value={agent.linkGroup ?? ''}
                  onChange={e => setPlayerLinkGroup(agent.id, e.target.value || null)}
                  className="h-7 text-xs w-14 rounded border bg-transparent outline-none cursor-pointer text-center"
                  title="Link group (linked players move together)"
                >
                  <option value="">--</option>
                  {['A','B','C','D','E','F'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {teams.length > 0 && (
                  <Select onValueChange={teamId => { if (typeof teamId === 'string') assignPlayerToTeam(agent.id, teamId); }}>
                    <SelectTrigger className="h-7 text-xs w-32">
                      <span>Assign to...</span>
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full inline-block"
                              style={{ backgroundColor: t.color }}
                            />
                            {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removePlayer(agent.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
