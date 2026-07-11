import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTournamentStore } from '@/stores/tournament.store';
import { getContrastColor } from '@/lib/colors';
import { generateId } from '@/lib/id';
import { Plus, Trash2, Check, X } from 'lucide-react';
import type { Match } from '@/types/tournament';

interface Props {
  divisionId: string;
  onDone: () => void;
}

// Drafts survive tab switches (Base UI unmounts inactive tab panels).
// Cleared on Confirm or Cancel.
const draftCache = new Map<string, Match[]>();

function computeDraftGameCounts(matches: Match[], teamIds: string[]) {
  const counts = new Map<string, number>();
  for (const id of teamIds) counts.set(id, 0);
  for (const m of matches) {
    if (m.status === 'bye' || !m.homeTeamId || !m.awayTeamId) continue;
    counts.set(m.homeTeamId, (counts.get(m.homeTeamId) ?? 0) + 1);
    counts.set(m.awayTeamId, (counts.get(m.awayTeamId) ?? 0) + 1);
  }
  return counts;
}

export function EditSchedule({ divisionId, onDone }: Props) {
  const { getRoundRobinMatches, getActiveTeams, tournament, replaceMatches } = useTournamentStore();

  const activeTeams = getActiveTeams(divisionId);
  const division = tournament.divisions[divisionId];
  const originalMatches = getRoundRobinMatches(divisionId);

  // Draft state: deep clone of matches (restored from cache after a tab switch)
  const [wasRestored] = useState(() => draftCache.has(divisionId));
  const [draft, setDraftState] = useState<Match[]>(() =>
    draftCache.get(divisionId) ?? originalMatches.map(m => ({ ...m }))
  );
  const setDraft = (updater: Match[] | ((prev: Match[]) => Match[])) => {
    setDraftState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      draftCache.set(divisionId, next);
      return next;
    });
  };

  const teamIds = activeTeams.map(t => t.id);
  const gameCounts = computeDraftGameCounts(draft, teamIds);

  // Group by round
  const rounds = new Map<number, Match[]>();
  for (const m of draft) {
    if (!rounds.has(m.roundNumber)) rounds.set(m.roundNumber, []);
    rounds.get(m.roundNumber)!.push(m);
  }
  const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);
  const maxRound = sortedRounds.length > 0 ? sortedRounds[sortedRounds.length - 1][0] : 0;

  const dragMatchRef = useRef<string | null>(null);

  const updateMatch = (matchId: string, updates: Partial<Match>) => {
    setDraft(prev => prev.map(m => m.id === matchId ? { ...m, ...updates } : m));
  };

  const reorderMatch = (dragId: string, dropId: string) => {
    setDraft(prev => {
      const dragIdx = prev.findIndex(m => m.id === dragId);
      const dropIdx = prev.findIndex(m => m.id === dropId);
      if (dragIdx === -1 || dropIdx === -1) return prev;
      // Only reorder within same round
      if (prev[dragIdx].roundNumber !== prev[dropIdx].roundNumber) return prev;
      const next = [...prev];
      const [dragged] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, dragged);
      return next;
    });
  };

  const removeMatch = (matchId: string) => {
    setDraft(prev => prev.filter(m => m.id !== matchId));
  };

  const addMatch = (roundNumber: number) => {
    const newMatch: Match = {
      id: generateId(),
      roundNumber,
      homeTeamId: activeTeams[0]?.id ?? null,
      awayTeamId: activeTeams[1]?.id ?? null,
      homeScore: null,
      awayScore: null,
      courtNumber: 1,
      status: 'scheduled',
      divisionId,
      isFinals: false,
    };
    setDraft(prev => [...prev, newMatch]);
  };

  const addRound = () => {
    addMatch(maxRound + 1);
  };

  const removeRound = (roundNumber: number) => {
    setDraft(prev => prev.filter(m => m.roundNumber !== roundNumber));
  };

  const handleConfirm = () => {
    replaceMatches(divisionId, draft);
    draftCache.delete(divisionId);
    onDone();
  };

  const handleCancel = () => {
    draftCache.delete(divisionId);
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Edit Schedule</h3>
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            Editing
          </Badge>
          {wasRestored && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
              Unsaved edits restored
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} className="bg-green-600 hover:bg-green-700 text-white">
            <Check className="h-4 w-4 mr-1" />
            Confirm Changes
          </Button>
        </div>
      </div>

      {/* Live game counts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Games Per Team (live preview)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {activeTeams.map(team => {
              const count = gameCounts.get(team.id) ?? 0;
              return (
                <div key={team.id} className="flex items-center gap-1.5 px-2 py-1 rounded border text-xs">
                  <span
                    className="px-1.5 py-0.5 rounded font-medium"
                    style={{ backgroundColor: team.color, color: getContrastColor(team.color) }}
                  >
                    {team.name}
                  </span>
                  <span className="font-mono font-semibold">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Rounds editor */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedRounds.map(([roundNum, roundMatches]) => (
          <Card key={roundNum}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Round {roundNum}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-1.5"
                    onClick={() => addMatch(roundNum)}
                  >
                    <Plus className="h-3 w-3 mr-0.5" />
                    Match
                  </Button>
                  {roundMatches.every(m => m.status !== 'completed') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-1.5 text-destructive"
                      onClick={() => removeRound(roundNum)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {roundMatches.map((m, idx) => (
                <div
                  key={m.id}
                  draggable={m.status !== 'completed'}
                  onDragStart={() => { dragMatchRef.current = m.id; }}
                  onDragEnd={() => { dragMatchRef.current = null; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragMatchRef.current && dragMatchRef.current !== m.id) {
                      reorderMatch(dragMatchRef.current, m.id);
                    }
                    dragMatchRef.current = null;
                  }}
                  className={`flex items-center gap-1 ${m.status !== 'completed' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <span className="text-[10px] text-muted-foreground w-5 shrink-0 text-center">
                    {idx < division.courtCount ? `C${idx + 1}` : '...'}
                  </span>
                  <div className="flex-1">
                    <EditableMatch
                      match={m}
                      teams={activeTeams}
                      onUpdate={updateMatch}
                      onRemove={removeMatch}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" onClick={addRound} className="self-start">
        <Plus className="h-4 w-4 mr-1" />
        Add Round
      </Button>
    </div>
  );
}

function TeamSelect({
  value,
  teams,
  onChange,
  disabled,
  allowBye,
}: {
  value: string | null;
  teams: { id: string; name: string; color: string }[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
  allowBye?: boolean;
}) {
  const selected = teams.find(t => t.id === value);
  return (
    <select
      value={value ?? '__BYE__'}
      onChange={e => onChange(e.target.value === '__BYE__' ? null : e.target.value)}
      disabled={disabled}
      className="h-6 text-xs rounded px-1.5 py-0 border-0 font-medium cursor-pointer min-w-0 flex-1 outline-none"
      style={{
        backgroundColor: selected?.color ?? '#666',
        color: selected ? getContrastColor(selected.color) : '#fff',
      }}
    >
      {allowBye && <option value="__BYE__">BYE</option>}
      {teams.map(t => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}

function EditableMatch({
  match,
  teams,
  onUpdate,
  onRemove,
}: {
  match: Match;
  teams: { id: string; name: string; color: string }[];
  onUpdate: (id: string, updates: Partial<Match>) => void;
  onRemove: (id: string) => void;
}) {
  const isCompleted = match.status === 'completed';

  if (match.status === 'bye') {
    const teamId = match.homeTeamId ?? match.awayTeamId;
    return (
      <div className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-xs">
        <div className="flex items-center gap-1.5 flex-1">
          <TeamSelect
            value={teamId}
            teams={teams}
            onChange={v => {
              if (v) onUpdate(match.id, { homeTeamId: v, awayTeamId: null });
            }}
          />
          <Badge variant="outline" className="text-[10px] shrink-0">BYE</Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1"
            onClick={() => {
              // Convert BYE to a real match
              const otherId = teams.find(t => t.id !== teamId)?.id ?? null;
              onUpdate(match.id, { homeTeamId: teamId, awayTeamId: otherId, status: 'scheduled' });
            }}
            title="Convert to match"
          >
            +vs
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onRemove(match.id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  const isLive = match.status === 'in-progress';
  const statusColor = isCompleted ? 'bg-muted/30' : isLive ? 'bg-blue-500/10 border-blue-500/30' : '';

  return (
    <div className={`flex items-center gap-1.5 py-1.5 px-2 rounded border text-xs ${statusColor}`}>
      <TeamSelect
        value={match.homeTeamId}
        teams={teams.filter(t => t.id !== match.awayTeamId)}
        allowBye
        onChange={v => {
          if (v === null) {
            onUpdate(match.id, { homeTeamId: match.awayTeamId, awayTeamId: null, status: 'bye' });
          } else {
            onUpdate(match.id, { homeTeamId: v });
          }
        }}
      />

      <span className="text-muted-foreground shrink-0">vs</span>

      <TeamSelect
        value={match.awayTeamId}
        teams={teams.filter(t => t.id !== match.homeTeamId)}
        allowBye
        onChange={v => {
          if (v === null) {
            onUpdate(match.id, { awayTeamId: null, status: 'bye' });
          } else {
            onUpdate(match.id, { awayTeamId: v });
          }
        }}
      />

      {/* Editable scores for completed/in-progress */}
      {(isCompleted || isLive) && (
        <div className="flex items-center gap-0.5 shrink-0">
          <input
            type="number"
            min={0}
            max={99}
            value={match.homeScore ?? 0}
            onChange={e => onUpdate(match.id, { homeScore: Math.min(99, Math.max(0, parseInt(e.target.value) || 0)) })}
            className="w-7 h-5 text-center text-[10px] font-mono bg-transparent border rounded outline-none"
          />
          <span>-</span>
          <input
            type="number"
            min={0}
            max={99}
            value={match.awayScore ?? 0}
            onChange={e => onUpdate(match.id, { awayScore: Math.min(99, Math.max(0, parseInt(e.target.value) || 0)) })}
            className="w-7 h-5 text-center text-[10px] font-mono bg-transparent border rounded outline-none"
          />
        </div>
      )}

      {/* Status toggle */}
      {(isCompleted || isLive) && (
        <select
          value={match.status}
          onChange={e => onUpdate(match.id, {
            status: e.target.value as Match['status'],
            ...(e.target.value === 'scheduled' ? { homeScore: null, awayScore: null, completedAt: undefined } : {}),
          })}
          className="h-5 text-[9px] bg-transparent border rounded outline-none cursor-pointer px-0.5 shrink-0"
        >
          <option value="completed">Done</option>
          <option value="in-progress">Live</option>
          <option value="scheduled">Reset</option>
        </select>
      )}

      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={() => onRemove(match.id)}>
        <Trash2 className="h-3 w-3 text-destructive" />
      </Button>
    </div>
  );
}
