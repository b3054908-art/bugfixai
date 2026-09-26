import { apiRequest } from './client';

export interface UserSettings {
  primaryProvider: string;
  primaryModel: string;
  autoRunTests: boolean;
  minimumConfidence: number;
  sandboxGuardrails: boolean;
}

export async function fetchSettings(): Promise<UserSettings> {
  return apiRequest<UserSettings>('/settings/me');
}

export async function updateSettings(
  primaryProvider?: string,
  primaryModel?: string
): Promise<UserSettings> {
  return apiRequest<UserSettings>('/settings/me', {
    method: 'PUT',
    body: { primaryProvider, primaryModel },
  });
}
