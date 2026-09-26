import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  CopilotMessage,
  createConversation,
  sendCopilotMessage,
  setProposalStatus,
} from '../api/copilot';
import { fetchWorkspaceFile, saveWorkspaceFile } from '../api/workspace';
import { ApiError } from '../api/client';

interface AgentPanelProps {
  projectId: string | null;
  activeModel: string;
  /** Workspace-relative path of the file currently open in the editor, so the
   * agent can see it automatically without the user having to name it. */
  activePath?: string | null;
  /** Prefilled prompt used when a workspace action requests a quick AI task. */
  initialPrompt?: string | null;
  /** Called after a proposal is approved and written to disk, so the editor/tree can refresh. */
  onFileWritten?: (path: string) => void;
  /** Called when the user clicks the panel's own minimize arrow. */
  onCollapse?: () => void;
}

type ProposalUiStatus = 'idle' | 'applying' | 'applied' | 'rejected' | 'error';

export const AgentPanel: React.FC<AgentPanelProps> = ({ projectId, activeModel, activePath, initialPrompt, onFileWritten, onCollapse }) => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, ProposalUiStatus>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const convo = await createConversation(projectId);
        setConversationId(convo.id);
        setMessages(convo.messages ?? []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not start a conversation.');
      }
    })();
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || !conversationId || sending) return;

    // Optimistically show the user's message.
    setMessages(prev => [
      ...prev,
      { id: `local-${Date.now()}`, sender: 'user', text, createdAt: new Date().toISOString() },
    ]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const reply = await sendCopilotMessage(conversationId, text, undefined, undefined, activePath ?? undefined);
      setMessages(prev => [...prev, reply]);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the agent.'
      );
    } finally {
      setSending(false);
    }
  };

  const approve = async (message: CopilotMessage) => {
    const proposal = message.proposal;
    if (!proposal) return;
    setProposalStatuses(prev => ({ ...prev, [proposal.id]: 'applying' }));
    try {
      // proposal.proposedCode is only the replacement snippet for
      // startLine..endLine, not the whole file — read the current file and
      // splice it in with a single find-and-replace of originalCode, the
      // same approach backend/app/modules/fixes/patch_service.py uses for
      // the Fixes flow. Writing proposedCode straight to disk would blow
      // away the rest of the file.
      //
      // Exception: the proposal may target a file that doesn't exist yet
      // (the AI proposing a brand-new file, e.g. as part of a "rename").
      // In that case there's no existing content to patch into — just
      // write proposedCode as the new file's full content. Note this app
      // has no delete-as-part-of-apply step, so a "rename" proposal will
      // leave the old file behind; the user has to remove it separately.
      if (!projectId) {
        throw new ApiError(0, 'No project selected yet.');
      }
      let current: string | null = null;
      try {
        current = (await fetchWorkspaceFile(projectId, proposal.file)).content;
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'NOT_A_FILE')) throw err;
      }
      let updated: string;
      if (current === null) {
        updated = proposal.proposedCode;
      } else if (current.includes(proposal.originalCode)) {
        updated = current.replace(proposal.originalCode, proposal.proposedCode);
      } else {
        throw new ApiError(0, 'The file has changed since this proposal was made — original code context was not found.');
      }
      await saveWorkspaceFile(projectId, proposal.file, updated);
      await setProposalStatus(proposal.id, 'APPROVED_AND_APPLIED');
      setProposalStatuses(prev => ({ ...prev, [proposal.id]: 'applied' }));
      onFileWritten?.(proposal.file);
    } catch (err) {
      setProposalStatuses(prev => ({ ...prev, [proposal.id]: 'error' }));
      setError(err instanceof ApiError ? err.message : 'Failed to apply the proposed change.');
    }
  };

  const reject = async (message: CopilotMessage) => {
    const proposal = message.proposal;
    if (!proposal) return;
    setProposalStatuses(prev => ({ ...prev, [proposal.id]: 'applying' }));
    try {
      await setProposalStatus(proposal.id, 'REJECTED');
      setProposalStatuses(prev => ({ ...prev, [proposal.id]: 'rejected' }));
    } catch (err) {
      setProposalStatuses(prev => ({ ...prev, [proposal.id]: 'error' }));
      setError(err instanceof ApiError ? err.message : 'Failed to reject the proposal.');
    }
  };

  return (
    <div className="w-80 shrink-0 bg-[#181818] border-l border-[#2D2D2D] flex flex-col h-full text-[#CCCCCC]">
      <div className="h-9 px-3 flex items-center justify-between border-b border-[#2D2D2D] shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#CCCCCC]">
          <Sparkles className="w-3.5 h-3.5 text-[#9CDCFE]" />
          <span>Agent</span>
        </div>
              <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#6A6A6A] font-mono">{activeModel}</span>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="text-[#858585] hover:text-white p-0.5"
              title="Minimize Agent panel"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {!projectId && (
          <p className="text-[11px] text-[#858585]">Waiting for a project to load…</p>
        )}

        {projectId && messages.length === 0 && !error && (
          <p className="text-[11px] text-[#858585]">
            Ask the agent about this codebase, or ask it to propose a fix for a bug.
          </p>
        )}

        {messages.map(msg => (
          <div key={msg.id} className="space-y-1.5">
            <div
              className={`text-[12px] leading-relaxed rounded-md px-2.5 py-1.5 ${
                msg.sender === 'user'
                  ? 'bg-[#2A2D2E] ml-4'
                  : 'bg-[#20262E] mr-1'
              }`}
            >
              <div className="text-[9px] uppercase tracking-wider text-[#6A6A6A] mb-0.5">
                {msg.sender === 'user' ? 'You' : msg.modelUsed ?? 'Agent'}
              </div>
              <div className="whitespace-pre-wrap break-words">{msg.text}</div>
            </div>

            {msg.proposal && (
              <ProposalCard
                message={msg}
                status={proposalStatuses[msg.proposal.id] ?? 'idle'}
                onApprove={() => void approve(msg)}
                onReject={() => void reject(msg)}
              />
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#858585] px-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Thinking…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-1.5 text-[11px] text-[#F48771] bg-[#4B1113]/30 border border-[#F48771]/40 rounded px-2 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="p-2.5 border-t border-[#2D2D2D] shrink-0">
        <div className="flex items-end gap-1.5 bg-[#252526] border border-[#3C3C3C] rounded-md px-2 py-1.5 focus-within:border-[#007ACC]">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask anything…"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-xs placeholder:text-[#6A6A6A] max-h-24"
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || sending || !conversationId}
            className="p-1 rounded text-[#858585] hover:text-white disabled:opacity-30 disabled:cursor-default shrink-0"
            title="Send"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const ProposalCard: React.FC<{
  message: CopilotMessage;
  status: ProposalUiStatus;
  onApprove: () => void;
  onReject: () => void;
}> = ({ message, status, onApprove, onReject }) => {
  const proposal = message.proposal!;
  const resolved = status === 'applied' || status === 'rejected' || proposal.status !== 'PENDING_PERMISSION';
  const effectiveStatus = status !== 'idle' ? status : proposal.status === 'APPROVED_AND_APPLIED' ? 'applied' : proposal.status === 'REJECTED' ? 'rejected' : 'idle';

  return (
    <div className="rounded-md border border-[#3C3C3C] bg-[#1E1E1E] overflow-hidden">
      <div className="px-2.5 py-1.5 border-b border-[#2D2D2D]">
        <div className="text-[11px] font-semibold text-[#CCCCCC]">{proposal.title || 'Proposed change'}</div>
        <div className="text-[10px] text-[#858585] font-mono truncate">{proposal.file}</div>
      </div>
      {proposal.diffSummary && (
        <div className="px-2.5 py-1.5 text-[11px] text-[#9CDCFE] border-b border-[#2D2D2D]">
          {proposal.diffSummary}
        </div>
      )}
      <pre className="px-2.5 py-1.5 text-[10.5px] font-mono text-[#CE9178] max-h-32 overflow-y-auto whitespace-pre-wrap">
        {proposal.proposedCode.slice(0, 800)}
      </pre>

      {!resolved && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-t border-[#2D2D2D]">
          <button
            onClick={onApprove}
            disabled={status === 'applying'}
            className="flex-1 flex items-center justify-center gap-1 bg-[#0E639C] hover:bg-[#1177BB] disabled:opacity-50 text-white text-[11px] font-medium py-1 rounded"
          >
            {status === 'applying' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Apply
          </button>
          <button
            onClick={onReject}
            disabled={status === 'applying'}
            className="flex-1 flex items-center justify-center gap-1 bg-[#3C3C3C] hover:bg-[#4A4A4A] disabled:opacity-50 text-[#CCCCCC] text-[11px] font-medium py-1 rounded"
          >
            <X className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}

      {effectiveStatus === 'applied' && (
        <div className="px-2.5 py-1.5 text-[11px] text-[#4EC9B0] border-t border-[#2D2D2D] flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Applied to {proposal.file}
        </div>
      )}
      {effectiveStatus === 'rejected' && (
        <div className="px-2.5 py-1.5 text-[11px] text-[#858585] border-t border-[#2D2D2D] flex items-center gap-1.5">
          <X className="w-3.5 h-3.5" /> Rejected
        </div>
      )}
      {effectiveStatus === 'error' && (
        <div className="px-2.5 py-1.5 text-[11px] text-[#F48771] border-t border-[#2D2D2D] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Something went wrong — try again.
        </div>
      )}
    </div>
  );
};