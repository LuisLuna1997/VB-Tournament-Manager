import { Badge } from '@/components/ui/badge';
import type { TournamentPhase } from '@/types/tournament';

const PHASE_CONFIG: Record<TournamentPhase, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  checkin: { label: 'Check-in', variant: 'outline' },
  'round-robin': { label: 'Round Robin', variant: 'default' },
  finals: { label: 'Finals', variant: 'destructive' },
  complete: { label: 'Complete', variant: 'secondary' },
};

export function PhaseIndicator({ phase }: { phase: TournamentPhase }) {
  const config = PHASE_CONFIG[phase];
  return (
    <Badge variant={config.variant} className="text-sm">
      {config.label}
    </Badge>
  );
}
