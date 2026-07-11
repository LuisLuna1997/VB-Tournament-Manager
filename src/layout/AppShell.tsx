import * as XLSX from 'xlsx';
import { useTournamentStore } from '@/stores/tournament.store';
import { DivisionTabs } from './DivisionTabs';
import { PhaseIndicator } from './PhaseIndicator';
import { DivisionView } from './DivisionView';
import { SettingsDialog } from './SettingsDialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, Download, Upload, Moon, Sun, Monitor, ClipboardCopy, Settings, CloudUpload } from 'lucide-react';
import { ScoreboardPage } from '@/features/scoreboard/ScoreboardPage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { buildScheduleRows, buildStandingRows, buildTsvClipboard } from '@/lib/schedule-export';
import { pushToSheet, getAppsScriptUrl } from '@/lib/google-sheet-push';

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('vb-dark-mode') === 'true';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('vb-dark-mode', String(dark));
  }, [dark]);

  return [dark, () => setDark(d => !d)] as const;
}

export function AppShell() {
  const { tournament, activeDivisionId, resetTournament, setTournamentName, exportState, importState } =
    useTournamentStore();
  const activeDivision = activeDivisionId ? tournament.divisions[activeDivisionId] : null;
  const [dark, toggleDark] = useDarkMode();
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const handleExportJSON = () => {
    const json = exportState();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tournament.name.replace(/\s+/g, '_')}_${tournament.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const teams = Object.values(tournament.teams);
    const players = Object.values(tournament.players);
    const divisions = Object.values(tournament.divisions);

    const wb = XLSX.utils.book_new();

    // Teams sheet: grouped by division with separator rows
    const teamsData: (string | number)[][] = [];
    for (const div of divisions) {
      if (teamsData.length > 0) teamsData.push([]);
      teamsData.push([`${div.name}`]);
      teamsData.push(['Team', 'Manager', 'Color', 'Status', 'Players']);
      const divTeams = teams.filter(t => t.divisionId === div.id);
      for (const t of divTeams) {
        const teamPlayers = t.playerIds.map(id => players.find(p => p.id === id)?.name ?? '').filter(Boolean).join('; ');
        teamsData.push([t.name, t.manager, t.color, t.checkinStatus, teamPlayers]);
      }
    }
    const teamsSheet = XLSX.utils.aoa_to_sheet(teamsData);
    XLSX.utils.book_append_sheet(wb, teamsSheet, 'Teams');

    // Matches sheet
    const scheduleRows = buildScheduleRows(tournament);
    const matchesData: (string | number)[][] = [['Division', 'Round', 'Court', 'Home', 'Away', 'Home Score', 'Away Score', 'Status']];
    for (const r of scheduleRows) {
      matchesData.push([r.division, r.round, r.court, r.home, r.away, r.homeScore ?? '', r.awayScore ?? '', r.status]);
    }
    const matchesSheet = XLSX.utils.aoa_to_sheet(matchesData);
    XLSX.utils.book_append_sheet(wb, matchesSheet, 'Matches');

    // Standings sheet
    const standingRows = buildStandingRows(tournament);
    const standingsData: (string | number)[][] = [['Division', 'Rank', 'Team', 'W', 'L', 'PF', 'PA', 'Diff']];
    for (const r of standingRows) {
      standingsData.push([r.division, r.rank, r.team, r.wins, r.losses, r.pointsFor, r.pointsAgainst, r.diff]);
    }
    const standingsSheet = XLSX.utils.aoa_to_sheet(standingsData);
    XLSX.utils.book_append_sheet(wb, standingsSheet, 'Standings');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tournament.name.replace(/\s+/g, '_')}_${tournament.date}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySchedule = async () => {
    const tsv = buildTsvClipboard(tournament);
    try {
      await navigator.clipboard.writeText(tsv);
      toast.success('Schedule copied to clipboard');
    } catch {
      toast.error('Failed to copy — try again');
    }
  };

  const handlePushToSheet = async () => {
    if (!getAppsScriptUrl()) {
      toast.error('No Apps Script URL configured');
      setShowSettings(true);
      return;
    }
    const toastId = toast.loading('Pushing to Sheet...');
    const result = await pushToSheet(tournament);
    toast.dismiss(toastId);
    if (result.ok) {
      toast.success('Schedule pushed to Google Sheet');
    } else {
      toast.error(`Push failed: ${result.error}`);
    }
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const hasData = Object.keys(tournament.divisions).length > 0;
      if (hasData) {
        const ok = window.confirm(
          `Importing "${file.name}" will replace the current tournament ("${tournament.name}") and all its data. Continue?`
        );
        if (!ok) return;
      }
      try {
        const text = await file.text();
        const ok = importState(text);
        if (!ok) alert('Invalid tournament file. Make sure it was exported from this app.');
      } catch {
        alert('Failed to read file.');
      }
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  setTournamentName(editName);
                  setIsEditing(false);
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="text-xl font-bold h-9 w-64"
                  autoFocus
                  onBlur={() => {
                    setTournamentName(editName);
                    setIsEditing(false);
                  }}
                />
              </form>
            ) : (
              <h1
                className="text-xl font-bold cursor-pointer hover:text-primary/80"
                onClick={() => {
                  setEditName(tournament.name);
                  setIsEditing(true);
                }}
              >
                {tournament.name}
              </h1>
            )}
            <span className="text-sm text-muted-foreground">{tournament.date}</span>
            {activeDivision && <PhaseIndicator phase={activeDivision.phase} />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowSettings(true)} title="Google Sheet Settings">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={toggleDark}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopySchedule}>
              <ClipboardCopy className="h-4 w-4 mr-1" />
              Copy Schedule
            </Button>
            <Button
              variant={showScoreboard ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowScoreboard(!showScoreboard)}
            >
              <Monitor className="h-4 w-4 mr-1" />
              Scoreboard
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportJSON}>
              <Upload className="h-4 w-4 mr-1" />
              Import Tournament
            </Button>
            <div className="relative group">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                Export Tournament
              </Button>
              <div className="absolute right-0 top-full pt-1 hidden group-hover:flex flex-col z-50 min-w-[140px]"><div className="bg-popover border rounded-md shadow-lg flex flex-col">
                <button
                  className="px-3 py-2 text-sm text-left hover:bg-muted rounded-t-md"
                  onClick={handleExportJSON}
                >
                  Export as JSON
                </button>
                <button
                  className="px-3 py-2 text-sm text-left hover:bg-muted"
                  onClick={handleExportCSV}
                >
                  Export as XLSX
                </button>
                <button
                  className="px-3 py-2 text-sm text-left hover:bg-muted rounded-b-md flex items-center gap-2"
                  onClick={handlePushToSheet}
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  Push to Google Sheet
                </button>
              </div></div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowReset(true)}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Dialog open={showReset} onOpenChange={open => { setShowReset(open); if (!open) setResetConfirm(''); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset Tournament</DialogTitle>
                  <DialogDescription>
                    This will delete all divisions, teams, players, and matches. Type RESET to
                    confirm.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  value={resetConfirm}
                  onChange={e => setResetConfirm(e.target.value)}
                  placeholder="Type RESET"
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowReset(false); setResetConfirm(''); }}>
                    Cancel
                  </Button>
                  <Button
                    disabled={resetConfirm !== 'RESET'}
                    onClick={() => {
                      resetTournament();
                      setResetConfirm('');
                      setShowReset(false);
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reset Everything
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
        </div>
      </header>

      {showScoreboard ? (
        <ScoreboardPage />
      ) : (
        <main className="px-6 py-4">
          <DivisionTabs>
            {activeDivisionId && <DivisionView divisionId={activeDivisionId} />}
          </DivisionTabs>
        </main>
      )}
    </div>
  );
}
