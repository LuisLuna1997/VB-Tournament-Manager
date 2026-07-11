import { useTournamentStore } from '@/stores/tournament.store';
import { ScoreEntry } from '@/features/scoring/components/ScoreEntry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, AlertTriangle, RefreshCw } from 'lucide-react';
import { getContrastColor } from '@/lib/colors';
import { resolveMatchWinner } from '@/lib/bracket';
import { useEffect, useState } from 'react';

interface Props {
  divisionId: string;
}

export function FinalsPage({ divisionId }: Props) {
  const { getFinalsMatches, generateFinals, advancePhase, setManualWinner, tournament } = useTournamentStore();
  const finalsMatches = getFinalsMatches(divisionId);
  const [tieWinners, setTieWinners] = useState<Record<string, string>>({});

  const semiMatches = finalsMatches.filter(m => m.finalsRound === 1);
  const championshipMatch = finalsMatches.find(m => m.finalsRound === 2);
  const thirdPlaceMatch = finalsMatches.find(m => m.finalsRound === 3);

  // Top-2 bracket: the single round-1 finals match IS the championship
  const isSingleFinal = semiMatches.length === 1 && finalsMatches.length === 1;
  const decidingMatch = championshipMatch ?? (isSingleFinal ? semiMatches[0] : undefined);

  const semisComplete = semiMatches.length === 2 && semiMatches.every(m => m.status === 'completed');
  const hasFinalRound = !!(championshipMatch || thirdPlaceMatch);

  // Tied semis still needing an organizer pick (manual winners are persisted on the match)
  const tiedSemis = semisComplete
    ? semiMatches.filter(m => m.homeScore === m.awayScore && !m.manualWinnerId)
    : [];
  const hasTies = tiedSemis.length > 0;
  const allTiesResolved = tiedSemis.every(m => tieWinners[m.id]);

  // Expected final-round participants from current semi results
  const expectedWinners = semisComplete ? semiMatches.map(m => resolveMatchWinner(m)) : [];
  const winnersKnown = expectedWinners.length === 2 && expectedWinners.every(Boolean);

  // Stale bracket: a semi result was corrected after the final round was generated
  const sameTeams = (match: { homeTeamId: string | null; awayTeamId: string | null } | undefined, ids: (string | null)[]) => {
    if (!match) return true;
    const a = new Set([match.homeTeamId, match.awayTeamId]);
    return ids.every(id => a.has(id));
  };
  const expectedLosers = winnersKnown
    ? semiMatches.map(m => (resolveMatchWinner(m) === m.homeTeamId ? m.awayTeamId : m.homeTeamId))
    : [];
  const bracketStale =
    hasFinalRound &&
    semisComplete &&
    winnersKnown &&
    (!sameTeams(championshipMatch, expectedWinners) || !sameTeams(thirdPlaceMatch, expectedLosers));

  const finalRoundUntouched = [championshipMatch, thirdPlaceMatch]
    .filter(Boolean)
    .every(m => m!.status === 'scheduled' && m!.homeScore === null && m!.awayScore === null);

  // Auto-generate finals when semis complete with decided winners
  useEffect(() => {
    if (semisComplete && !hasFinalRound && !hasTies && winnersKnown) {
      generateFinals(divisionId);
    }
  }, [semisComplete, hasFinalRound, hasTies, winnersKnown, divisionId, generateFinals]);

  // Auto-repair a stale bracket while the final round hasn't been touched
  useEffect(() => {
    if (bracketStale && finalRoundUntouched) {
      generateFinals(divisionId);
    }
  }, [bracketStale, finalRoundUntouched, divisionId, generateFinals]);

  const handleConfirmTieBreakers = () => {
    if (hasFinalRound && !finalRoundUntouched) {
      const ok = window.confirm(
        'Regenerating the final round will discard the scores already entered for the championship / 3rd place matches. Continue?'
      );
      if (!ok) return;
    }
    generateFinals(divisionId, tieWinners);
    setTieWinners({});
  };

  const handleRegenerateFinalRound = () => {
    const ok = window.confirm(
      'A semifinal result changed. Regenerating the final round will discard the scores already entered for the championship / 3rd place matches. Continue?'
    );
    if (!ok) return;
    generateFinals(divisionId);
  };

  // Determine champion (manual tie-break picks are persisted on the match)
  let champion: string | null = null;
  let championshipTied = false;

  if (decidingMatch?.status === 'completed') {
    const winner = resolveMatchWinner(decidingMatch);
    if (winner) {
      champion = winner;
    } else {
      championshipTied = true;
    }
  }

  const championTeam = champion ? tournament.teams[champion] : null;

  return (
    <div className="flex flex-col gap-6 mt-4">
      {champion && championTeam && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <CardContent className="py-6 text-center">
            <Trophy className="h-12 w-12 mx-auto mb-3 text-amber-600" />
            <h2 className="text-2xl font-bold mb-2">Champion!</h2>
            <span
              className="px-4 py-2 rounded text-lg font-bold"
              style={{
                backgroundColor: championTeam.color,
                color: getContrastColor(championTeam.color),
              }}
            >
              {championTeam.name}
            </span>
            {tournament.divisions[divisionId]?.phase !== 'complete' && (
              <div className="mt-4">
                <Button variant="outline" onClick={() => advancePhase(divisionId, 'complete')}>
                  Mark Division Complete
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stale bracket warning: a semi was corrected after final round was scored */}
      {bracketStale && !finalRoundUntouched && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Semifinal Results Changed
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              The championship and 3rd place pairings no longer match the semifinal winners.
              Regenerate the final round to fix the pairings (entered final-round scores will be discarded).
            </p>
            <Button onClick={handleRegenerateFinalRound} variant="outline" className="self-start">
              <RefreshCw className="h-4 w-4 mr-1" />
              Regenerate Final Round
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tied championship: manual winner picker (persisted on the match) */}
      {championshipTied && !champion && decidingMatch && (() => {
        const homeTeam = decidingMatch.homeTeamId ? tournament.teams[decidingMatch.homeTeamId] : null;
        const awayTeam = decidingMatch.awayTeamId ? tournament.teams[decidingMatch.awayTeamId] : null;
        return (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Championship Tied!
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                The final ended {decidingMatch.homeScore} - {decidingMatch.awayScore}. Select the champion:
              </p>
              <div className="flex gap-2">
                {homeTeam && (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => setManualWinner(decidingMatch.id, homeTeam.id)}
                    style={{ backgroundColor: homeTeam.color, color: getContrastColor(homeTeam.color) }}
                  >
                    {homeTeam.name} Wins
                  </Button>
                )}
                {awayTeam && (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => setManualWinner(decidingMatch.id, awayTeam.id)}
                    style={{ backgroundColor: awayTeam.color, color: getContrastColor(awayTeam.color) }}
                  >
                    {awayTeam.name} Wins
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Tied semi-finals: manual winner picker */}
      {semisComplete && hasTies && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Tied Semi-Finals
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              One or more semi-finals ended in a tie. Select which team advances from each tied match.
            </p>
            {tiedSemis.map(m => {
              const homeTeam = m.homeTeamId ? tournament.teams[m.homeTeamId] : null;
              const awayTeam = m.awayTeamId ? tournament.teams[m.awayTeamId] : null;
              const selected = tieWinners[m.id];
              return (
                <div key={m.id} className="flex flex-col gap-2">
                  <div className="text-sm font-medium">
                    {homeTeam?.name} {m.homeScore} - {m.awayScore} {awayTeam?.name}
                  </div>
                  <div className="flex gap-2">
                    {homeTeam && (
                      <Button
                        variant={selected === homeTeam.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTieWinners(prev => ({ ...prev, [m.id]: homeTeam.id }))}
                        style={selected === homeTeam.id ? {
                          backgroundColor: homeTeam.color,
                          color: getContrastColor(homeTeam.color),
                        } : {}}
                      >
                        {homeTeam.name} advances
                      </Button>
                    )}
                    {awayTeam && (
                      <Button
                        variant={selected === awayTeam.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTieWinners(prev => ({ ...prev, [m.id]: awayTeam.id }))}
                        style={selected === awayTeam.id ? {
                          backgroundColor: awayTeam.color,
                          color: getContrastColor(awayTeam.color),
                        } : {}}
                      >
                        {awayTeam.name} advances
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <Button
              onClick={handleConfirmTieBreakers}
              disabled={!allTiesResolved}
              className="self-start bg-green-600 hover:bg-green-700 text-white"
            >
              Confirm & Generate Finals
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Semifinals (only for 4-team brackets) */}
      {semiMatches.length === 2 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Semifinals</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {semiMatches.map(m => (
              <Card key={m.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Semi {m.courtNumber}
                    {m.status === 'completed' && m.homeScore === m.awayScore && (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-500 text-[10px]">TIED</Badge>
                    )}
                    {m.status === 'completed' && m.manualWinnerId && tournament.teams[m.manualWinnerId] && (
                      <Badge variant="outline" className="text-[10px]">
                        {tournament.teams[m.manualWinnerId].name} advanced
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScoreEntry match={m} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Single final (2-team bracket) */}
      {isSingleFinal && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            Final
          </h3>
          <ScoreEntry match={semiMatches[0]} />
        </div>
      )}

      {/* Championship */}
      {championshipMatch && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            Championship
          </h3>
          <ScoreEntry match={championshipMatch} />
        </div>
      )}

      {/* 3rd Place */}
      {thirdPlaceMatch && (
        <div>
          <h3 className="text-lg font-semibold mb-3">3rd Place</h3>
          <ScoreEntry match={thirdPlaceMatch} />
        </div>
      )}
    </div>
  );
}
