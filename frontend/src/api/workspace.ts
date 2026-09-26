import { apiRequest, ApiError } from './client';

export interface WorkspaceTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: WorkspaceTreeNode[];
}

interface ProjectWithWorkspace {
  id: string;
  workspace?: { id: string; rootPath: string } | null;
}

// Cache the resolved workspace ID per project so we don't refetch the
// project on every single tree/file call within a session.
const workspaceIdCache = new Map<string, string>();

async function resolveWorkspaceId(projectId: string): Promise<string> {
  const cached = workspaceIdCache.get(projectId);
  if (cached) return cached;

  const project = await apiRequest<ProjectWithWorkspace>(`/projects/${projectId}`);
  if (!project.workspace?.id) {
    throw new ApiError(0, 'This project has no workspace yet. Upload or connect a project first.');
  }
  workspaceIdCache.set(projectId, project.workspace.id);
  return project.workspace.id;
}

/** Call this after deleting/recreating a project so a stale workspace ID isn't reused. */
export function clearWorkspaceCache(projectId?: string): void {
  if (projectId) workspaceIdCache.delete(projectId);
  else workspaceIdCache.clear();
}

export async function fetchWorkspaceTree(projectId: string): Promise<WorkspaceTreeNode[]> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<WorkspaceTreeNode[]>(`/workspaces/${workspaceId}/tree`);
}

export async function fetchWorkspaceFile(projectId: string, path: string): Promise<{ path: string; content: string }> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<{ path: string; content: string }>(`/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`);
}

export async function saveWorkspaceFile(projectId: string, path: string, content: string): Promise<{ path: string }> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<{ path: string }>(`/workspaces/${workspaceId}/file`, {
    method: 'PUT',
    body: { path, content },
  });
}

/** Deletes a file or folder (recursively) at the given workspace-relative path. */
export async function deleteWorkspacePath(projectId: string, path: string): Promise<{ path: string; deleted: boolean }> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<{ path: string; deleted: boolean }>(
    `/workspaces/${workspaceId}/path?path=${encodeURIComponent(path)}`,
    { method: 'DELETE' }
  );
}

/** Renames or moves a file/folder from oldPath to newPath (both workspace-relative). */
export async function renameWorkspacePath(
  projectId: string,
  oldPath: string,
  newPath: string
): Promise<{ oldPath: string; newPath: string }> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<{ oldPath: string; newPath: string }>(`/workspaces/${workspaceId}/rename`, {
    method: 'POST',
    body: { oldPath, newPath },
  });
}

/** Creates a new, empty folder at the given workspace-relative path. */
export async function createWorkspaceFolder(projectId: string, path: string): Promise<{ path: string }> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<{ path: string }>(`/workspaces/${workspaceId}/folder`, {
    method: 'POST',
    body: { path },
  });
}

export interface WorkspaceExecResult {
  stdout: string;
  stderr: string;
  code: number;
  durationMs: number;
  /** Workspace-relative dir the shell ended up in (reflects any `cd` the
   * command did). Pass this back in as `cwd` on the next call so `cd`
   * feels persistent even though each command runs in a fresh container. */
  cwd: string;
}

/** cwd: workspace-relative directory to run from (e.g. "backend"), sourced
 * from the previous call's WorkspaceExecResult.cwd. Omit/empty for the
 * workspace root. */
export async function execWorkspaceCommand(projectId: string, command: string, cwd?: string): Promise<WorkspaceExecResult> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<WorkspaceExecResult>(`/workspaces/${workspaceId}/exec`, {
    method: 'POST',
    body: { command, cwd: cwd ?? '' },
  });
}

export interface WorkspaceSearchMatch {
  file: string;
  line: number;
  preview: string;
}

export async function searchWorkspaceFiles(projectId: string, query: string): Promise<WorkspaceSearchMatch[]> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<WorkspaceSearchMatch[]>(`/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`);
}

export interface WorkspaceGitStatusEntry {
  path: string;
  status: string;
}

export interface WorkspaceGitStatus {
  branch: string;
  entries: WorkspaceGitStatusEntry[];
}

export async function fetchWorkspaceGitStatus(projectId: string): Promise<WorkspaceGitStatus> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<WorkspaceGitStatus>(`/workspaces/${workspaceId}/git/status`);
}

export async function fetchWorkspaceGitDiff(projectId: string, path?: string): Promise<string> {
  const workspaceId = await resolveWorkspaceId(projectId);
  const suffix = path ? `?path=${encodeURIComponent(path)}` : '';
  const result = await apiRequest<{ diff: string }>(`/workspaces/${workspaceId}/git/diff${suffix}`);
  return result.diff;
}

export async function commitWorkspaceChanges(projectId: string, message: string): Promise<{ committed: boolean }> {
  const workspaceId = await resolveWorkspaceId(projectId);
  return apiRequest<{ committed: boolean }>(`/workspaces/${workspaceId}/git/commit`, {
    method: 'POST',
    body: { message },
  });
}