import { apiRequest } from './client';
import { AIFixHistoryItem, FixSummary } from '../types';

interface BackendFix {
  id: string;
  bugId: string;
  model: string;
  confidence: number;
  patchSummary: string;
  unifiedDiff: string;
  linesChanged: number;
  estimatedMinutes: number;
  status: string;
  createdAt: string;
  bug?: {
    code: string;
    title: string;
  };
}

function toFrontendFix(f: BackendFix): AIFixHistoryItem {
  return {
    id: f.id,
    bugId: f.bug?.code ?? f.bugId,
    bugTitle: f.bug?.title ?? f.patchSummary,
    patchSummary: f.patchSummary,
    date: f.createdAt.slice(0, 10),
    model: f.model,
    confidence: f.confidence,
    status: f.status as AIFixHistoryItem['status'],
    lines: f.linesChanged,
    estTime: `${f.estimatedMinutes}m`,
    fullDiff: f.unifiedDiff,
  };
}

export async function fetchFixHistory(analysisRunId?: string): Promise<AIFixHistoryItem[]> {
  const query = analysisRunId ? `?analysisRunId=${encodeURIComponent(analysisRunId)}` : '';
  const result = await apiRequest<BackendFix[]>(`/fixes/history${query}`);
  return result.map(toFrontendFix);
}

export async function downloadAnalysisFixes(analysisRunId: string, projectName: string): Promise<number> {
  const fixes = await fetchFixHistory(analysisRunId);
  if (fixes.length === 0) return 0;

  const patch = [
    `# BugFixer.ai AI-generated fixes for ${projectName}`,
    `# Analysis run: ${analysisRunId}`,
    '',
    ...fixes.map((fix) => `# ${fix.bugId}: ${fix.bugTitle}\n# ${fix.patchSummary}\n${fix.fullDiff}`),
  ].join('\n');
  const blobUrl = URL.createObjectURL(new Blob([patch], { type: 'text/x-patch' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${projectName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project'}-ai-fixes.patch`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    link.remove();
  }, 1000);
  return fixes.length;
}

export async function fetchFixSummary(): Promise<FixSummary> {
  return apiRequest<FixSummary>('/fixes/summary');
}

/** Deletes every AI fix/patch record for a project, leaving its bugs in
 * place. Returns the number of fix records deleted. */
export async function clearFixHistory(projectId: string): Promise<number> {
  const result = await apiRequest<{ deleted: number }>(`/fixes/history?projectId=${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  return result.deleted;
}