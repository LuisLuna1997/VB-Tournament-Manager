import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useTournamentStore } from '@/stores/tournament.store';
import { useState } from 'react';
import { AddDivisionDialog } from './AddDivisionDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export function DivisionTabs({ children }: { children: React.ReactNode }) {
  const { tournament, activeDivisionId, setActiveDivision, removeDivision } = useTournamentStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const divisions = Object.values(tournament.divisions);

  const deleteDivision = deleteTarget ? tournament.divisions[deleteTarget] : null;
  const deleteTeamCount = deleteTarget
    ? Object.values(tournament.teams).filter(t => t.divisionId === deleteTarget).length
    : 0;
  const deleteMatchCount = deleteTarget
    ? Object.values(tournament.matches).filter(m => m.divisionId === deleteTarget).length
    : 0;

  if (divisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <h2 className="text-2xl font-semibold">No divisions yet</h2>
        <p className="text-muted-foreground">Create a division to get started</p>
        <Button size="lg" onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-5 w-5" />
          Add Division
        </Button>
        <AddDivisionDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Tabs
          value={activeDivisionId ?? undefined}
          onValueChange={setActiveDivision}
          className="flex-1"
        >
          <TabsList>
            {divisions.map(div => (
              <TabsTrigger key={div.id} value={div.id} className="text-sm font-medium group relative pr-7">
                {div.name}
                {/* span, not button: TabsTrigger already renders a <button> and nesting them is invalid HTML */}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation();
                    setDeleteTarget(div.id);
                    setDeleteConfirm('');
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget(div.id);
                      setDeleteConfirm('');
                    }
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity cursor-pointer"
                  title={`Delete ${div.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {activeDivisionId && children}
      <AddDivisionDialog open={showAddDialog} onOpenChange={setShowAddDialog} />

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) { setDeleteTarget(null); setDeleteConfirm(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Division: {deleteDivision?.name}</DialogTitle>
            <DialogDescription>
              This will permanently delete this division and all its data:
              {deleteTeamCount > 0 && ` ${deleteTeamCount} teams,`}
              {deleteMatchCount > 0 && ` ${deleteMatchCount} matches,`}
              {' '}all players and scores. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              Type <strong>{deleteDivision?.name}</strong> to confirm
            </label>
            <Input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={deleteDivision?.name}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}>
              Cancel
            </Button>
            <Button
              disabled={deleteConfirm !== deleteDivision?.name}
              onClick={() => {
                if (deleteTarget) removeDivision(deleteTarget);
                setDeleteTarget(null);
                setDeleteConfirm('');
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Division
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
