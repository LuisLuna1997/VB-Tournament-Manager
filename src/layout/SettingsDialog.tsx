import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  getAppsScriptUrl,
  setAppsScriptUrl,
  getAutoPushEnabled,
  setAutoPushEnabled,
  pushToSheet,
} from '@/lib/google-sheet-push';
import { useTournamentStore } from '@/stores/tournament.store';
import { Copy, ChevronDown, ChevronRight, CloudUpload } from 'lucide-react';

const APPS_SCRIPT_TEMPLATE = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Schedule sheet
    var scheduleSheet = ss.getSheetByName('Schedule') || ss.insertSheet('Schedule');
    scheduleSheet.clearContents();
    var headers = ['Division', 'Round', 'Court', 'Home', 'Away', 'Home Score', 'Away Score', 'Status'];
    scheduleSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (data.schedule && data.schedule.length > 0) {
      var rows = data.schedule.map(function(r) {
        return [r.division, r.round, r.court, r.home, r.away,
                r.homeScore !== null ? r.homeScore : '',
                r.awayScore !== null ? r.awayScore : '',
                r.status];
      });
      scheduleSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }

    // Standings sheet
    var standingsSheet = ss.getSheetByName('Standings') || ss.insertSheet('Standings');
    standingsSheet.clearContents();
    var sHeaders = ['Division', 'Rank', 'Team', 'W', 'L', 'PF', 'PA', 'Diff'];
    standingsSheet.getRange(1, 1, 1, sHeaders.length).setValues([sHeaders]).setFontWeight('bold');
    if (data.standings && data.standings.length > 0) {
      var sRows = data.standings.map(function(r) {
        return [r.division, r.rank, r.team, r.wins, r.losses, r.pointsFor, r.pointsAgainst, r.diff];
      });
      standingsSheet.getRange(2, 1, sRows.length, sHeaders.length).setValues(sRows);
    }

    // Meta sheet
    var metaSheet = ss.getSheetByName('Meta') || ss.insertSheet('Meta');
    metaSheet.getRange('A1').setValue('Last Updated');
    metaSheet.getRange('B1').setValue(new Date());
    metaSheet.getRange('A2').setValue('Tournament');
    metaSheet.getRange('B2').setValue(data.tournamentName || '');
    metaSheet.getRange('A3').setValue('Date');
    metaSheet.getRange('B3').setValue(data.date || '');

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const [url, setUrl] = useState('');
  const [autoPush, setAutoPush] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const tournament = useTournamentStore(s => s.tournament);

  // Re-read settings each time the dialog opens (state adjusted during
  // render instead of in an effect — avoids a cascading re-render)
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setUrl(getAppsScriptUrl());
      setAutoPush(getAutoPushEnabled());
    }
  }

  const handleSave = () => {
    setAppsScriptUrl(url);
    setAutoPushEnabled(autoPush);
    toast.success('Settings saved');
    onOpenChange(false);
  };

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    toast.success('Apps Script copied to clipboard');
  };

  const handleTestPush = async () => {
    if (!url.trim()) {
      toast.error('Enter an Apps Script URL first');
      return;
    }
    // Temporarily save the URL so pushToSheet can read it
    setAppsScriptUrl(url);
    toast.loading('Pushing to Sheet...');
    const result = await pushToSheet(tournament);
    toast.dismiss();
    if (result.ok) {
      toast.success('Push sent! Check your Google Sheet.');
    } else {
      toast.error(`Push failed: ${result.error}`);
    }
  };

  const isValidUrl = !url.trim() || url.trim().startsWith('https://script.google.com/');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Google Sheet Settings</DialogTitle>
          <DialogDescription>
            Push live schedule and standings to a Google Sheet for coaches to view.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Apps Script Web App URL</label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className={!isValidUrl ? 'border-destructive' : ''}
            />
            {!isValidUrl && (
              <p className="text-xs text-destructive">
                URL must start with https://script.google.com/
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-push"
              checked={autoPush}
              onChange={e => setAutoPush(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="auto-push" className="text-sm">
              Auto-push when a match completes (5s debounce)
            </label>
          </div>

          {url.trim() && (
            <Button variant="outline" size="sm" onClick={handleTestPush} className="self-start">
              <CloudUpload className="h-4 w-4 mr-1" />
              Test Push Now
            </Button>
          )}

          <div className="border rounded-lg">
            <button
              onClick={() => setShowScript(!showScript)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 rounded-lg"
            >
              {showScript ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Setup Instructions
            </button>
            {showScript && (
              <div className="px-3 pb-3 flex flex-col gap-2">
                <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
                  <li>Create a new Google Sheet</li>
                  <li>Go to Extensions &gt; Apps Script</li>
                  <li>Delete the default code and paste the script below</li>
                  <li>Click Deploy &gt; New deployment</li>
                  <li>Type: Web app, Execute as: Me, Who has access: Anyone</li>
                  <li>Copy the deployment URL and paste it above</li>
                </ol>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Apps Script Code</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleCopyScript}>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Script
                  </Button>
                </div>
                <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-48 overflow-y-auto font-mono">
                  {APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!isValidUrl}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
