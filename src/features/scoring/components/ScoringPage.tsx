import { useTournamentStore } from '@/stores/tournament.store';
import { getRoundsGrouped } from '@/lib/round-robin';
import { fillFreeCourts } from '@/lib/court-fill';
import { ScoreEntry } from './ScoreEntry';
import { MatchCard } from '@/features/schedule/components/MatchCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Trophy, Plus, RefreshCw } from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { AddTeamDialog } from '@/features/checkin/components/AddTeamDialog';
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
import { TeamBadge } from '@/components/TeamBadge';
import type { Match } from '@/types/tournament';

interface Props {
  divisionId: string;
}

function assignCourts(
  matches: Match[],
  courtCount: number,
  overrides: Record<string, number>
): Map<number, Match | null> {
  const courts = new Map<number, Match | null>();
  for (let i = 1; i <= courtCount; i++) courts.set(i, null);

  const inProgress = matches.filter(m => m.status === 'in-progress');
  const scheduled = matches.filter(m => m.status === 'scheduled');

  // 1. Place in-progress matches (override -> match.courtNumber fallback -> first empty)
  for (const m of inProgress) {
    const preferred = overrides[m.id] ?? (m.courtNumber > 0 && m.courtNumber <= courtCount ? m.courtNumber : 0);
    if (preferred && preferred <= courtCount && !courts.get(preferred)) {
      courts.set(preferred, m);
    } else {
      let placed = false;
      for (let i = 1; i <= courtCount; i++) {
        if (!courts.get(i)) { courts.set(i, m); placed = true; break; }
      }
      if (!placed) {
        for (let i = 1; i <= courtCount; i++) {
          const occ = courts.get(i);
          if (occ && occ.status === 'scheduled') { courts.set(i, m); break; }
        }
      }
    }
  }

  // 2. Place scheduled matches with overrides first
  for (const m of scheduled) {
    const override = overrides[m.id];
    if (override && override <= courtCount && !courts.get(override)) {
      courts.set(override, m);
    }
  }

  // 3. Fill remaining courts with unplaced scheduled matches
  for (const m of scheduled) {
    let alreadyPlaced = false;
    for (const [, placed] of courts) {
      if (placed?.id === m.id) { alreadyPlaced = true; break; }
    }
    if (alreadyPlaced) continue;
    for (let i = 1; i <= courtCount; i++) {
      if (!courts.get(i)) { courts.set(i, m); break; }
    }
  }

  return courts;
}

