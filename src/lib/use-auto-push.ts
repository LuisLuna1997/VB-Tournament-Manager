import { useEffect, useRef } from 'react';
import { useTournamentStore } from '@/stores/tournament.store';
import { pushToSheet, getAutoPushEnabled, getAppsScriptUrl } from './google-sheet-push';
import { toast } from 'sonner';
import type { Match } from '@/types/tournament';

// Any change that alters what the sheet shows for finished games:
// a match completing, a completed result being edited, or being reopened/removed
function hasResultChange(curr: Record<string, Match>, prev: Record<string, Match>): boolean {
  for (const id of Object.keys(curr)) {
    const c = curr[id];
    const p = prev[id];
    if (c?.status === 'completed' && p?.status !== 'completed') return true;
    if (p?.status === 'completed' && c?.status !== 'completed') return true;
    if (
      c?.status === 'completed' &&
      p?.status === 'completed' &&
      (c.homeScore !== p.homeScore || c.awayScore !== p.awayScore)
    ) {
      return true;
    }
  }
  for (const id of Object.keys(prev)) {
    if (prev[id]?.status === 'completed' && !curr[id]) return true;
  }
  return false;
}

export function useAutoPush() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    const doPush = async () => {
      if (inflightRef.current) {
        // A push is already running — remember to push again when it finishes
        // so the latest state always reaches the sheet
        pendingRef.current = true;
        return;
      }
      inflightRef.current = true;

      try {
        const tournament = useTournamentStore.getState().tournament;
        const result = await pushToSheet(tournament);
        if (result.ok && result.unverified) {
          toast.success('Sheet push sent (delivery unconfirmed)');
        } else if (result.ok) {
          toast.success('Sheet updated');
        } else {
          toast.error(`Sheet push failed: ${result.error}`);
        }
      } finally {
        inflightRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          void doPush();
        }
      }
    };

    const unsub = useTournamentStore.subscribe(
      (state, prevState) => {
        // Read config from localStorage each time (avoids stale closures)
        if (!getAutoPushEnabled() || !getAppsScriptUrl()) return;

        if (!hasResultChange(state.tournament.matches, prevState.tournament.matches)) return;

        // 5-second trailing debounce
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { void doPush(); }, 5000);
      }
    );

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
