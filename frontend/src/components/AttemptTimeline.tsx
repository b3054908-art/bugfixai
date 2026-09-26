import React from 'react';
import { FixAttempt, AnalysisRunStatus } from '../types';
import { Bot, User, CheckCircle2, XCircle, AlertTriangle, RefreshCw, GitCommit, FileCode2 } from 'lucide-react';

interface AttemptTimelineProps {
  attempts: FixAttempt[];
  currentAttemptIndex: number;
  onSelectAttempt?: (index: number) => void;
  runStatus: AnalysisRunStatus;
  autoAttemptCount: number;
  maxAutoAttempts?: number;
  hadHumanInputInRound: boolean;
  onOpenPromptPad?: () => void;
}

export const AttemptTimeline: React.FC<AttemptTimelineProps> = ({
  attempts,
  currentAttemptIndex,
  onSelectAttempt,
  runStatus,
  autoAttemptCount,
  maxAutoAttempts = 3,
  hadHumanInputInRound,
  onOpenPromptPad
}) => {
  return (
    <div id="attempt-timeline" className="rounded-xl bg-[#131826] border border-[#1f283d] p-3.5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <GitCommit className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <span>Fix Iteration Timeline</span>
              <span className="text-[11px] font-mono font-normal text-slate-400">
                ({attempts.length} {attempts.length === 1 ? 'attempt' : 'attempts'} recorded)
              </span>
            </div>
          </div>
        </div>

        {/* Governing Loop Mode Badge */}
        <div className="flex items-center gap-2">
          {hadHumanInputInRound ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-purple-500/15 border border-purple-500/30 text-purple-300">
              <User className="w-3 h-3 text-purple-400" />
              <span>Manual Loop Mode · Unlimited Attempts</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono">
              <Bot className="w-3 h-3 text-cyan-400" />
              <span>Auto Loop Mode · Cap: {autoAttemptCount}/{maxAutoAttempts}</span>
            </div>
          )}

          {runStatus === 'NEEDS_HUMAN_REVIEW' && (
            <button
              onClick={onOpenPromptPad}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Needs Human Review</span>
            </button>
          )}
        </div>
      </div>

      {/* Attempts Horizontal Flow */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {attempts.map((att, idx) => {
          const isSelected = idx === currentAttemptIndex;
          const isCurrentActive = idx === attempts.length - 1 && (runStatus === 'RUNNING' || runStatus === 'AWAITING_REVIEW');

          let statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
          let statusText = 'Passed';
          let borderStyle = 'border-[#243048] hover:border-slate-500';

          if (isCurrentActive) {
            statusIcon = <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />;
            statusText = runStatus === 'AWAITING_REVIEW' ? 'Checkpoint' : 'Testing';
            borderStyle = 'border-indigo-500/60 ring-1 ring-indigo-500/40';
          } else if (att.resultStatus === 'fail') {
            statusIcon = <XCircle className="w-3.5 h-3.5 text-rose-400" />;
            statusText = 'Failed';
            borderStyle = 'border-rose-500/40';
          } else if (att.resultStatus === 'pass') {
            statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
            statusText = 'Passed';
            borderStyle = 'border-emerald-500/30';
          }

          if (isSelected) {
            borderStyle += ' bg-[#1a2236] ring-2 ring-indigo-500';
          } else {
            borderStyle += ' bg-[#0f1422]';
          }

          return (
            <button
              key={att.id || idx}
              type="button"
              onClick={() => onSelectAttempt?.(idx)}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-left cursor-pointer transition-all ${borderStyle}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white font-mono">Attempt {att.attemptNumber}</span>
                {att.mode === 'manual' ? (
                  <span title="Human triggered (Prompt/File Edit)" className="p-0.5 rounded bg-purple-900/60 text-purple-300">
                    <User className="w-2.5 h-2.5" />
                  </span>
                ) : (
                  <span title="Automatic iteration" className="p-0.5 rounded bg-slate-800 text-slate-300">
                    <Bot className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>

              <div className="h-3 w-px bg-slate-700" />

              <div className="flex items-center gap-1 text-[11px]">
                {statusIcon}
                <span className={`font-medium ${
                  isCurrentActive ? 'text-indigo-300' :
                  att.resultStatus === 'pass' ? 'text-emerald-300' :
                  att.resultStatus === 'fail' ? 'text-rose-300' : 'text-slate-400'
                }`}>
                  {statusText}
                </span>
              </div>

              {att.triggerFileEdit && (
                <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-0.5" title="Direct file edit trigger">
                  <FileCode2 className="w-2.5 h-2.5" />
                </span>
              )}

              {att.errorFingerprint && att.resultStatus === 'fail' && (
                <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1 py-0.5 rounded">
                  {att.errorFingerprint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
