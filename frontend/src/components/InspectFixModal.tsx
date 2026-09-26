import React, { useState } from 'react';
import { X, Sparkles, Check, Code2, CheckCircle2, Copy } from 'lucide-react';
import { Bug, AIFixHistoryItem } from '../types';

interface InspectFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  bug?: Bug | null;
  historyItem?: AIFixHistoryItem | null;
  onApplyPatch?: (bugId: string) => void;
}

export const InspectFixModal: React.FC<InspectFixModalProps> = ({
  isOpen,
  onClose,
  bug,
  historyItem,
  onApplyPatch
}) => {
  const [copied, setCopied] = useState(false);
  const [isApplied, setIsApplied] = useState(false);

  if (!isOpen) return null;

  const bugId = bug?.code || historyItem?.bugId || 'BUG-001';
  const bugTitle = bug?.title || historyItem?.bugTitle || 'Null pointer exception in user auth middleware';
  const model = bug?.fixSuggestion?.model || historyItem?.model || 'GPT-4o';
  const confidence = bug?.fixSuggestion?.confidence || historyItem?.confidence || 94;
  const lines = bug?.fixSuggestion?.lines || historyItem?.lines || 8;
  const explanation = bug?.fixSuggestion?.explanation || 
    'The `auth_middleware` attempts to directly dereference the JWT payload without verifying that `sub` exists or that the decoded token is a dictionary. Adding strict type checks and raising `HTTPException(401)` prevents unhandled 500 crashes.';

  const diffCode = bug?.fixSuggestion?.diffSnippet || `@@ -72,7 +72,11 @@ async def get_current_user(token: str = Depends(oauth2_scheme)):
     except JWTError:
         raise credentials_exception
-    user_id: str = payload.get("sub")
-    user = await get_user_by_id(user_id)
+    if not payload or not isinstance(payload, dict):
+        raise credentials_exception
+    user_id: str = payload.get("sub")
+    if not user_id:
+        raise credentials_exception
+    user = await get_user_by_id(user_id)
     return user`;

  const handleCopy = () => {
    navigator.clipboard.writeText(diffCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    setIsApplied(true);
    if (onApplyPatch) onApplyPatch(bugId);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#0D1117] border border-[#30363D] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-[#30363D] flex items-center justify-between bg-[#161B22]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-gray-200 text-xs px-2 py-0.5 rounded bg-[#0B0E14] border border-[#30363D]">
                  {bugId}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {model}
                </span>
                <span className="text-xs font-semibold text-green-400 bg-green-950/50 border border-green-500/30 px-2 py-0.5 rounded">
                  {confidence}% Confidence
                </span>
              </div>
              <h2 className="text-sm font-bold text-white mt-1">
                {bugTitle}
              </h2>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#21262D] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* Explanation Box */}
          <div className="p-3.5 rounded-lg bg-[#161B22] border border-[#30363D] space-y-1.5">
            <div className="font-semibold text-gray-200 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI Root Cause & Solution Rationale</span>
            </div>
            <p className="text-gray-400 leading-relaxed">
              {explanation}
            </p>
          </div>

          {/* Unified Diff View */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-200 flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Generated Unified Diff ({lines} lines altered)</span>
              </div>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161B22] hover:bg-[#21262D] text-gray-300 border border-[#30363D] transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy Diff'}</span>
              </button>
            </div>

            {/* Code block */}
            <div className="rounded-lg bg-[#0B0E14] border border-[#30363D] p-3 font-mono text-xs overflow-x-auto leading-relaxed">
              {diffCode.split('\n').map((line, idx) => {
                if (line.startsWith('+')) {
                  return (
                    <div key={idx} className="bg-green-950/40 text-green-300 px-2 py-0.5 rounded -mx-1 font-semibold">
                      {line}
                    </div>
                  );
                } else if (line.startsWith('-')) {
                  return (
                    <div key={idx} className="bg-red-950/40 text-red-400 px-2 py-0.5 rounded -mx-1 font-semibold line-through opacity-80">
                      {line}
                    </div>
                  );
                } else if (line.startsWith('@@')) {
                  return (
                    <div key={idx} className="text-indigo-400 py-1 font-semibold">
                      {line}
                    </div>
                  );
                }
                return (
                  <div key={idx} className="text-gray-400 px-2 py-0.5">
                    {line}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Test verification notice */}
          <div className="p-3 rounded-lg bg-green-950/20 border border-green-500/30 flex items-center gap-2.5 text-green-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Pre-tested in isolated Docker container — 0 regressions, all 31 tests passed.</span>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363D] flex items-center justify-between bg-[#161B22]">
          <div className="text-gray-400 text-xs">
            Estimated time saved: <strong className="text-gray-200">~15 mins</strong>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] text-gray-300 font-medium transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleApply}
              disabled={isApplied}
              className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-75"
            >
              <Check className="w-4 h-4" />
              <span>{isApplied ? 'Patch Applied!' : 'Apply Patch to Codebase'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
