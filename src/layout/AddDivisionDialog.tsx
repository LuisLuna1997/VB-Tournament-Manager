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
import type { DivisionLevel } from '@/types/tournament';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDivisionDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<DivisionLevel>('beginners');
  const addDivision = useTournamentStore(s => s.addDivision);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addDivision(name.trim(), level);
    setName('');
    setLevel('beginners');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Division</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Division name (e.g. Advanced)"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <Select value={level} onValueChange={v => setLevel(v as DivisionLevel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginners">Beginners</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              Create Division
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
