import { useTournamentStore } from '@/stores/tournament.store';
import { CheckinPage } from '@/features/checkin/components/CheckinPage';
import { TeamsPage } from '@/features/checkin/components/TeamsPage';
import { SchedulePage } from '@/features/schedule/components/SchedulePage';
import { ScoringPage } from '@/features/scoring/components/ScoringPage';
import { StandingsPage } from '@/features/standings/components/StandingsPage';
import { FinalsPage } from '@/features/finals/components/FinalsPage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Props {
  divisionId: string;
}

export function DivisionView({ divisionId }: Props) {
  const division = useTournamentStore(s => s.tournament.divisions[divisionId]);

  if (!division) return null;

  if (division.phase === 'checkin') {
    return <CheckinPage divisionId={divisionId} />;
  }

  if (division.phase === 'finals' || division.phase === 'complete') {
    return (
      <Tabs defaultValue="finals">
        <TabsList>
          <TabsTrigger value="finals">Finals</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>
        <TabsContent value="finals">
          <FinalsPage divisionId={divisionId} />
        </TabsContent>
        <TabsContent value="standings">
          <StandingsPage divisionId={divisionId} />
        </TabsContent>
        <TabsContent value="schedule">
          <SchedulePage divisionId={divisionId} />
        </TabsContent>
        <TabsContent value="teams">
          <TeamsPage divisionId={divisionId} />
        </TabsContent>
      </Tabs>
    );
  }

  // round-robin phase
  return (
    <Tabs defaultValue="courts">
      <TabsList>
        <TabsTrigger value="courts">Courts</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="standings">Standings</TabsTrigger>
        <TabsTrigger value="teams">Teams</TabsTrigger>
      </TabsList>
      <TabsContent value="courts">
        <ScoringPage divisionId={divisionId} />
      </TabsContent>
      <TabsContent value="schedule">
        <SchedulePage divisionId={divisionId} />
      </TabsContent>
      <TabsContent value="standings">
        <StandingsPage divisionId={divisionId} />
      </TabsContent>
      <TabsContent value="teams">
        <TeamsPage divisionId={divisionId} />
      </TabsContent>
    </Tabs>
  );
}
