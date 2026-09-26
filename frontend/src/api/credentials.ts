import { apiRequest } from './client';

export interface ModelInfo {
  id: string;
  name: string;
  free: boolean;
  pricing?: string | null;
  /** Max context length, straight from the provider's own /models listing.
   * null when that provider's endpoint doesn't report it (OpenAI, Anthropic,
   * DeepSeek, NVIDIA currently don't) — never guessed. */
  contextWindow?: number | null;
}

/** Real quota for one (provider, model) pair, straight off that model's most
 * recent chat response headers. null fields mean the provider didn't report
 * that number — not that usage is unlimited. */
export interface ModelUsage {
  model: string;
  limitTokens: number | null;
  remainingTokens: number | null;
  limitRequests: number | null;
  remainingRequests: number | null;
  resetTokensSeconds: number | null;
  resetRequestsSeconds: number | null;
  capturedAt: number;
  exhausted: boolean;
}

export interface ProviderUsage {
  provider: string;
  /** False = no chat call has gone through this key yet, so there's no real
   * usage data — not that usage is fine. */
  tracked: boolean;
  models: ModelUsage[];
  /** The model closest to exhaustion among everything tracked for this key. */
  worst: ModelUsage | null;
  exhausted: boolean;
}

export interface CredentialStatus {
  provider: string;
  hasKey: boolean;
  /** True when no user key is saved but the server already has one via .env. */
  envFallback: boolean;
  baseUrl?: string | null;
}

export interface ModelsResponse {
  provider: string;
  configured: boolean;
  models: ModelInfo[];
}

export async function fetchCredentialStatus(): Promise<CredentialStatus[]> {
  return apiRequest<CredentialStatus[]>('/credentials');
}

export async function saveCredential(
  provider: string,
  apiKey: string,
  baseUrl?: string
): Promise<{ provider: string; models: ModelInfo[] }> {
  return apiRequest('/credentials', {
    method: 'POST',
    body: { provider, apiKey, baseUrl },
  });
}

export async function deleteCredential(provider: string): Promise<{ success: boolean }> {
  return apiRequest(`/credentials/${provider}`, { method: 'DELETE' });
}

export async function fetchProviderModels(provider: string): Promise<ModelsResponse> {
  return apiRequest<ModelsResponse>(`/credentials/${provider}/models`);
}

/** Real usage captured from chat calls made under this provider's key so
 * far — a model only appears once it's actually been called at least once. */
export async function fetchProviderUsage(provider: string): Promise<ProviderUsage> {
  return apiRequest<ProviderUsage>(`/credentials/${provider}/usage`);
}

/** One call covering every provider — powers the top-bar quota badge without
 * needing a request per provider just to render a dot. */
export async function fetchAllProviderUsage(): Promise<ProviderUsage[]> {
  return apiRequest<ProviderUsage[]>('/credentials/usage/all');
}
