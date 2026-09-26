import { apiRequest } from './client';

export interface MttrTrendPoint {
  week: string;
  avgResolutionHours: number;
  resolvedCount: number;
}

export interface AnalyticsResponse {
  mttrMinutes: number;
  aiRepairedBugs: number;
  testPassRate: number;
  bugsDetected: number;
  fixesGenerated: number;
  testRunCount: number;
  aiComputeCost: number | null;
  costTracked: boolean;
  rootCauses: Record<string, number>;
  mttrTrend: MttrTrendPoint[];
  timeline: {
    bugs: { date: string; status: string }[];
    fixes: { date: string; status: string; confidence: number }[];
  };
}

export async function fetchAnalytics(projectId: string): Promise<AnalyticsResponse> {
  return apiRequest<AnalyticsResponse>(`/analytics?projectId=${encodeURIComponent(projectId)}`);
}

/** Deletes recorded test-run data for a project (the one analytics metric
 * not already owned by the Bug/Fix History cards). Returns the number of
 * test-run records deleted. */
export async function clearAnalyticsTestRuns(projectId: string): Promise<number> {
  const result = await apiRequest<{ deleted: number }>(`/analytics?projectId=${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  return result.deleted;
}