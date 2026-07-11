import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTournamentStore } from '@/stores/tournament.store';
import { FileSpreadsheet, Check } from 'lucide-react';
import { resolveColorName } from '@/lib/colors';

interface ParsedPlayer {
  name: string;
  status: 'unknown' | 'in' | 'out' | 'late';
  linkGroup: string | null;
}

interface ParsedRow {
  manager: string;
  division: string;
  teamName: string;
  color: string;
  players: ParsedPlayer[];
  selected: boolean;
  isFreeAgentPool: boolean;
}

function findBestSheet(workbook: XLSX.WorkBook): string {
  // Prefer exact "Teams" match first
  const exactMatch = workbook.SheetNames.find(s => s.toLowerCase() === 'teams');
  if (exactMatch) return exactMatch;
  // Then partial match
  const teamsSheet = workbook.SheetNames.find(
    s => s.toLowerCase().includes('team')
  );
  if (teamsSheet) return teamsSheet;
  // Fallback: find the sheet with the most columns containing "player"
  let best = workbook.SheetNames[0];
  let bestScore = 0;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', range: 0 });
    if (json.length === 0) continue;
    const keys = Object.keys(json[0]);
    const playerCols = keys.filter(k => k.toLowerCase().includes('player')).length;
    if (playerCols > bestScore) {
      bestScore = playerCols;
      best = name;
    }
  }
  return best;
}

function parseSpreadsheet(data: ArrayBuffer): { rows: ParsedRow[]; sheetName: string; sheetNames: string[] } {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = findBestSheet(workbook);
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

  const rows: ParsedRow[] = [];

  for (const row of json) {
    const keys = Object.keys(row);
    // Strip trailing colons/spaces from keys for matching
    const normalize = (s: string) => s.toLowerCase().replace(/[:.\s]+$/g, '').trim();
    const findCol = (patterns: string[], exclude?: string[]) => {
      for (const p of patterns) {
        const key = keys.find(k => {
          const norm = normalize(k);
          if (exclude?.some(ex => norm.includes(ex))) return false;
          return norm.includes(p);
        });
        if (key) return String(row[key]).trim();
      }
      return '';
    };

    const manager = findCol(['team manager', 'manager', 'staff']);
    const division = findCol(['division']);
    const teamName = findCol(['team name', 'team_name', 'teamname', 'team'], ['manager']);
    const color = findCol(['color', 'colour']);

    // Parse players with status and link group.
    // Column pattern: Player N | Status (IN/OUT/LATE) | Link (A/B/C...)
    const playerKeys = keys.filter(k => normalize(k).includes('player'));
    const players: ParsedPlayer[] = [];
    for (const pk of playerKeys) {
      const name = String(row[pk]).trim();
      if (!name) continue;
      const pkIndex = keys.indexOf(pk);
      let status: ParsedPlayer['status'] = 'unknown';
      let linkGroup: string | null = null;

      // Next column: status (IN/OUT/LATE)
      const statusKey = pkIndex < keys.length - 1 ? keys[pkIndex + 1] : null;
      if (statusKey && !normalize(statusKey).includes('player')) {
        const val = String(row[statusKey]).trim().toUpperCase();
        if (val === 'IN') status = 'in';
        else if (val === 'OUT') status = 'out';
        else if (val === 'LATE') status = 'late';

        // Column after status: link group (single letter A-Z)
        const linkKey = pkIndex < keys.length - 2 ? keys[pkIndex + 2] : null;
        if (linkKey && !normalize(linkKey).includes('player')) {
          const linkVal = String(row[linkKey]).trim().toUpperCase();
          if (linkVal.length === 1 && linkVal >= 'A' && linkVal <= 'Z') {
            linkGroup = linkVal;
          }
        }
      }
      players.push({ name, status, linkGroup });
    }

    if (teamName) {
      const isFreeAgentPool = teamName.toLowerCase().includes('free agent');
      rows.push({ manager, division, teamName, color, players, selected: true, isFreeAgentPool });
    }
  }

  return { rows, sheetName, sheetNames: workbook.SheetNames };
}

/**
 * Does a parsed row's "Division" cell refer to the division we're importing into?
 * Matched leniently against the division's display name and canonical level
 * (case-insensitive, prefix-tolerant so "Beginner" ≈ "beginners"). Used to
 * pre-select only the current division's rows — including its free-agent pool —
 * so importing "Intermediate" doesn't silently pull the "Advanced" pool with it.
 */
function rowMatchesDivision(csvDivision: string, divisionName: string, divisionLevel: string): boolean {
  const d = csvDivision.trim().toLowerCase();
  if (d.length < 3) return false;
  return [divisionName.trim().toLowerCase(), divisionLevel.trim().toLowerCase()].some(
    c => c.length >= 3 && (c === d || c.startsWith(d) || d.startsWith(c))
  );
}

