import React, { useState } from 'react';
import { PreviewCheckpointPromptMessage } from '../types';
import { Send, User, Bot, Sparkles, MessageSquareCode } from 'lucide-react';

interface PromptPadProps {
  messages: PreviewCheckpointPromptMessage[];
  onSubmitPrompt: (text: string) => void;
  isSubmitting?: boolean;
  className?: string;
  placeholder?: string;
}

const suggestedPrompts = [
  'Add strict None and isinstance(payload, dict) check in auth.py',
  'Return HTTP 401 with detail: "Invalid token payload" per OpenAPI spec',
  'Catch jwt.ExpiredSignatureError and return 401 instead of 500',
  'Verify that sub claim exists before calling get_user_by_id'
];

export const PromptPad: React.FC<PromptPadProps> = ({
  messages,
  onSubmitPrompt,
  isSubmitting = false,
  className = '',
  placeholder = 'Type instructions to guide the next patch revision...'
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSubmitting) return;
    onSubmitPrompt(inputText.trim());
    setInputText('');
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setInputText(suggestion);
  };

  return (
    <div id="prompt-pad" className={`flex flex-col rounded-xl bg-[#0f1422] border border-[#1f283d] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#131826] border-b border-[#1f283d]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <MessageSquareCode className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-white">PromptPad · Human Guidance</span>
        </div>
        <div className="text-[11px] text-purple-300 font-medium px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-800/40">
          Manual Loop Trigger (Unlimited)
        </div>
      </div>

      {/* Message History */}
      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto max-h-56 min-h-[120px] bg-[#0a0e1a]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-4 text-slate-500 text-xs">
            <Sparkles className="w-5 h-5 mb-1 text-purple-400 opacity-60" />
            <p className="text-slate-400 font-medium">No human prompt guidance applied yet</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Enter notes below to steer the AI patcher. Doing so automatically marks this round as a manual loop iteration.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 text-xs ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role !== 'user' && (
                <div className="w-6 h-6 rounded-md bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : msg.role === 'system'
                    ? 'bg-[#151c2d] text-cyan-300 border border-cyan-800/40 font-mono text-[11px]'
                    : 'bg-[#182032] text-slate-200 border border-[#243048]'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1 text-[10px] opacity-70">
                  <span className="font-semibold uppercase tracking-wider">
                    {msg.role === 'user' ? 'You (Developer)' : msg.role === 'system' ? 'System' : 'AI Patcher'}
                  </span>
                  <span>{msg.createdAt}</span>
                </div>
                <div>{msg.text}</div>
              </div>

              {msg.role === 'user' && (
                <div className="w-6 h-6 rounded-md bg-purple-950 border border-purple-500/40 flex items-center justify-center text-purple-300 flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-3 py-2 bg-[#0c101c] border-t border-[#1f283d] flex items-center gap-1.5 overflow-x-auto text-[11px]">
        <span className="text-[10px] text-slate-500 flex-shrink-0 font-medium uppercase">Quick Prompts:</span>
        {suggestedPrompts.map((sug, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelectSuggestion(sug)}
            className="flex-shrink-0 px-2 py-0.5 rounded-md bg-[#161c2c] hover:bg-[#1e273d] border border-[#232f48] text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {sug.length > 38 ? sug.substring(0, 38) + '...' : sug}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="p-2.5 bg-[#131826] border-t border-[#1f283d] flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-[#090d16] border border-[#243048] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
          disabled={isSubmitting}
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSubmitting}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white text-xs font-semibold cursor-pointer transition-colors"
        >
          <span>Send</span>
          <Send className="w-3 h-3" />
        </button>
      </form>
    </div>
  );
};
