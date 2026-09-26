import { apiRequest } from './client';

export type PreviewBuild = 'original' | 'patched';

export interface PreviewFix {
  id: string;
  file: string;
  summary: string;
  status: 'Ready' | 'Applied';
}

export interface PreviewStateResponse {
  supported: boolean;
  /** Which build the workspace on disk currently reflects. */
  build: PreviewBuild;
  fixes: PreviewFix[];
}

export interface PreviewStartResponse {
  url: string;
  command: string;
  port: number;
  build: PreviewBuild;
  patchedFileCount: number;
  fixCount: number;
}

/**
 * Reads the current preview/build state without starting anything — used to
 * populate the embedded preview window (tabs, fix badges) before the person
 * presses Preview.
 */
export async function getPreviewState(projectId: string): Promise<PreviewStateResponse> {
  return apiRequest<PreviewStateResponse>(`/projects/${projectId}/preview/state`);
}

/**
 * Starts (or restarts) the live preview container for a project and returns
 * a real, reachable URL. `build` selects whether the AI's generated fixes
 * are applied to the workspace ("patched") or reverted ("original") before
 * the container starts — this re-applies/reverts real fix proposals via the
 * same logic the Fixes tab uses, not a simulated toggle.
 * Requires that analysis has run at least once (Phase 2 detects the
 * project's web-server command); the backend returns a 422 with code
 * PREVIEW_NOT_SUPPORTED otherwise.
 */
export async function startPreview(projectId: string, build: PreviewBuild = 'patched'): Promise<PreviewStartResponse> {
  return apiRequest<PreviewStartResponse>(`/projects/${projectId}/preview/start?build=${build}`, {
    method: 'POST',
  });
}

/** Stops the running preview container for a project, if any. */
export async function stopPreview(projectId: string): Promise<void> {
  await apiRequest<void>(`/projects/${projectId}/preview/stop`, {
    method: 'POST',
  });
}
