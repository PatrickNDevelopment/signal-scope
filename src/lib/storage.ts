/** Browser persistence: the workspace (data + saved configurations) and the current settings. */
import { parseSavedConfig, validateWorkspace, type SavedConfig, type Workspace } from '../engine';

export const WORKSPACE_KEY = 'signal-scope.workspace.v1';
export const CORRUPT_KEY = 'signal-scope.workspace.v1.corrupt';
export const SETTINGS_KEY = 'signal-scope.settings.v1';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; workspace: Workspace }
  | { kind: 'recovered'; raw: string; errors: string[] };

export function loadWorkspace(): LoadResult {
  const raw = read(WORKSPACE_KEY);
  if (raw === null) return { kind: 'empty' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return keepCorrupt(raw, ['the stored workspace is not valid JSON']);
  }
  const r = validateWorkspace(value);
  if (r.ok) return { kind: 'ok', workspace: r.workspace };
  return keepCorrupt(raw, r.errors);
}

function keepCorrupt(raw: string, errors: string[]): LoadResult {
  try {
    storage()?.setItem(CORRUPT_KEY, raw);
  } catch {
    /* the raw text is still returned so the UI can offer a download */
  }
  return { kind: 'recovered', raw, errors };
}

/** Returns an error message, or null when saved. */
export function saveWorkspace(ws: Workspace): string | null {
  const s = storage();
  if (s === null) return 'Browser storage is unavailable; export the workspace as JSON to keep it.';
  try {
    s.setItem(WORKSPACE_KEY, JSON.stringify(ws));
    return null;
  } catch {
    return 'The browser refused to store the workspace (storage may be full). Export it as JSON now.';
  }
}

export function loadSettings(): SavedConfig | null {
  const raw = read(SETTINGS_KEY);
  if (raw === null) return null;
  try {
    return parseSavedConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSettings(c: SavedConfig): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(c));
  } catch {
    /* settings are a convenience; the workspace save reports storage problems */
  }
}
