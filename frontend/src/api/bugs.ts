import { apiRequest } from './client';
import { Bug } from '../types';

interface BackendProject {
  id: string;
  name: string;
}

interface BackendBug {
  id: string;
  code: string;
  title: string;
  description: string | null;
  tags: string[];
  severity: string;
  status: string;
  aiStatus: string;
  language: string;
  component: string;
  filePath: string | null;
  lineNumber: number | null;
  stackTrace: string | null;
  loggedDate: string;
  updatedAt: string;
}

const statusToBackend: Record<string, string> = {
  'Open': 'Open',
  'AI Suggested': 'AISuggested',
  'In Review': 'InReview',
  'Applying Fix': 'ApplyingFix',
  'Fixed': 'Fixed',
  'Closed': 'Closed',
};

const statusToFrontend: Record<string, string> = {
  Open: 'Open',
  AISuggested: 'AI Suggested',
  InReview: 'In Review',
  ApplyingFix: 'Applying Fix',
  Fixed: 'Fixed',
  Closed: 'Closed',
};

function toFrontendBug(b: BackendBug): Bug {
  return {
    id: b.id,
    code: b.code,
    title: b.title,
    description: b.description ?? '',
    tags: b.tags,
    severity: b.severity as Bug['severity'],
    status: (statusToFrontend[b.status] ?? b.status) as Bug['status'],
    aiStatus: b.aiStatus as Bug['aiStatus'],
    language: b.language,
    component: b.component,
    filePath: b.filePath ?? '',
    lineNumber: b.lineNumber ?? 0,
    stackTrace: b.stackTrace ?? '',
    loggedDate: b.loggedDate.slice(0, 10),
    updatedDate: b.updatedAt.slice(0, 10),
  } as Bug;
}

export async function getOrCreateDefaultProject(): Promise<string> {
  const list = await apiRequest<{ items?: BackendProject[] }>('/projects');
  if (list.items && list.items.length > 0) return list.items[0].id;
  
  const created = await apiRequest<BackendProject>('/projects', {
    method: 'POST',
    body: { name: 'Default Project', sourceType: 'PASTE' },
  });
  return created.id;
}

export async function fetchBugs(projectId: string): Promise<Bug[]> {
  const result = await apiRequest<{ items: BackendBug[] }>(`/bugs?projectId=${projectId}`);
  return result.items.map(toFrontendBug);
}

/** Deletes every bug in a project. Also clears that project's AI fix
 * history, since every fix belongs to exactly one bug. Returns the number
 * of bugs deleted. */
export async function clearBugs(projectId: string): Promise<number> {
  const result = await apiRequest<{ deleted: number }>(`/bugs?projectId=${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  return result.deleted;
}

export async function createBugApi(projectId: string, bug: Partial<Bug>): Promise<Bug> {
  const created = await apiRequest<BackendBug>('/bugs', {
    method: 'POST',
    body: {
      projectId,
      title: bug.title,
      description: bug.description,
      severity: bug.severity,
      language: bug.language,
      component: bug.component,
      filePath: bug.filePath || undefined,
      lineNumber: bug.lineNumber || undefined,
      stackTrace: bug.stackTrace || undefined,
      tags: bug.tags ?? [],
    },
  });
  return toFrontendBug(created);
}

export async function updateBugStatusApi(bugId: string, status: string): Promise<Bug> {
  const updated = await apiRequest<BackendBug>(`/bugs/${bugId}`, {
    method: 'PATCH',
    body: { status: statusToBackend[status] ?? status },
  });
  return toFrontendBug(updated);
}