export function useImportSpreadsheet(divisionId: string) {
  const { importTeams, tournament, addPlayer, updatePlayerStatus, setPlayerLinkGroup } = useTournamentStore();
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [sheetUsed, setSheetUsed] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const division = tournament.divisions[divisionId];

  const triggerFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setFileName(file.name);
        const data = await file.arrayBuffer();
        const result = parseSpreadsheet(data);
        // Pre-select only rows belonging to the division we're importing into
        // (its teams AND its free-agent pool). If the sheet carries no division
        // info that lines up with this division, fall back to selecting all so
        // we never open with an empty selection.
        const matches = result.rows.map(r =>
          division ? rowMatchesDivision(r.division, division.name, division.level) : true
        );
        const anyMatch = matches.some(Boolean);
        setParsedRows(result.rows.map((r, i) => ({ ...r, selected: anyMatch ? matches[i] : true })));
        setSheetUsed(result.sheetName);
        setShowPreview(true);
      } catch (err) {
        console.error('Failed to parse spreadsheet:', err);
        alert('Failed to parse file. Make sure it is a valid .xlsx or .csv file.');
      }
    };
    input.click();
  };

  const toggleRow = (idx: number) => {
    setParsedRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const toggleAll = () => {
    const allSelected = parsedRows.every(r => r.selected);
    setParsedRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  const selectedRows = parsedRows.filter(r => r.selected);

  const handleImport = () => {
    const teamRows = selectedRows.filter(r => !r.isFreeAgentPool);
    const freeAgentRows = selectedRows.filter(r => r.isFreeAgentPool);

    // Import teams
    importTeams(
      divisionId,
      teamRows.map(r => ({
        manager: r.manager,
        teamName: r.teamName,
        color: r.color,
        players: r.players,
      }))
    );

    // Import free agents
    for (const row of freeAgentRows) {
      for (const p of row.players) {
        if (p.name.trim()) {
          const pid = addPlayer(divisionId, p.name.trim());
          if (p.status !== 'unknown') {
            updatePlayerStatus(pid, p.status);
          }
          if (p.linkGroup) {
            setPlayerLinkGroup(pid, p.linkGroup);
          }
        }
      }
    }

    setParsedRows([]);
    setFileName('');
    setShowPreview(false);
  };

  const handleClose = () => {
    setParsedRows([]);
    setFileName('');
    setShowPreview(false);
  };

  return {
    triggerFilePicker,
    previewDialog: division ? (
      <Dialog open={showPreview} onOpenChange={open => { if (!open) handleClose(); }}>
        <DialogContent className="sm:max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Preview</DialogTitle>
            <DialogDescription>
              Select which teams to import into <strong>{division.name}</strong>. Rows matching this
              division — including its free-agent pool — are pre-selected; check or uncheck any as needed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="font-medium">{fileName}</span>
              <Badge variant="outline">Sheet: {sheetUsed}</Badge>
              <Badge variant="secondary">{parsedRows.length} teams found</Badge>
              <Badge variant="default">{selectedRows.length} selected</Badge>
            </div>

            {parsedRows.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-[700px] w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 w-8">
                        <input
                          type="checkbox"
                          checked={parsedRows.every(r => r.selected)}
                          onChange={toggleAll}
                          className="rounded"
                        />
                      </th>
                      <th className="text-left p-2">Manager</th>
                      <th className="text-left p-2">Team</th>
                      <th className="text-left p-2">Division</th>
                      <th className="text-left p-2">Color</th>
                      <th className="text-left p-2">Players</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => {
                      const hex = resolveColorName(row.color);
                      return (
                        <tr
                          key={i}
                          className={`border-t cursor-pointer hover:bg-muted/50 ${!row.selected ? 'opacity-40' : ''} ${row.isFreeAgentPool ? 'bg-amber-500/10' : ''}`}
                          onClick={() => toggleRow(i)}
                        >
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => toggleRow(i)}
                              className="rounded"
                            />
                          </td>
                          <td className="p-2">{row.manager || '-'}</td>
                          <td className="p-2 font-medium">
                            {row.isFreeAgentPool ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                Free Agents{row.division ? ` — ${row.division}` : ''}
                              </span>
                            ) : row.teamName}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">{row.division || '-'}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              {hex && (
                                <span
                                  className="w-4 h-4 rounded-full inline-block border"
                                  style={{ backgroundColor: hex }}
                                />
                              )}
                              <span>{row.color || 'Auto'}</span>
                            </div>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                            {row.players.length > 0 ? row.players.map((p, j) => (
                              <span key={j}>
                                {j > 0 && ', '}
                                {p.name}
                                {p.status !== 'unknown' && (
                                  <span className={`ml-0.5 text-[9px] font-semibold ${
                                    p.status === 'in' ? 'text-green-500' :
                                    p.status === 'out' ? 'text-red-500' :
                                    'text-yellow-500'
                                  }`}>
                                    {p.status.toUpperCase()}
                                  </span>
                                )}
                              </span>
                            )) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No teams found in sheet "{sheetUsed}". Make sure it has a "Team Name" column.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={selectedRows.length === 0}>
              <Check className="h-4 w-4 mr-1" />
              Import {selectedRows.filter(r => !r.isFreeAgentPool).length} Teams
              {selectedRows.some(r => r.isFreeAgentPool) && ` + ${selectedRows.filter(r => r.isFreeAgentPool).flatMap(r => r.players).length} Free Agents`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ) : null,
  };
}
