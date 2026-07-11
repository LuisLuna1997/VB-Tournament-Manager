import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTournamentStore } from '@/stores/tournament.store';

interface Props {
  divisionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddPlayerDialog({ divisionId, open, onOpenChange }: Props) {
  const { addPlayer, getTeamsForDivision } = useTournamentStore();
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState<string>('__free_agent__');
  const teams = getTeamsForDivision(divisionId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addPlayer(divisionId, name.trim(), teamId === '__free_agent__' ? undefined : teamId);
    setName('');
    setTeamId('__free_agent__');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Player</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Player name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <Select value={teamId} onValueChange={v => setTeamId(v ?? '')}>
            <SelectTrigger>
              <SelectValue placeholder="Assign to team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__free_agent__">Free Agent</SelectItem>
              {teams.map(t => (
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
            <Button type="submit" disabled={!name.trim()}>
              Add Player
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
