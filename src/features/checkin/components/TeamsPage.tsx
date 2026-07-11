import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, Plus } from 'lucide-react';
import { useTournamentStore } from '@/stores/tournament.store';
import { TeamCard } from './TeamCard';
import { FreeAgentPool } from './FreeAgentPool';
import { AddTeamDialog } from './AddTeamDialog';
import { AddPlayerDialog } from './AddPlayerDialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface Props {
  divisionId: string;
}

export function TeamsPage({ divisionId }: Props) {
  const { getTeamsForDivision, getActiveTeams, tournament } = useTournamentStore();
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [hoveredLinkGroup, setHoveredLinkGroup] = useState<string | null>(null);

  const teams = getTeamsForDivision(divisionId);
  const activeTeams = getActiveTeams(divisionId);
  const allPlayers = Object.values(tournament.players).filter(p => p.divisionId === divisionId);
  const inCount = allPlayers.filter(p => p.status === 'in').length;
  const outCount = allPlayers.filter(p => p.status === 'out').length;
  const lateCount = allPlayers.filter(p => p.status === 'late').length;
  const unknownCount = allPlayers.filter(p => !p.status || p.status === 'unknown').length;

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Teams</h3>
          <Badge variant="secondary">{activeTeams.length} active</Badge>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-500 font-medium">{inCount} IN</span>
            <span className="text-yellow-500 font-medium">{lateCount} LATE</span>
            <span className="text-red-500 font-medium">{outCount} OUT</span>
            {unknownCount > 0 && <span className="text-muted-foreground">{unknownCount} unknown</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddPlayer(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Add Player
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddTeam(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Team
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {teams.map(team => (
          <TeamCard key={team.id} team={team} divisionId={divisionId} hoveredLinkGroup={hoveredLinkGroup} onHoverLinkGroup={setHoveredLinkGroup} />
        ))}
      </div>

      <FreeAgentPool divisionId={divisionId} hoveredLinkGroup={hoveredLinkGroup} onHoverLinkGroup={setHoveredLinkGroup} />

      <AddTeamDialog divisionId={divisionId} open={showAddTeam} onOpenChange={setShowAddTeam} />
      <AddPlayerDialog divisionId={divisionId} open={showAddPlayer} onOpenChange={setShowAddPlayer} />
    </div>
  );
}
