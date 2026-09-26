import { API_BASE_URL, ApiError, getAuthToken } from './client';

const API_PREFIX = '/api/v1';

async function githubFetch<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getAuthToken()}`,
  };
  if (options.token) headers['x-github-token'] = options.token;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}/github${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the backend. Is it running?');
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message ?? payload?.error?.message ?? `GitHub request failed with status ${response.status}`;
    throw new ApiError(response.status, message, payload?.code ?? payload?.error?.code);
  }
  return payload as T;
}

export interface GithubConnectResult {
  id: string;
  repositoryUrl: string;
  defaultBranch: string;
}

export async function getGithubTokenStatus(): Promise<boolean> {
  const result = await githubFetch<{ connected: boolean }>('/token/status');
  return result.connected;
}

export async function saveGithubTokenOnly(token: string): Promise<void> {
  await githubFetch('/token', { method: 'POST', body: { token } });
}

export async function connectGithubRepo(
  projectId: string,
  owner: string,
  repo: string,
  branch: string | undefined,
  token?: string
): Promise<GithubConnectResult> {
  return githubFetch<GithubConnectResult>('/connect', {
    method: 'POST',
    body: { projectId, owner, repo, branch },
    token,
  });
}

/** Parses "https://github.com/owner/repo(.git)" into { owner, repo }. Returns null if it doesn't match. */
export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.trim().match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?\/?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}