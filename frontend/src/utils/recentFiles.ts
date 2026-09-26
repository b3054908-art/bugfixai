/**
 * Tracks recently-opened Workspace IDE files, per project, in this browser.
 *
 * There is no server-side "recent files" concept in the backend — this is
 * genuinely a client-side cache (matching what the Settings page calls
 * "Recent History & Cache"), so it's stored in localStorage rather than
 * faked with a hardcoded number.
 */

const MAX_RECENT_FILES = 10;

interface RecentFileEntry {
  path: string;
  openedAt: string;
}

function storageKey(projectId: string): string {
  return `bugfixer_recent_files_${projectId}`;
}

export function getRecentFiles(projectId: string): RecentFileEntry[] {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentFile(projectId: string, path: string): void {
  try {
    const existing = getRecentFiles(projectId).filter(f => f.path !== path);
    const next = [{ path, openedAt: new Date().toISOString() }, ...existing].slice(0, MAX_RECENT_FILES);
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private browsing, quota, etc.) — recent
    // files is a convenience feature, so fail silently rather than
    // breaking file opening.
  }
}

/** Clears recent-file history for a project. Returns how many entries were removed. */
export function clearRecentFiles(projectId: string): number {
  const count = getRecentFiles(projectId).length;
  try {
    window.localStorage.removeItem(storageKey(projectId));
  } catch {
    // ignore
  }
  return count;
}