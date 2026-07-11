import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getContrastColor } from '@/lib/colors';
import type { TeamStanding } from '@/types/tournament';

interface Props {
  standings: TeamStanding[];
}

export function StandingsTable({ standings }: Props) {
  if (standings.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No standings yet</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Team</TableHead>
          <TableHead className="text-center w-16">GP</TableHead>
          <TableHead className="text-center w-16">W</TableHead>
          <TableHead className="text-center w-16">L</TableHead>
          <TableHead className="text-center w-16">T</TableHead>
          <TableHead className="text-center w-20">PF</TableHead>
          <TableHead className="text-center w-20">PA</TableHead>
          <TableHead className="text-center w-20">Diff</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {standings.map(s => (
          <TableRow key={s.teamId}>
            <TableCell className="font-medium">{s.rank}</TableCell>
            <TableCell>
              <span
                className="px-2 py-0.5 rounded text-sm font-medium"
                style={{
                  backgroundColor: s.teamColor,
                  color: getContrastColor(s.teamColor),
                }}
              >
                {s.teamName}
              </span>
            </TableCell>
            <TableCell className="text-center font-mono text-muted-foreground">{s.gamesPlayed}</TableCell>
            <TableCell className="text-center font-mono">{s.wins}</TableCell>
            <TableCell className="text-center font-mono">{s.losses}</TableCell>
            <TableCell className="text-center font-mono">{s.ties}</TableCell>
            <TableCell className="text-center font-mono">{s.pointsFor}</TableCell>
            <TableCell className="text-center font-mono">{s.pointsAgainst}</TableCell>
            <TableCell className={`text-center font-mono font-semibold ${
              s.diff > 0 ? 'text-green-600' : s.diff < 0 ? 'text-red-600' : ''
            }`}>
              {s.diff > 0 ? '+' : ''}{s.diff}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
