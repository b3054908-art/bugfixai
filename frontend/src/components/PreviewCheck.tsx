import React, { useState } from 'react';
import { PreviewCheckpoint, PreviewCheckpointFileEdit } from '../types';
import { PromptPad } from './PromptPad';
import { 
  X, 
  CheckCircle2, 
  FileCode2, 
  ArrowRight, 
  Sparkles, 
  User, 
  Save, 
  RotateCcw,
  Globe,
  Check
} from 'lucide-react';

interface PreviewCheckpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkpoint: PreviewCheckpoint;
  onDecision: (openPreview: boolean) => void;
  onSubmitPrompt: (text: string) => void;
  onSaveFileEdit: (edit: PreviewCheckpointFileEdit) => void;
  onTriggerManualLoop: () => void;
  onGoNext: () => void;
  hadHumanInput: boolean;
}

const defaultFileCode = `@router.get("/users/me", response_model=UserResponse)
async def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = decode_jwt_token(token)
    # Patched: Added defensive None and dict type guard
    if not payload or not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid token payload"
        )
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing subject claim in token"
        )
    user = await get_user_by_id(sub)
    return user`;

export const PreviewCheckpointModal: React.FC<PreviewCheckpointModalProps> = ({
  isOpen,
  onClose,
  checkpoint,
  onDecision,
  onSubmitPrompt,
  onSaveFileEdit,
  onTriggerManualLoop,
  onGoNext,
  hadHumanInput
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'prompt' | 'edit'>('preview');
  const [previewRoute, setPreviewRoute] = useState('/api/v1/users/me');
  const [authHeaderValue] = useState('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy');
  const [simulatedResponse, setSimulatedResponse] = useState<{ status: number; data: string }>({
    status: 401,
    data: '{\n  "detail": "Invalid token payload"\n}'
  });
  const [editableCode, setEditableCode] = useState(defaultFileCode);
  const [fileEditSaved, setFileEditSaved] = useState(false);

  if (!isOpen) return null;

  const handleSimulateRequest = (route: string) => {
    setPreviewRoute(route);
    if (route === '/api/v1/health') {
      setSimulatedResponse({
        status: 200,
        data: '{\n  "status": "healthy",\n  "version": "1.4.2",\n  "database": "connected",\n  "redis": "ok"\n}'
      });
    } else if (route === '/docs') {
      setSimulatedResponse({
        status: 200,
        data: '<!DOCTYPE html>\n<html>\n  <head><title>FastAPI - Swagger UI</title></head>\n  <body>FastAPI Interactive OpenAPI 3.0 Documentation</body>\n</html>'
      });
    } else {
      if (!authHeaderValue.trim() || authHeaderValue.includes('e30')) {
        setSimulatedResponse({
          status: 401,
          data: '{\n  "detail": "Invalid token payload"\n}'
        });
      } else {
        setSimulatedResponse({
          status: 200,
          data: '{\n  "id": "usr_99812",\n  "username": "admin@example.com",\n  "role": "system_admin",\n  "is_active": true\n}'
        });
      }
    }
  };

  const handleSaveDirectEdit = () => {
    onSaveFileEdit({
      filePath: 'src/app/routers/auth.py',
      diffSnippet: `@@ -76,5 +76,7 @@ direct file edit in auth.py`,
      detectedAt: new Date().toLocaleTimeString(),
      newContent: editableCode
    });
    setFileEditSaved(true);
    setTimeout(() => setFileEditSaved(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-[#0b0f19] border border-[#232f48] shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f283d] bg-[#121826]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Preview Checkpoint</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Post-Phase 8 Checkpoint
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Install → Build → Run & Test succeeded. Inspect running container before launching Phase 9 Regression Check.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* If user hasn't chosen to open preview yet, show initial decision prompt */}
        {checkpoint.status === 'awaiting_decision' ? (
          <div className="p-8 space-y-6 text-center max-w-xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h4 className="text-lg font-bold text-white">
                Launch Application Preview?
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                The Docker sandbox has finished compiling and initial tests passed. You can launch a live preview session with an interactive API client, PromptPad for steering, and direct file editing, or continue directly to the Phase 9 regression test suite.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onDecision(true)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20 transition-all"
              >
                <Globe className="w-4 h-4" />
                <span>Yes, Open Live Preview</span>
              </button>
              <button
                type="button"
                onClick={() => onDecision(false)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#1a2236] hover:bg-[#232e48] border border-[#2d3a58] text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>No, Skip to Phase 9 (Regression Check)</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        ) : (
          /* Checkpoint Preview Interface */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            
            {/* Top Navigation Tabs */}
            <div className="flex items-center justify-between px-6 py-2.5 bg-[#0e1320] border-b border-[#1f283d]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    activeTab === 'preview'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Sandbox Preview (:8000)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('prompt')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    activeTab === 'prompt'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>PromptPad</span>
                  {checkpoint.promptMessages.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-purple-900 text-purple-200 text-[10px] flex items-center justify-center font-mono">
                      {checkpoint.promptMessages.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    activeTab === 'edit'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>Direct File Edit</span>
                  {checkpoint.fileEditsDetected.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-300 text-[10px] flex items-center justify-center font-mono">
                      {checkpoint.fileEditsDetected.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Loop Status Pill */}
              <div className="flex items-center gap-2">
                {hadHumanInput ? (
                  <span className="text-[11px] font-semibold text-purple-300 bg-purple-500/20 border border-purple-500/40 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-purple-400" />
                    <span>Human Action Recorded · Manual Loop Active</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 font-mono">
                    Awaiting review action
                  </span>
                )}
              </div>
            </div>

            {/* Tab 1: Live Interactive Browser */}
            {activeTab === 'preview' && (
              <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-[#090d16]">
                {/* Browser Address Bar */}
                <div className="flex items-center gap-2 p-2 rounded-xl bg-[#121826] border border-[#1f283d]">
                  <div className="flex items-center gap-1.5 px-2 text-slate-400">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-mono text-emerald-400">http://localhost:8000</span>
                  </div>

                  <div className="flex-1 flex items-center gap-2 bg-[#090d16] border border-[#243048] rounded-lg px-2.5 py-1.5 text-xs text-white">
                    <span className="text-slate-500 font-mono select-none">GET</span>
                    <input
                      type="text"
                      value={previewRoute}
                      onChange={(e) => setPreviewRoute(e.target.value)}
                      className="flex-1 bg-transparent focus:outline-none font-mono text-xs text-slate-200"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSimulateRequest(previewRoute)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Send Request
                  </button>
                </div>

                {/* Quick Test Endpoints */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 text-[11px] uppercase font-semibold">Fast Probes:</span>
                  <button
                    type="button"
                    onClick={() => handleSimulateRequest('/api/v1/users/me')}
                    className="px-2.5 py-1 rounded-md bg-[#161c2d] hover:bg-[#202942] border border-[#243048] text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    /api/v1/users/me (Failing target)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimulateRequest('/api/v1/health')}
                    className="px-2.5 py-1 rounded-md bg-[#161c2d] hover:bg-[#202942] border border-[#243048] text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    /api/v1/health
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimulateRequest('/docs')}
                    className="px-2.5 py-1 rounded-md bg-[#161c2d] hover:bg-[#202942] border border-[#243048] text-slate-300 font-mono text-[11px] cursor-pointer"
                  >
                    /docs (Swagger UI)
                  </button>
                </div>

                {/* Simulated Server Response Card */}
                <div className="rounded-xl bg-[#121826] border border-[#1f283d] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#161d2e] border-b border-[#1f283d] text-xs">
                    <span className="text-slate-400 font-semibold">Response Preview</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                      simulatedResponse.status === 200
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}>
                      HTTP {simulatedResponse.status}
                    </span>
                  </div>
                  <pre className="p-4 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed bg-[#0a0e19]">
                    {simulatedResponse.data}
                  </pre>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs text-purple-200 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-purple-300">Preview Verified:</span> The FastAPI gateway successfully handles requests and correctly returns 401 Unauthorized instead of throwing an unhandled 500 server crash!
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: PromptPad Integration */}
            {activeTab === 'prompt' && (
              <div className="flex-1 p-6 overflow-y-auto bg-[#090d16]">
                <PromptPad
                  messages={checkpoint.promptMessages}
                  onSubmitPrompt={onSubmitPrompt}
                />
              </div>
            )}

            {/* Tab 3: Direct File Edit */}
            {activeTab === 'edit' && (
              <div className="flex-1 p-6 space-y-3 overflow-y-auto bg-[#090d16]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-cyan-400" />
                    <span className="font-mono text-xs text-white font-semibold">
                      src/app/routers/auth.py
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">(Direct Workspace Edit)</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveDirectEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    {fileEditSaved ? <Check className="w-3.5 h-3.5 text-white" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{fileEditSaved ? 'Saved to Workspace!' : 'Save Changes'}</span>
                  </button>
                </div>

                <textarea
                  value={editableCode}
                  onChange={(e) => setEditableCode(e.target.value)}
                  rows={12}
                  className="w-full bg-[#0a0e1a] border border-[#243048] rounded-xl p-3.5 font-mono text-xs text-cyan-300 focus:outline-none focus:border-cyan-500 leading-relaxed selection:bg-cyan-900"
                />

                <p className="text-[11px] text-slate-400">
                  Editing this file directly updates the isolated container overlay and records a human action, ensuring any subsequent test cycle operates under the <strong>Manual Loop (Unlimited attempts)</strong> rule.
                </p>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#121826] border-t border-[#1f283d]">
              <div className="text-xs text-slate-400">
                {hadHumanInput ? (
                  <span className="text-purple-300 font-medium">
                    Human input registered. You may re-run from Phase 4 or continue to Phase 9.
                  </span>
                ) : (
                  <span>Ready to test against regression suite.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {hadHumanInput && (
                  <button
                    type="button"
                    onClick={onTriggerManualLoop}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold cursor-pointer transition-all shadow-md shadow-purple-600/20"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-run from Phase 4 (Manual Loop)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onGoNext}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-all shadow-md shadow-emerald-600/20"
                >
                  <span>Go Next (Phase 9 Regression Check)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
