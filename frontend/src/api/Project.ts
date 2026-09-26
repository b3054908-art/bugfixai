import { apiRequest } from './client';

export interface BackendProjectDetail {
  id: string;
  name: string;
  sourceType: string;
  status: string;
  language: string | null;
  framework: string | null;
  workspace: { id: string; rootPath: string } | null;
}

/** Job 8: creates the Project row a ZIP/GitHub upload attaches to. This is
 * step 1 of the real "start analysis" flow -- step 2 is uploadProjectArchive
 * (client.ts, already existed), step 3 is startAnalysis (api/analysis.ts). */
export async function createProject(
  name: string,
  sourceType: 'ZIP' | 'GITHUB' | 'PASTE',
  extra?: { repositoryUrl?: string; defaultBranch?: string },
): Promise<BackendProjectDetail> {
  return apiRequest<BackendProjectDetail>('/projects', {
    method: 'POST',
    body: { name, sourceType, ...extra },
  });
}

export async function getProject(projectId: string): Promise<BackendProjectDetail> {
  return apiRequest<BackendProjectDetail>(`/projects/${encodeURIComponent(projectId)}`);
}