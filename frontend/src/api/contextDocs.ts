import { API_BASE_URL, ApiError, apiRequest, getAuthToken } from './client';
import { ContextDoc } from '../types';

const API_PREFIX = '/api/v1';

/** The missing connector: actually sends a context doc (txt/md/json/yaml/pdf/
 * sql/prisma) to the backend, where it's parsed and stored as a real
 * ContextDocument row that Phase 5/6's AI prompts read from. Mirrors
 * uploadProjectArchive's multipart pattern in client.ts. */
export async function uploadContextDoc(projectId: string, file: File, description?: string): Promise<ContextDoc> {
  const formData = new FormData();
  formData.append('file', file);
  if (description) formData.append('description', description);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}/projects/${projectId}/context-docs`, {
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
    const message = payload?.message ?? payload?.error?.message ?? `Context doc upload failed with status ${response.status}`;
    throw new ApiError(response.status, message, payload?.code ?? payload?.error?.code);
  }
  return payload as ContextDoc;
}

export async function fetchContextDocs(projectId: string): Promise<ContextDoc[]> {
  return apiRequest<ContextDoc[]>(`/projects/${projectId}/context-docs`);
}

export async function deleteContextDocApi(projectId: string, docId: string): Promise<void> {
  await apiRequest<void>(`/projects/${projectId}/context-docs/${docId}`, { method: 'DELETE' });
}
