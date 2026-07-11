import { useTournamentStore } from '@/stores/tournament.store';
import { getRoundsGrouped } from '@/lib/round-robin';
import { MatchCard } from './MatchCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, UserX, Pencil, UserPlus } from 'lucide-react';
import { useState, useRef } from 'react';
import { AddTeamDialog } from '@/features/checkin/components/AddTeamDialog';
import { AddPlayerDialog } from '@/features/checkin/components/AddPlayerDialog';
import { EditSchedule } from './EditSchedule';
import { getContrastColor } from '@/lib/colors';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Match } from '@/types/tournament';

interface Props {
  divisionId: string;
}

function computeTeamGameCounts(matches: Match[], activeTeamIds: Set<string>) {
  const counts = new Map<string, { played: number; projected: number }>();

  for (const id of activeTeamIds) {
    counts.set(id, { played: 0, projected: 0 });
  }

  for (const m of matches) {
    if (m.status === 'bye') continue;
    const isPlayable = m.homeTeamId && m.awayTeamId;
    if (!isPlayable) continue;

    for (const tid of [m.homeTeamId!, m.awayTeamId!]) {
      const entry = counts.get(tid);
      if (!entry) continue;
      entry.projected++;
      if (m.status === 'completed' || m.status === 'in-progress') {
        entry.played++;
      }
    }
  }

  return counts;
}

export function SchedulePage({ divisionId }: Props) {
  const { getRoundRobinMatches, regenerateSchedule, getActiveTeams, dropTeam, tournament, setTargetGames, getFreeAgents, assignPlayerToTeam, updateTeamMaxGames } =
    useTournamentStore();
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showDropTeam, setShowDropTeam] = useState(false);
  const [dropTeamId, setDropTeamId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const focusValueRef = useRef<string>('');

  const matches = getRoundRobinMatches(divisionId);
  const rounds = getRoundsGrouped(matches);
  const activeTeams = getActiveTeams(divisionId);
  const division = tournament.divisions[divisionId];
  const completedCount = matches.filter(m => m.status === 'completed').length;
  const totalPlayable = matches.filter(m => m.status !== 'bye').length;

  const activeTeamIds = new Set(activeTeams.map(t => t.id));
  const gameCounts = computeTeamGameCounts(matches, activeTeamIds);

  const handleDropTeam = () => {
    if (!dropTeamId) return;
    dropTeam(dropTeamId);
    setShowDropTeam(false);
    setDropTeamId('');
    // Auto-regenerate after dropping
    setTimeout(() => regenerateSchedule(divisionId), 0);
  };

  if (isEditing) {
    return <EditSchedule divisionId={divisionId} onDone={() => setIsEditing(false)} />;
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Schedule</h3>
          <Badge variant="secondary">
            {completedCount}/{totalPlayable} matches completed
          </Badge>
          {(() => {
            const maxPossible = activeTeams.length > 1 ? activeTeams.length - 1 : 1;
            return (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>Teams play</span>
                <input
                  type="number"
                  min={1}
                  max={maxPossible}
                  value={division?.targetGames != null ? division.targetGames : ''}
                  placeholder={String(maxPossible)}
                  onFocus={e => { focusValueRef.current = e.target.value; }}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    const capped = val > maxPossible ? maxPossible : val;
                    setTargetGames(divisionId, capped > 0 ? capped : null);
                  }}
                  onBlur={e => { if (e.target.value !== focusValueRef.current) regenerateSchedule(divisionId); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-12 h-6 text-center text-xs font-mono border rounded bg-transparent outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span>games (max: {maxPossible})</span>
              </div>
            );
          })()}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddPlayer(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Add Player
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDropTeam(true)}>
            <UserX className="h-4 w-4 mr-1" />
            Drop Team
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddTeam(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Team
          </Button>
          <Button variant="outline" size="sm" onClick={() => regenerateSchedule(divisionId)}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Regenerate
          </Button>
        </div>
      </div>

      {/* Per-team game count summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Games Per Team</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {activeTeams.map(team => {
              const counts = gameCounts.get(team.id);
              return (
                <div
                  key={team.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border text-xs"
                >
                  <span
                    className="px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: team.color,
                      color: getContrastColor(team.color),
                    }}
                  >
                    {team.name}
                  </span>
                  <span className="font-mono font-semibold">
                    {counts?.played ?? 0}/{counts?.projected ?? 0}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={team.maxGames ?? ''}
                    placeholder="-"
                    title="Team game cap (blank = use division target)"
                    onFocus={e => { focusValueRef.current = e.target.value; }}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      updateTeamMaxGames(team.id, val > 0 ? val : null);
                    }}
                    onBlur={e => { if (e.target.value !== focusValueRef.current) regenerateSchedule(divisionId); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-7 h-5 text-center text-[10px] font-mono border rounded bg-transparent outline-none focus:border-primary text-muted-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
              );
            })}
          </div>
          {/* Free agents with assign-to-team */}
          {(() => {
            const freeAgents = getFreeAgents(divisionId);
            if (freeAgents.length === 0) return null;
            return (
              <div className="mt-3 pt-3 border-t">
                <div className="text-xs text-muted-foreground mb-2">
                  Free Agents ({freeAgents.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {freeAgents.map(agent => (
                    <div key={agent.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
                      <span>{agent.name}</span>
                      <select
                        className="h-5 text-[10px] bg-transparent border-0 outline-none cursor-pointer text-muted-foreground"
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) assignPlayerToTeam(agent.id, e.target.value);
                          e.target.value = '';
                        }}
                      >
                        <option value="" disabled>Assign...</option>
                        {activeTeams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from(rounds.entries())
          .sort(([a], [b]) => a - b)
          .map(([roundNum, roundMatches]) => {
            const allDone = roundMatches.every(m => m.status === 'completed' || m.status === 'bye');
            return (
              <Card key={roundNum}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Round {roundNum}
                    {allDone && <Badge variant="secondary" className="text-xs">Done</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5">
                  {roundMatches.map(m => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </CardContent>
              </Card>
            );
          })}
      </div>

      <AddTeamDialog divisionId={divisionId} open={showAddTeam} onOpenChange={setShowAddTeam} />
      <AddPlayerDialog divisionId={divisionId} open={showAddPlayer} onOpenChange={setShowAddPlayer} />

      <Dialog open={showDropTeam} onOpenChange={open => { setShowDropTeam(open); if (!open) setDropTeamId(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop a Team</DialogTitle>
            <DialogDescription>
              Select a team to remove from the tournament. The schedule will regenerate automatically.
              Completed results against this team will be removed.
            </DialogDescription>
          </DialogHeader>
          <Select value={dropTeamId} onValueChange={v => setDropTeamId(v ?? '')}>
            <SelectTrigger>
              <SelectValue placeholder="Select team to drop" />
            </SelectTrigger>
            <SelectContent>
              {activeTeams.map(t => (
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
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDropTeam(false); setDropTeamId(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleDropTeam}
              disabled={!dropTeamId}
              className="bg-destructive text-destructive-foreground"
            >
              Drop Team & Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
