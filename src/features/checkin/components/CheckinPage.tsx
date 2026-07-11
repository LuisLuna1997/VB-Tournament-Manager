import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, UserPlus, Play, Settings, FileSpreadsheet } from 'lucide-react';
import { useTournamentStore } from '@/stores/tournament.store';
import { TeamCard } from './TeamCard';
import { FreeAgentPool } from './FreeAgentPool';
import { AddTeamDialog } from './AddTeamDialog';
import { AddPlayerDialog } from './AddPlayerDialog';
import { useImportSpreadsheet } from './ImportDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

interface Props {
  divisionId: string;
}

export function CheckinPage({ divisionId }: Props) {
  const { getTeamsForDivision, getActiveTeams, generateSchedule, tournament, updateDivisionCourtCount, setTargetGames } =
    useTournamentStore();
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [hoveredLinkGroup, setHoveredLinkGroup] = useState<string | null>(null);

  const { triggerFilePicker, previewDialog } = useImportSpreadsheet(divisionId);

  const teams = getTeamsForDivision(divisionId);
  const activeTeams = getActiveTeams(divisionId);
  const division = tournament.divisions[divisionId];

  const handleStartRoundRobin = () => {
    const parsed = targetInput ? parseInt(targetInput) : null;
    setTargetGames(divisionId, parsed && parsed > 0 ? parsed : null);
    generateSchedule(divisionId);
    setShowStartConfirm(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            Teams ({activeTeams.length} active / {teams.length} total)
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4" />
            <span>Courts:</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={division.courtCount}
              onChange={e => updateDivisionCourtCount(divisionId, parseInt(e.target.value) || 2)}
              className="h-7 w-16 text-center"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={triggerFilePicker}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Import
          </Button>
          <Button variant="outline" onClick={() => setShowAddPlayer(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Add Player
          </Button>
          <Button variant="outline" onClick={() => setShowAddTeam(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Team
          </Button>
          <Button
            onClick={() => setShowStartConfirm(true)}
            disabled={activeTeams.length < 2}
            size="lg"
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Play className="h-5 w-5 mr-1" />
            Start Round Robin
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {teams.map(team => (
          <TeamCard key={team.id} team={team} divisionId={divisionId} hoveredLinkGroup={hoveredLinkGroup} onHoverLinkGroup={setHoveredLinkGroup} />
        ))}
      </div>

      {teams.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-lg mb-4">No teams yet. Add your first team to get started.</p>
          <Button size="lg" onClick={() => setShowAddTeam(true)}>
            <Plus className="h-5 w-5 mr-1" />
            Add Team
          </Button>
        </div>
      )}

      <FreeAgentPool divisionId={divisionId} hoveredLinkGroup={hoveredLinkGroup} onHoverLinkGroup={setHoveredLinkGroup} />

      <AddTeamDialog divisionId={divisionId} open={showAddTeam} onOpenChange={setShowAddTeam} />
      <AddPlayerDialog
        divisionId={divisionId}
        open={showAddPlayer}
        onOpenChange={setShowAddPlayer}
      />
      {previewDialog}

      <Dialog open={showStartConfirm} onOpenChange={setShowStartConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Round Robin?</DialogTitle>
            <DialogDescription>
              {activeTeams.length} teams will be scheduled across {division.courtCount} courts.
              {teams.length > activeTeams.length &&
                ` ${teams.length - activeTeams.length} team(s) marked as no-show/dropped will be excluded.`}
              {' '}You can still add/remove teams during the round robin.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium mb-1 block">Games per team</label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={activeTeams.length - 1}
                placeholder={`Full (${activeTeams.length - 1})`}
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                className="w-32"
              />
              <span className="text-xs text-muted-foreground">
                Leave blank for full round-robin ({activeTeams.length - 1} games each)
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartConfirm(false)}>Cancel</Button>
            <Button onClick={handleStartRoundRobin}>Start</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
