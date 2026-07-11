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
import { useTournamentStore } from '@/stores/tournament.store';
import { TEAM_COLORS } from '@/lib/colors';
import { Plus, X } from 'lucide-react';

interface Props {
  divisionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTeamDialog({ divisionId, open, onOpenChange }: Props) {
  const { addTeam, getNextAvailableColor, tournament, regenerateSchedule } = useTournamentStore();
  const [name, setName] = useState('');
  const [manager, setManager] = useState('');
  const [color, setColor] = useState(() => getNextAvailableColor(divisionId));
  const [playerNames, setPlayerNames] = useState<string[]>(['']);
  const [maxGames, setMaxGames] = useState('');

  const division = tournament.divisions[divisionId];
  const isMidTournament = division?.phase === 'round-robin';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const players = playerNames.filter(p => p.trim());
    const parsedMax = maxGames ? parseInt(maxGames) : null;
    addTeam(
      divisionId,
      name.trim(),
      color,
      players.length > 0 ? players : undefined,
      manager,
      parsedMax && parsedMax > 0 ? parsedMax : null,
    );
    // Auto-regenerate schedule if mid-tournament
    if (isMidTournament) {
      setTimeout(() => regenerateSchedule(divisionId), 0);
    }
    setName('');
    setManager('');
    setPlayerNames(['']);
    setMaxGames('');
    setColor(getNextAvailableColor(divisionId));
    onOpenChange(false);
  };

  const addPlayerField = () => setPlayerNames(prev => [...prev, '']);
  const removePlayerField = (idx: number) =>
    setPlayerNames(prev => prev.filter((_, i) => i !== idx));
  const updatePlayerName = (idx: number, val: string) =>
    setPlayerNames(prev => prev.map((p, i) => (i === idx ? val : p)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Team</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Team name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <Input
            placeholder="Team Manager (staff name)"
            value={manager}
            onChange={e => setManager(e.target.value)}
          />

          {isMidTournament && (
            <div>
              <label className="text-sm font-medium mb-1 block">
                Max Games
                <span className="text-muted-foreground font-normal ml-1">
                  (leave blank for full round-robin)
                </span>
              </label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 4"
                value={maxGames}
                onChange={e => setMaxGames(e.target.value)}
                className="w-32"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-2 block">Team Color</label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map(c => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  className={`w-8 h-8 rounded-full border-3 transition-transform ${color === c.hex ? 'ring-2 ring-offset-2 ring-primary ring-offset-background scale-110' : 'border-transparent'}`}
                  style={{
                    backgroundColor: c.hex,
                  }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Players (optional)</label>
            <div className="flex flex-col gap-2">
              {playerNames.map((pn, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder={`Player ${idx + 1}`}
                    value={pn}
                    onChange={e => updatePlayerName(idx, e.target.value)}
                  />
                  {playerNames.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePlayerField(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addPlayerField}>
                <Plus className="h-4 w-4 mr-1" />
                Add Player
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              Create Team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
