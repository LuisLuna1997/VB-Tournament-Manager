import { useTournamentStore } from '@/stores/tournament.store';
import { StandingsTable } from './StandingsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  divisionId: string;
}

export function StandingsPage({ divisionId }: Props) {
  const { getStandings, tournament } = useTournamentStore();
  const standings = getStandings(divisionId);
  const division = tournament.divisions[divisionId];

  return (
    <div className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle>{division.name} Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <StandingsTable standings={standings} />
        </CardContent>
      </Card>
    </div>
  );
}