export function ScoringPage({ divisionId }: Props) {
  const { getRoundRobinMatches, startFinals, regenerateSchedule, getActiveTeams, tournament, startMatch, setTargetGames, setCourtNextUp: storeSetCourtNextUp, setCourtOverrides: storeSetCourtOverrides } =
    useTournamentStore();
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showFinalsDialog, setShowFinalsDialog] = useState(false);
  const [advancingCount, setAdvancingCount] = useState('4');
  const focusValueRef = useRef<string>('');
  // Court overrides: stored in Zustand so they persist across tab switches
  const courtOverrides = tournament.divisions[divisionId]?.courtOverrides ?? {};
  const setCourtOverrides = (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    const current = useTournamentStore.getState().tournament.divisions[divisionId]?.courtOverrides ?? {};
    const next = typeof updater === 'function' ? updater(current) : updater;
    storeSetCourtOverrides(divisionId, next);
  };
  // Next-up staging: read directly from store, write via store action
  const courtNextUp = tournament.divisions[divisionId]?.courtNextUp ?? {};
  const setCourtNextUp = (updater: Record<number, string> | ((prev: Record<number, string>) => Record<number, string>)) => {
    const current = useTournamentStore.getState().tournament.divisions[divisionId]?.courtNextUp ?? {};
    const next = typeof updater === 'function' ? updater(current) : updater;
    storeSetCourtNextUp(divisionId, next);
  };

  const matches = getRoundRobinMatches(divisionId);
  const rounds = getRoundsGrouped(matches);
  const activeTeams = getActiveTeams(divisionId);
  const division = tournament.divisions[divisionId];

  const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);
  const currentRoundEntry = sortedRounds.find(([, roundMatches]) =>
    roundMatches.some(m => m.status !== 'completed' && m.status !== 'bye')
  );
  const currentRoundNum = currentRoundEntry?.[0] ?? null;

  const currentRoundMatches = currentRoundEntry
    ? currentRoundEntry[1].filter(m => m.status !== 'bye')
    : [];

  const allComplete = matches.every(m => m.status === 'completed' || m.status === 'bye');
  const completedCount = matches.filter(m => m.status === 'completed').length;
  const totalPlayable = matches.filter(m => m.status !== 'bye').length;
  const totalRounds = sortedRounds.length;

  // Future rounds (after current)
  const upcomingRounds = currentRoundNum != null
    ? sortedRounds.filter(([num]) => num > currentRoundNum)
    : [];

  // Collect ALL playable matches (current round + future rounds)
  const allPlayableMatches = sortedRounds.flatMap(([, rm]) => rm.filter(m => m.status !== 'bye'));

  // Teams currently in-progress (busy) — can't be seated on a second court.
  const busyTeamIds = new Set<string>();
  for (const m of allPlayableMatches) {
    if (m.status === 'in-progress') {
      if (m.homeTeamId) busyTeamIds.add(m.homeTeamId);
      if (m.awayTeamId) busyTeamIds.add(m.awayTeamId);
    }
  }

  // Future scheduled matches (fill free courts / feed the queue).
  const futureScheduled = upcomingRounds.flatMap(([, rm]) =>
    rm.filter(m => m.status === 'scheduled' && m.homeTeamId && m.awayTeamId)
  );

  // Include future matches that have court overrides in the court assignment pool
  const futureOverridden = allPlayableMatches.filter(
    m => m.roundNumber !== currentRoundNum && courtOverrides[m.id] !== undefined
  );
  const courtPool = fillFreeCourts(
    [...currentRoundMatches, ...futureOverridden],
    futureScheduled,
    busyTeamIds,
    division.courtCount,
  );

  const courtAssignments = assignCourts(courtPool, division.courtCount, courtOverrides);

  // Auto-pin: if an in-progress match landed on a court without an override, persist it
  // so it won't jump on the next render (e.g., when another court's match completes)
  const missingOverrides: Record<string, number> = {};
  for (const [courtNum, m] of courtAssignments) {
    if (m && m.status === 'in-progress' && !courtOverrides[m.id]) {
      missingOverrides[m.id] = courtNum;
    }
  }
  // Auto-pin handled by startMatch(matchId, courtNum) which persists courtNumber on the match
  const assignedMatchIds = new Set(
    Array.from(courtAssignments.values()).filter(Boolean).map(m => m!.id)
  );
  const completedThisRound = currentRoundMatches.filter(m => m.status === 'completed');

  // Queue: current-round waiting + future scheduled, excluding anything now on a court.
  const currentWaiting = currentRoundMatches.filter(
    m => m.status === 'scheduled' && !assignedMatchIds.has(m.id)
  );
  const waitingMatches = [
    ...currentWaiting,
    ...futureScheduled.filter(m => !assignedMatchIds.has(m.id)),
  ];

  const handleStartFinals = () => {
    const count = parseInt(advancingCount);
    if (activeTeams.length < count) {
      toast.error(`Only ${activeTeams.length} active teams — pick a smaller bracket.`);
      return;
    }
    startFinals(divisionId, count);
    setShowFinalsDialog(false);
  };

  const openFinalsDialog = () => {
    // Default to the largest bracket the division can actually field
    setAdvancingCount(activeTeams.length >= 4 ? '4' : '2');
    setShowFinalsDialog(true);
  };

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* Tournament progress bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Tournament Progress</span>
          <Badge variant="secondary">
            {completedCount} / {totalPlayable} total games
          </Badge>
          <Badge variant="outline">
            {totalRounds} rounds
          </Badge>
          {(() => {
            const maxPossible = activeTeams.length > 1 ? activeTeams.length - 1 : 1;
            const currentTarget = division?.targetGames;
            const isOverMax = currentTarget != null && currentTarget > maxPossible;
            return (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>Teams play</span>
                <input
                  type="number"
                  min={1}
                  max={maxPossible}
                  value={currentTarget != null ? currentTarget : ''}
                  placeholder={String(maxPossible)}
                  onFocus={e => { focusValueRef.current = e.target.value; }}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    const capped = val > maxPossible ? maxPossible : val;
                    setTargetGames(divisionId, capped > 0 ? capped : null);
                  }}
                  onBlur={e => {
                    if (e.target.value === focusValueRef.current) return;
                    const keepOverrides: Record<string, number> = {};
                    for (const [matchId, court] of Object.entries(courtOverrides)) {
                      const m = tournament.matches[matchId];
                      if (m && m.status === 'in-progress') keepOverrides[matchId] = court;
                    }
                    regenerateSchedule(divisionId);
                    setCourtOverrides(keepOverrides);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className={`w-12 h-6 text-center text-xs font-mono border rounded bg-transparent outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isOverMax ? 'border-red-500' : ''}`}
                />
                <span>games (max: {maxPossible})</span>
              </div>
            );
          })()}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddTeam(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Team
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            // Preserve court overrides for in-progress matches
            const keepOverrides: Record<string, number> = {};
            for (const [matchId, court] of Object.entries(courtOverrides)) {
              const m = tournament.matches[matchId];
              if (m && m.status === 'in-progress') keepOverrides[matchId] = court;
            }
            regenerateSchedule(divisionId);
            setCourtOverrides(keepOverrides);
          }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Regen
          </Button>
          {allComplete && (
            <Button
              size="lg"
              onClick={openFinalsDialog}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Trophy className="h-5 w-5 mr-1" />
              Start Finals
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar visual */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary h-2 rounded-full transition-all"
          style={{ width: totalPlayable > 0 ? `${(completedCount / totalPlayable) * 100}%` : '0%' }}
        />
      </div>

      <Separator />

      {/* Current round header */}
      {currentRoundNum != null && (
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{currentRoundNum > 0 ? `Round ${currentRoundNum}` : 'In Progress'}</h3>
          <Badge variant="outline">
            {completedThisRound.length} / {currentRoundMatches.length} this round
          </Badge>
        </div>
      )}

      {/* Courts */}
      {currentRoundMatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from(courtAssignments.entries()).map(([courtNum, match]) => (
            <Card key={courtNum}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Court {courtNum}
                  {match?.status === 'in-progress' && (
                    <Badge className="bg-blue-500 text-white text-xs">Live</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {match ? (
                  <ScoreEntry
                    match={match}
                    onStart={() => {
                      setCourtOverrides(prev => ({ ...prev, [match.id]: courtNum }));
                      startMatch(match.id, courtNum);
                    }}
                    onComplete={() => {
                      // Promote staged next-up match to this court
                      const nextUpId = courtNextUp[courtNum];
                      if (nextUpId) {
                        setCourtOverrides(prev => ({ ...prev, [nextUpId]: courtNum }));
                        setCourtNextUp(prev => { const n = { ...prev }; delete n[courtNum]; return n; });
                      }
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Waiting for next match
                  </p>
                )}
                {/* Up Next drop zone for this court */}
                {(() => {
                  const nextId = courtNextUp[courtNum];
                  const nextMatch = nextId ? allPlayableMatches.find(m => m.id === nextId && m.status === 'scheduled') : null;
                  return (
                    <div
                      className={`mt-3 pt-3 border-t border-dashed min-h-[48px] rounded transition-colors ${
                        nextMatch ? '' : 'flex items-center justify-center'
                      }`}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('bg-primary/10', 'border-primary'); }}
                      onDragLeave={e => { e.currentTarget.classList.remove('bg-primary/10', 'border-primary'); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('bg-primary/10', 'border-primary');
                        const matchId = e.dataTransfer.getData('application/vb-match-id');
                        if (matchId) {
                          setCourtNextUp(prev => {
                            const next = { ...prev };
                            // Remove from other courts if staged there
                            for (const [k, v] of Object.entries(next)) {
                              if (v === matchId) delete next[Number(k)];
                            }
                            next[courtNum] = matchId;
                            return next;
                          });
                        }
                      }}
                    >
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">Up Next</span>
                      {nextMatch ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs">
                            {nextMatch.homeTeamId && <TeamBadge teamId={nextMatch.homeTeamId} />}
                            <span className="text-muted-foreground">vs</span>
                            {nextMatch.awayTeamId && <TeamBadge teamId={nextMatch.awayTeamId} />}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-6 text-[10px]"
                              onClick={() => {
                                setCourtOverrides(prev => ({ ...prev, [nextMatch.id]: courtNum }));
                                setCourtNextUp(prev => { const n = { ...prev }; delete n[courtNum]; return n; });
                              }}
                            >
                              Send to Court
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px]"
                              onClick={() => setCourtNextUp(prev => { const n = { ...prev }; delete n[courtNum]; return n; })}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Drag a match here from the queue</span>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Queue / Completed / Upcoming tabs */}
      {!allComplete && (
        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue">
              Queue {waitingMatches.length > 0 && `(${waitingMatches.length})`}
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed {completedThisRound.length > 0 && `(${completedThisRound.length})`}
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              Upcoming Rounds {upcomingRounds.length > 0 && `(${upcomingRounds.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            {waitingMatches.length > 0 ? (
              <Card>
                <CardContent className="flex flex-col gap-2 pt-4">
                  {waitingMatches.map(m => {
                    const homeBusy = m.homeTeamId ? busyTeamIds.has(m.homeTeamId) : false;
                    const awayBusy = m.awayTeamId ? busyTeamIds.has(m.awayTeamId) : false;
                    const matchBlocked = homeBusy || awayBusy;
                    const isFromFutureRound = currentRoundNum != null && m.roundNumber > currentRoundNum;

                    return (
                      <div
                        key={m.id}
                        draggable={!matchBlocked}
                        onDragStart={e => {
                          e.dataTransfer.setData('application/vb-match-id', m.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        className={`flex items-center justify-between py-2 px-3 rounded border ${
                          matchBlocked ? 'opacity-40 border-dashed' : 'cursor-grab active:cursor-grabbing'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isFromFutureRound && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              R{m.roundNumber}
                            </Badge>
                          )}
                          {(() => {
                            const stagedCourt = Object.entries(courtNextUp).find(([, mid]) => mid === m.id);
                            if (stagedCourt) return (
                              <Badge className="bg-amber-500 text-white text-[9px] h-4 px-1 shrink-0">
                                C{stagedCourt[0]} Next
                              </Badge>
                            );
                            return null;
                          })()}
                          <span className={`inline-flex items-center gap-1 ${homeBusy ? 'line-through' : ''}`}>
                            {m.homeTeamId && <TeamBadge teamId={m.homeTeamId} />}
                            {homeBusy && <Badge variant="destructive" className="text-[9px] h-4 px-1">Playing</Badge>}
                          </span>
                          <span className="text-xs text-muted-foreground">vs</span>
                          <span className={`inline-flex items-center gap-1 ${awayBusy ? 'line-through' : ''}`}>
                            {m.awayTeamId && <TeamBadge teamId={m.awayTeamId} />}
                            {awayBusy && <Badge variant="destructive" className="text-[9px] h-4 px-1">Playing</Badge>}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {Array.from({ length: division.courtCount }, (_, i) => i + 1).map(courtNum => {
                            const courtMatch = courtAssignments.get(courtNum);
                            const courtFree = !courtMatch || courtMatch.status === 'scheduled';
                            return (
                              <Button
                                key={courtNum}
                                size="sm"
                                variant={courtFree ? 'default' : 'outline'}
                                className="text-xs h-7"
                                disabled={matchBlocked}
                                onClick={() => {
                                  setCourtOverrides(prev => {
                                    const next = { ...prev };
                                    const currentOccupant = courtAssignments.get(courtNum);
                                    if (currentOccupant && currentOccupant.status === 'scheduled') {
                                      delete next[currentOccupant.id];
                                    }
                                    next[m.id] = courtNum;
                                    return next;
                                  });
                                }}
                              >
                                C{courtNum}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No matches waiting. All matches in this round are on courts or completed.
              </p>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedThisRound.length > 0 ? (
              <Card>
                <CardContent className="flex flex-col gap-2 pt-4">
                  {completedThisRound.map(m => (
                    <ScoreEntry key={m.id} match={m} />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No completed matches yet</p>
            )}
          </TabsContent>

          <TabsContent value="upcoming">
            {upcomingRounds.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingRounds.map(([roundNum, roundMatches]) => (
                  <Card key={roundNum}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Round {roundNum}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1.5">
                      {roundMatches.map(m => (
                        <MatchCard key={m.id} match={m} />
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                This is the last round.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}

      {allComplete && (
        <div className="text-center py-8">
          <h3 className="text-xl font-semibold mb-2">Round Robin Complete!</h3>
          <p className="text-muted-foreground mb-4">
            All {totalPlayable} matches have been played. Start the finals or review standings.
          </p>
        </div>
      )}

      <AddTeamDialog divisionId={divisionId} open={showAddTeam} onOpenChange={setShowAddTeam} />

      <Dialog open={showFinalsDialog} onOpenChange={setShowFinalsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Finals</DialogTitle>
            <DialogDescription>
              How many teams should advance to the elimination bracket?
            </DialogDescription>
          </DialogHeader>
          <Select value={advancingCount} onValueChange={v => setAdvancingCount(v ?? '2')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">Top 2 (Final only)</SelectItem>
              {activeTeams.length >= 4 && (
                <SelectItem value="4">Top 4 (Semis + Final)</SelectItem>
              )}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalsDialog(false)}>Cancel</Button>
            <Button onClick={handleStartFinals}>Start Finals</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
