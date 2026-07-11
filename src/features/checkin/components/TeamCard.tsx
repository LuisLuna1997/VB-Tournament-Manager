import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Shield, Plus } from 'lucide-react';
import { useTournamentStore } from '@/stores/tournament.store';
import { PlayerChip } from './PlayerChip';
import type { Team, CheckinStatus } from '@/types/tournament';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const STATUS_STYLES: Record<CheckinStatus, { bg: string; label: string }> = {
  wip: { bg: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', label: 'WIP' },
  ready: { bg: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', label: 'Ready To Play' },
  dropped: { bg: 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-500', label: 'Dropped' },
};

interface Props {
  team: Team;
  divisionId: string;
  hoveredLinkGroup?: string | null;
  onHoverLinkGroup?: (group: string | null) => void;
}

export function TeamCard({ team, divisionId, hoveredLinkGroup, onHoverLinkGroup }: Props) {
  const { tournament, updateTeamStatus, removeTeam, removePlayerFromTeam, addPlayer, assignPlayerToTeam, updatePlayerStatus, setPlayerLinkGroup, toggleEvadeTeam, getActiveTeams, updateTeamName, updateTeamManager } =
    useTournamentStore();
  const [showDelete, setShowDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const players = team.playerIds
    .map(id => tournament.players[id])
    .filter(Boolean);
  const status = STATUS_STYLES[team.checkinStatus] ?? STATUS_STYLES.wip;

  const handleAddPlayer = () => {
    if (newPlayerName.trim()) {
      addPlayer(divisionId, newPlayerName.trim(), team.id);
      setNewPlayerName('');
      // Keep input open for rapid entry
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const playerId = e.dataTransfer.getData('application/vb-player-id');
    if (playerId) {
      assignPlayerToTeam(playerId, team.id);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  return (
    <Card
      className={`relative overflow-hidden transition-colors border shadow-sm bg-card ${
        team.checkinStatus === 'dropped' ? 'opacity-50' : ''
      } ${isDragOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2"
        style={{ backgroundColor: team.color }}
      />
      <CardHeader className="pb-2 pl-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRenaming ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (renameValue.trim()) updateTeamName(team.id, renameValue.trim());
                  setIsRenaming(false);
                }}
                className="flex items-center gap-1"
              >
                <Input
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  className="h-7 text-lg font-semibold w-40"
                  autoFocus
                  onBlur={() => {
                    if (renameValue.trim()) updateTeamName(team.id, renameValue.trim());
                    setIsRenaming(false);
                  }}
                  onKeyDown={e => { if (e.key === 'Escape') setIsRenaming(false); }}
                />
              </form>
            ) : (
              <span
                className="font-semibold text-lg cursor-pointer hover:underline"
                onClick={() => { setRenameValue(team.name); setIsRenaming(true); }}
                title="Click to rename"
              >
                {team.name}
              </span>
            )}
            <Badge className={status.bg} variant="secondary">
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Select
              value={team.checkinStatus}
              onValueChange={v => updateTeamStatus(team.id, v as CheckinStatus)}
            >
              <SelectTrigger className="h-7 text-xs w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wip">WIP</SelectItem>
                <SelectItem value="ready">Ready To Play</SelectItem>
                <SelectItem value="dropped">Dropped</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pl-5">
        <div className="flex items-center gap-1 mb-1.5 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          <input
            value={team.manager}
            onChange={e => updateTeamManager(team.id, e.target.value)}
            placeholder="Manager name"
            className="bg-transparent outline-none border-b border-transparent focus:border-muted-foreground/50 text-xs w-32"
          />
        </div>
        {/* Evade preferences (bidirectional) */}
        {(() => {
          const otherTeams = getActiveTeams(divisionId).filter(t => t.id !== team.id);
          const evadeIds = team.evadeTeamIds ?? [];
          // Teams that evade US (but we don't evade them)
          const evadedByIds = otherTeams
            .filter(t => (t.evadeTeamIds ?? []).includes(team.id) && !evadeIds.includes(t.id))
            .map(t => t.id);
          // All evade relationships involving this team
          const allEvadeIds = [...new Set([...evadeIds, ...evadedByIds])];
          if (otherTeams.length === 0) return null;
          if (allEvadeIds.length === 0 && otherTeams.length === 0) return null;
          return (
            <div className="mb-2">
              <div className="flex flex-wrap gap-1 items-center">
                {allEvadeIds.length > 0 && (
                  <span className="text-[10px] text-muted-foreground mr-1">Evade:</span>
                )}
                {evadeIds.map(eid => {
                  const t = tournament.teams[eid];
                  if (!t) return null;
                  const mutual = (t.evadeTeamIds ?? []).includes(team.id);
                  return (
                    <button
                      key={eid}
                      onClick={() => toggleEvadeTeam(team.id, eid)}
                      className={`text-[10px] px-1.5 py-0.5 rounded hover:bg-red-500/30 ${
                        mutual ? 'bg-red-500/30 text-red-400 ring-1 ring-red-500/40' : 'bg-red-500/20 text-red-500'
                      }`}
                      title={mutual ? `Mutual evade with ${t.name} (click to remove yours)` : `You evade ${t.name} (click to remove)`}
                    >
                      {t.name} {mutual ? '(mutual)' : ''} x
                    </button>
                  );
                })}
                {evadedByIds.map(eid => {
                  const t = tournament.teams[eid];
                  if (!t) return null;
                  return (
                    <span
                      key={eid}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-500 italic"
                      title={`${t.name} evades you`}
                    >
                      {t.name} evades you
                    </span>
                  );
                })}
                <select
                  className="h-5 text-[10px] bg-transparent border rounded outline-none cursor-pointer text-muted-foreground px-1"
                  value=""
                  onChange={e => { if (e.target.value) toggleEvadeTeam(team.id, e.target.value); e.target.value = ''; }}
                >
                  <option value="">{allEvadeIds.length > 0 ? '+' : 'Evade...'}</option>
                  {otherTeams.filter(t => !evadeIds.includes(t.id)).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })()}
        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
          {players.map(p => (
            <PlayerChip
              key={p.id}
              player={p}
              onRemove={() => removePlayerFromTeam(p.id)}
              onStatusChange={status => updatePlayerStatus(p.id, status)}
              onLinkChange={group => setPlayerLinkGroup(p.id, group)}
              highlighted={!!p.linkGroup && p.linkGroup === hoveredLinkGroup}
              onMouseEnter={() => p.linkGroup && onHoverLinkGroup?.(p.linkGroup)}
              onMouseLeave={() => onHoverLinkGroup?.(null)}
            />
          ))}
          {players.length === 0 && !showAddInput && (
            <span className="text-xs text-muted-foreground">No players</span>
          )}
        </div>

        {/* Inline add player */}
        {showAddInput ? (
          <form
            onSubmit={e => { e.preventDefault(); handleAddPlayer(); }}
            className="flex gap-1.5 mt-1"
          >
            <Input
              ref={inputRef}
              value={newPlayerName}
              onChange={e => setNewPlayerName(e.target.value)}
              placeholder="Player name"
              className="h-7 text-xs flex-1"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setShowAddInput(false);
                  setNewPlayerName('');
                }
              }}
            />
            <Button type="submit" size="sm" className="h-7 text-xs px-2" disabled={!newPlayerName.trim()}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => { setShowAddInput(false); setNewPlayerName(''); }}
            >
              Done
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setShowAddInput(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <Plus className="h-3 w-3 mr-0.5" />
            Add Player
          </Button>
        )}
      </CardContent>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {team.name}?</DialogTitle>
            <DialogDescription>
              Players will become free agents. All of this team's matches — including
              completed results — will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button
              onClick={() => { removeTeam(team.id); setShowDelete(false); }}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
