import { apiRequest } from './client';

export interface CopilotProposal {
  id: string;
  file: string;
  title: string;
  description: string;
  explanation: string;
  startLine: number;
  endLine: number;
  originalCode: string;
  proposedCode: string;
  diffSummary: string;
  status: 'PENDING_PERMISSION' | 'APPROVED_AND_APPLIED' | 'REJECTED' | 'REVERTED';
}

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  modelUsed?: string | null;
  provider?: string | null;
  createdAt: string;
  proposal?: CopilotProposal | null;
}

export interface CopilotConversation {
  id: string;
  userId: string;
  projectId: string | null;
  createdAt: string;
  messages: CopilotMessage[];
}

export async function createConversation(projectId?: string): Promise<CopilotConversation> {
  return apiRequest<CopilotConversation>('/copilot/conversations', {
    method: 'POST',
    body: projectId ? { projectId } : {},
  });
}

export async function getConversation(id: string): Promise<CopilotConversation> {
  return apiRequest<CopilotConversation>(`/copilot/conversations/${id}`);
}

export async function sendCopilotMessage(
  conversationId: string,
  text: string,
  provider?: string,
  model?: string,
  filePath?: string
): Promise<CopilotMessage> {
  return apiRequest<CopilotMessage>(`/copilot/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { text, provider, model, filePath },
  });
}

export async function setProposalStatus(
  proposalId: string,
  status: 'APPROVED_AND_APPLIED' | 'REJECTED' | 'REVERTED'
): Promise<CopilotProposal> {
  return apiRequest<CopilotProposal>(`/copilot/proposals/${proposalId}/status`, {
    method: 'POST',
    body: { status },
  });
}