import React, { useState } from 'react';
import { FixAttempt } from '../types';
import { GitCompare, Copy, Check, Columns, AlignJustify, User, Bot, Sparkles, FileCode2 } from 'lucide-react';

interface AttemptDiffViewerProps {
  currentAttempt: FixAttempt;
  previousAttempt?: FixAttempt | null;
  className?: string;
}

export const AttemptDiffViewer: React.FC<AttemptDiffViewerProps> = ({
  currentAttempt,
  previousAttempt,
  className = ''
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentAttempt.diffSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to colorize unified diff lines
  const renderDiffLines = (diff: string) => {
    return diff.split('\n').map((line, idx) => {
      let bg = 'hover:bg-slate-800/40 text-slate-300';
      let symbol = ' ';

      if (line.startsWith('+')) {
        bg = 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500 font-medium';
        symbol = '+';
      } else if (line.startsWith('-')) {
        bg = 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500 line-through opacity-80';
        symbol = '-';
      } else if (line.startsWith('@')) {
        bg = 'bg-indigo-950/40 text-indigo-300 font-bold border-l-2 border-indigo-500';
      }

      return (
        <div key={idx} className={`px-3 py-0.5 font-mono text-xs flex items-start gap-2 ${bg}`}>
          <span className="w-6 text-right select-none text-slate-500 text-[10px]">{idx + 1}</span>
          <span className="select-none font-bold text-[11px] w-3">{line.startsWith('+') || line.startsWith('-') ? symbol : ''}</span>
          <span className="flex-1 whitespace-pre overflow-x-auto">{line}</span>
        </div>
      );
    });
  };

  return (
    <div id="attempt-diff-viewer" className={`rounded-xl bg-[#0d121d] border border-[#1f283d] overflow-hidden ${className}`}>
      {/* Diff Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#131826] border-b border-[#1f283d]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <GitCompare className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <span>Patch Revision: Attempt #{currentAttempt.attemptNumber}</span>
              {previousAttempt && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  vs Attempt #{previousAttempt.attemptNumber}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>Mode: <strong className="text-slate-200 capitalize">{currentAttempt.mode}</strong></span>
              <span>·</span>
              <span className="text-emerald-400 font-mono">+{currentAttempt.linesAdded ?? 4}</span>
              <span className="text-rose-400 font-mono">-{currentAttempt.linesRemoved ?? 0}</span>
            </div>
          </div>
        </div>

        {/* View mode toggle & Copy button */}
        <div className="flex items-center gap-2">
          {previousAttempt && (
            <div className="flex items-center bg-[#090d16] border border-[#1f283d] rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'unified' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <AlignJustify className="w-3.5 h-3.5" />
                <span>Unified</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'split' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a2236] hover:bg-[#222d48] border border-[#2b3754] text-slate-200 text-xs font-medium cursor-pointer transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Diff'}</span>
          </button>
        </div>
      </div>

      {/* Trigger Note Banner if manual or file edit */}
      {currentAttempt.triggerNote && (
        <div className="px-4 py-2 bg-purple-950/30 border-b border-purple-800/30 text-xs flex items-center gap-2 text-purple-200">
          <User className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          <span className="font-semibold text-purple-300">Prompt Guidance:</span>
          <span className="italic truncate font-mono">"{currentAttempt.triggerNote}"</span>
        </div>
      )}

      {currentAttempt.triggerFileEdit && (
        <div className="px-4 py-2 bg-cyan-950/30 border-b border-cyan-800/30 text-xs flex items-center gap-2 text-cyan-200">
          <FileCode2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          <span className="font-semibold text-cyan-300">Direct File Edit:</span>
          <span className="text-slate-300">Developer applied localized modification directly to source.</span>
        </div>
      )}

      {/* Diff Content View */}
      {viewMode === 'unified' || !previousAttempt ? (
        <div className="p-3 bg-[#090d16] font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto">
          {renderDiffLines(currentAttempt.diffSnippet)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#1f283d] bg-[#090d16] font-mono text-xs max-h-72 overflow-y-auto">
          {/* Previous Attempt Diff */}
          <div className="p-3 overflow-x-auto">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-sans">
              <Bot className="w-3 h-3 text-slate-400" />
              <span>Attempt #{previousAttempt.attemptNumber} (Previous)</span>
            </div>
            {renderDiffLines(previousAttempt.diffSnippet)}
          </div>

          {/* Current Attempt Diff */}
          <div className="p-3 overflow-x-auto bg-[#0a101d]">
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-sans">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Attempt #{currentAttempt.attemptNumber} (New Revision)</span>
            </div>
            {renderDiffLines(currentAttempt.diffSnippet)}
          </div>
        </div>
      )}
    </div>
  );
};
