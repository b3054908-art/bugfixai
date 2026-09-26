import { apiRequest } from './client';
import {
  AnalysisRunStatus,
  LogLine,
  PipelinePhase,
  PreviewCheckpoint,
  PreviewCheckpointFileEdit,
  PreviewCheckpointPromptMessage,
} from '../types';

interface BackendPipelineLog {
  id: string;
  phaseId: string | null;
  timestamp: string;
  level: string;
  category: string;
  message: string;
}

function toFrontendLog(l: BackendPipelineLog): LogLine {
  return {
    id: l.id,
    timestamp: l.timestamp,
    level: (l.level as LogLine['level']) ?? 'INFO',
    category: l.category,
    message: l.message,
  };
}

export function normalizeCheckpoint(raw: any): PreviewCheckpoint {
  return {
    id: raw.id,
    analysisRunId: raw.analysisRunId,
    previewSessionId: raw.previewSessionId ?? undefined,
    status: raw.status,
    promptMessages: Array.isArray(raw.promptMessages)
      ? raw.promptMessages.map((message: any): PreviewCheckpointPromptMessage => ({
          id: message.id,
          role: message.role,
          text: message.text,
          createdAt: message.createdAt,
        }))
      : [],
    fileEditsDetected: Array.isArray(raw.fileEditsDetected)
      ? raw.fileEditsDetected.map((edit: any): PreviewCheckpointFileEdit => ({
          filePath: edit.filePath,
          diffSnippet: edit.diffSnippet,
          detectedAt: edit.detectedAt,
          newContent: edit.newContent,
        }))
      : [],
    createdAt: raw.createdAt,
    resumedAt: raw.resumedAt ?? null,
  };
}

export function normalizePhase(raw: any): PipelinePhase {
  const status = String(raw.status ?? 'pending').toLowerCase();
  const normalizedStatus: PipelinePhase['status'] =
    status === 'running' ? 'running' :
    status === 'completed' ? 'completed' :
    status === 'failed' ? 'failed' :
    'pending';

  return {
    id: Number(raw.number ?? raw.id ?? 0),
    name: raw.name ?? 'Unknown phase',
    description: raw.description ?? '',
    duration: raw.durationMs !== null && raw.durationMs !== undefined ? `${Math.max(0, Math.round(raw.durationMs / 1000))}s` : undefined,
    status: normalizedStatus,
    subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.map((subtask: any) => ({
      name: subtask.name,
      completed: Boolean(subtask.completed),
    })) : undefined,
    subprocesses: raw.subprocesses,
    validationStatus: raw.validationStatus ?? 'idle',
    validationReport: raw.validationReport,
  };
}

export async function startAnalysis(projectId: string): Promise<{ id: string; projectId: string; status: AnalysisRunStatus }> {
  return apiRequest<{ id: string; projectId: string; status: AnalysisRunStatus }>(`/analysis/projects/${encodeURIComponent(projectId)}/run`, {
    method: 'POST',
  });
}

export async function getAnalysisRun(analysisId: string): Promise<{ run: any; phases: PipelinePhase[] }> {
  const run = await apiRequest<any>(`/analysis/${encodeURIComponent(analysisId)}`);
  return {
    run,
    phases: Array.isArray(run.phases) ? run.phases.map(normalizePhase) : [],
  };
}

export interface LatestAnalysisRun {
  id: string;
  status: AnalysisRunStatus;
}

/** Most recent analysis run for a project (backend already returns the list
 * newest-first), or null if the project has never had a run. Used by the
 * Workspace IDE's Output tab so it can show real pipeline logs without the
 * caller needing to thread analysisId state down from DashboardView. */
export async function fetchLatestAnalysisRun(projectId: string): Promise<LatestAnalysisRun | null> {
  const runs = await apiRequest<Array<{ id: string; status: string }>>(`/analysis/projects/${encodeURIComponent(projectId)}`);
  const latest = runs[0];
  return latest ? { id: latest.id, status: latest.status as AnalysisRunStatus } : null;
}

export async function getCheckpoint(analysisId: string): Promise<PreviewCheckpoint> {
  const checkpoint = await apiRequest<any>(`/analysis/${encodeURIComponent(analysisId)}/checkpoint`);
  return normalizeCheckpoint(checkpoint);
}

export async function postCheckpointPrompt(analysisId: string, text: string): Promise<PreviewCheckpoint> {
  const checkpoint = await apiRequest<any>(`/analysis/${encodeURIComponent(analysisId)}/checkpoint/prompt`, {
    method: 'POST',
    body: { text },
  });
  return normalizeCheckpoint(checkpoint);
}

export async function postCheckpointFileEdit(analysisId: string, edit: PreviewCheckpointFileEdit): Promise<PreviewCheckpoint> {
  const checkpoint = await apiRequest<any>(`/analysis/${encodeURIComponent(analysisId)}/checkpoint/file-edit`, {
    method: 'POST',
    body: {
      filePath: edit.filePath,
      diffSnippet: edit.diffSnippet,
      newContent: edit.newContent ?? '',
    },
  });
  return normalizeCheckpoint(checkpoint);
}

export async function resumeCheckpoint(analysisId: string): Promise<any> {
  return apiRequest<any>(`/analysis/${encodeURIComponent(analysisId)}/checkpoint/resume`, {
    method: 'POST',
  });
}

export async function fetchAnalysisLogs(analysisId: string, phaseNumber?: number): Promise<LogLine[]> {
  const params = new URLSearchParams();
  if (phaseNumber !== undefined) params.set('phase', String(phaseNumber));
  const qs = params.toString();
  const result = await apiRequest<BackendPipelineLog[]>(`/analysis/${analysisId}/logs${qs ? `?${qs}` : ''}`);
  return result.map(toFrontendLog);
}

/** Count of analysis runs recorded for a project (what "Recent Runs" is built from). */
export async function countAnalysisRuns(projectId: string): Promise<number> {
  const result = await apiRequest<{ count: number }>(`/analysis/projects/${encodeURIComponent(projectId)}/count`);
  return result.count;
}

/** Deletes a project's analysis run history. Bugs/fixes survive (their
 * analysisRunId link is just cleared); recorded test-run results for those
 * runs are deleted along with them since TestRun belongs to a run. */
export async function clearAnalysisRuns(projectId: string): Promise<number> {
  const result = await apiRequest<{ deleted: number }>(`/analysis/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  return result.deleted;
}

/** Deletes all analysis history shown in the Dashboard's account-wide Recent Runs panel. */
export async function clearRecentAnalysisRuns(): Promise<number> {
  const result = await apiRequest<{ deleted: number }>('/analysis/recent', {
    method: 'DELETE',
  });
  return result.deleted;
}
