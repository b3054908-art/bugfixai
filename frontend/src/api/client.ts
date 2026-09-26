/**
 * Core fetch wrapper for talking to the BugFixer backend.
 *
 * AUTO-DETECTS backend URL in Codespaces/localhost environments:
 * - If VITE_API_BASE_URL is set, uses that (explicit config)
 * - Otherwise, auto-detects by replacing frontend port with backend port (4000)
 * This ensures the app works across Codespace environment restarts without manual config
 *
 * AUTH:
 * Use a token saved by a future login screen, or VITE_DEV_TOKEN for a local
 * authenticated setup. When backend DEV_SKIP_AUTH is enabled, requests are
 * intentionally sent without a token and the backend creates the dev user.
 */

/**
 * Dynamically resolves the backend API base URL.
 * Works across localhost, Codespaces, and any other environment.
 */

function resolveApiBaseUrl(): string {
  // If explicitly configured via env, use that
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl;
  }

  const protocol = window.location.protocol; // 'https:' or 'http:'
  const hostname = window.location.hostname;
  const BACKEND_PORT = 4000;

  // Codespaces forwards the frontend through Vite, whose same-origin proxy
  // routes API and websocket requests to the backend container. The forwarded
  // host is not always a literal "-<port>" suffix, so treat any GitHub-hosted
  // app domain as a proxied origin instead of constructing a direct host:4000 URL.
  if (hostname.endsWith('.app.github.dev') || hostname.endsWith('.githubpreview.dev')) {
    return '';
  }

  // Plain localhost/LAN dev: host:port works fine here.
  return `${protocol}//${hostname}:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();
const API_PREFIX = '/api/v1';

export function getAuthToken(): string {
  return window.localStorage.getItem('bugfixer_access_token')
    || import.meta.env.VITE_DEV_TOKEN
    || '';
}

/** Builds the ws(s):// URL for the realtime gateway, scoped to a project. */
export function getRealtimeSocketUrl(projectId: string): string {
  const wsBase = API_BASE_URL
    ? API_BASE_URL.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  const params = new URLSearchParams({ projectId });
  const token = getAuthToken();
  if (token) params.set('token', token);
  return `${wsBase}/realtime?${params.toString()}`;
}

/** Uploads a project archive (multipart/form-data) — separate from apiRequest since it isn't JSON. */
export async function uploadProjectArchive(projectId: string, file: File): Promise<{ storagePath: string; sha256: string }> {
  const formData = new FormData();
  formData.append('file', file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}/projects/${projectId}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      body: formData,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the backend. Is it running?');
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message ?? payload?.error?.message ?? `Upload failed with status ${response.status}`;
    throw new ApiError(response.status, message, payload?.code ?? payload?.error?.code);
  }
  return payload;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    const fullPath = path === '/health' ? path : `${API_PREFIX}${path}`;
    response = await fetch(`${API_BASE_URL}${fullPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the backend. Is it running?');
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as { message?: string; code?: string; error?: { message?: string; code?: string } } | null;
    const message =
      errorPayload?.message ?? errorPayload?.error?.message ?? `Request failed with status ${response.status}`;
    const code = errorPayload?.code ?? errorPayload?.error?.code;
    throw new ApiError(response.status, message, code);
  }

  return payload as T;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const result = await apiRequest<{ status: string }>('/health');
    return result.status === 'ok';
  } catch {
    return false;
  }
}
