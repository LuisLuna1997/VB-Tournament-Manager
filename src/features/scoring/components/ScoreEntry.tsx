import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, Check, Play, Undo2 } from 'lucide-react';
import { useTournamentStore } from '@/stores/tournament.store';
import { TeamBadge } from '@/components/TeamBadge';
import type { Match } from '@/types/tournament';

interface Props {
  match: Match;
  onStart?: () => void;
  onComplete?: () => void;
}

export function ScoreEntry({ match, onStart, onComplete }: Props) {
  const { tournament, updateScore, completeMatch, startMatch, reopenMatch, resetMatch } = useTournamentStore();
  const homeTeam = match.homeTeamId ? tournament.teams[match.homeTeamId] : null;
  const awayTeam = match.awayTeamId ? tournament.teams[match.awayTeamId] : null;

  if (!homeTeam || !awayTeam) return null;

  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;

  const handleComplete = () => {
    if (homeScore === awayScore) {
      const message = match.isFinals
        ? `Complete this match as a ${homeScore}-${awayScore} tie? You'll pick the advancing team afterwards.`
        : `The score is tied ${homeScore}-${awayScore}. Complete it as a tie? Neither team will be credited with a win or a loss.`;
      if (!window.confirm(message)) return;
    }
    completeMatch(match.id);
    onComplete?.();
  };

  if (match.status === 'scheduled') {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TeamBadge teamId={homeTeam.id} className="px-3 py-1" />
              <span className="text-muted-foreground">vs</span>
              <TeamBadge teamId={awayTeam.id} className="px-3 py-1" />
            </div>
            <Button
              size="lg"
              onClick={() => onStart ? onStart() : startMatch(match.id)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="h-5 w-5 mr-1" />
              Start
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (match.status === 'completed') {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TeamBadge teamId={homeTeam.id} className="px-3 py-1" />
              <span className="font-mono text-2xl font-bold">
                {match.homeScore} - {match.awayScore}
              </span>
              <TeamBadge teamId={awayTeam.id} className="px-3 py-1" />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Final</Badge>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-muted-foreground"
                onClick={() => reopenMatch(match.id)}
                title="Reopen this match for correction — the score is kept"
              >
                <Undo2 className="h-3 w-3 mr-1" />
                Undo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // in-progress
  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/50">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Home team scoring */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <TeamBadge teamId={homeTeam.id} className="px-3 py-1" />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 text-xl"
                onClick={() => updateScore(match.id, Math.max(0, homeScore - 1), awayScore)}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <input
                type="number"
                min={0}
                max={99}
                value={homeScore}
                onChange={e => { const v = Math.min(99, Math.max(0, parseInt(e.target.value) || 0)); updateScore(match.id, v, awayScore); }}
                onFocus={e => e.target.select()}
                className="font-mono text-4xl font-bold w-16 text-center bg-transparent border-b-2 border-transparent focus:border-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 text-xl"
                onClick={() => updateScore(match.id, Math.min(99, homeScore + 1), awayScore)}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <span className="text-2xl text-muted-foreground font-light">vs</span>

          {/* Away team scoring */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <TeamBadge teamId={awayTeam.id} className="px-3 py-1" />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 text-xl"
                onClick={() => updateScore(match.id, homeScore, Math.max(0, awayScore - 1))}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <input
                type="number"
                min={0}
                max={99}
                value={awayScore}
                onChange={e => { const v = Math.min(99, Math.max(0, parseInt(e.target.value) || 0)); updateScore(match.id, homeScore, v); }}
                onFocus={e => e.target.select()}
                className="font-mono text-4xl font-bold w-16 text-center bg-transparent border-b-2 border-transparent focus:border-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 text-xl"
                onClick={() => updateScore(match.id, homeScore, Math.min(99, awayScore + 1))}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => resetMatch(match.id)}
          >
            <Undo2 className="h-3 w-3 mr-1" />
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={handleComplete}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Check className="h-5 w-5 mr-1" />
            Complete Match
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
