import type { Tournament } from '@/types/tournament';
import { buildSheetPayload } from './schedule-export';

const LS_KEY_SCRIPT_URL = 'vb-apps-script-url';
const LS_KEY_AUTO_PUSH = 'vb-auto-push-enabled';

export function getAppsScriptUrl(): string {
  return localStorage.getItem(LS_KEY_SCRIPT_URL) ?? '';
}

export function setAppsScriptUrl(url: string): void {
  localStorage.setItem(LS_KEY_SCRIPT_URL, url.trim());
}

export function getAutoPushEnabled(): boolean {
  return localStorage.getItem(LS_KEY_AUTO_PUSH) === 'true';
}

export function setAutoPushEnabled(enabled: boolean): void {
  localStorage.setItem(LS_KEY_AUTO_PUSH, String(enabled));
}

export interface PushResult {
  ok: boolean;
  error?: string;
  // true when the push was fired but the response couldn't be read (CORS-blocked
  // deployment) — delivery is likely but unconfirmed
  unverified?: boolean;
}

export async function pushToSheet(tournament: Tournament): Promise<PushResult> {
  const url = getAppsScriptUrl();
  if (!url) return { ok: false, error: 'No Apps Script URL configured' };

  const body = JSON.stringify(buildSheetPayload(tournament));

  // text/plain keeps this a "simple request" (no CORS preflight). Apps Script
  // web apps deployed with access "Anyone" return CORS-readable responses, so
  // we can verify the script actually succeeded instead of assuming it did.
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      redirect: 'follow',
      body,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json().catch(() => null);
    if (json?.status === 'error') {
      return { ok: false, error: json.message ?? 'Apps Script reported an error' };
    }
    return { ok: true };
  } catch {
    // Older/locked-down deployments block cross-origin reads entirely.
    // Fall back to fire-and-forget so pushes keep working, but mark the
    // result unverified instead of claiming success.
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body,
      });
      return { ok: true, unverified: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }
}
