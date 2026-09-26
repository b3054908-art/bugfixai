import {
  Activity,
  Box,
  BrainCircuit,
  Bug,
  Check,
  CheckCircle,
  CheckCircle2,
  Copy,
  FileCheck,
  FileText,
  FolderGit2,
  Globe,
  HardDrive,
  Layers,
  Lock,
  PlayCircle,
  RefreshCcw,
  RotateCw,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Wrench,
  X,
  XCircle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ContextDoc, LogLine, PipelinePhase } from '../types';
import { fetchAnalysisLogs } from '../api/analysis';
import { ApiError } from '../api/client';

interface PhaseInspectorModalProps {
  phase: PipelinePhase | null;
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  contextDocs: ContextDoc[];
  analysisId?: string | null;
  onRerunSecurityChecks?: () => void;
  /** Opens the live app preview (Phase 5: Run & Test) in a new browser tab. */
  onOpenPreview?: () => void;
  previewLoading?: boolean;
  previewError?: string | null;
}

export const PhaseInspectorModal: React.FC<PhaseInspectorModalProps> = ({
  phase,
  isOpen,
  onClose,
  projectName,
  contextDocs,
  analysisId,
  onRerunSecurityChecks,
  onOpenPreview,
  previewLoading,
  previewError
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'subprocesses' | 'raw-logs' | 'validation-report'>('details');
  const [copied, setCopied] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);

  // Real Terminal / Raw Logs state — fetched from the backend instead of the
  // old hardcoded fake log strings.
  const [rawLogs, setRawLogs] = useState<LogLine[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const phaseIsRunning = phase?.status === 'running';

  useEffect(() => {
    if (!isOpen || !phase || activeTab !== 'raw-logs' || !analysisId) return;

    let cancelled = false;

    const load = (showSpinner: boolean) => {
      if (showSpinner) setLogsLoading(true);
      fetchAnalysisLogs(analysisId, phase.id)
        .then((result) => {
          if (!cancelled) {
            setRawLogs(result);
            setLogsError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setLogsError(err instanceof ApiError ? err.message : 'Could not load logs.');
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLogsLoading(false);
        });
    };

    load(true);

    // While this phase is still running, poll so the tab keeps ticking with
    // real log lines instead of requiring the user to reopen the modal.
    const intervalId = phaseIsRunning ? window.setInterval(() => load(false), 2000) : null;

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [isOpen, phase?.id, activeTab, analysisId, phaseIsRunning]);

  if (!isOpen || !phase) return null;

  const displayedLogsCount = rawLogs.length;
  const formattedLogText = rawLogs
    .map((log) => `[${new Date(log.timestamp).toISOString().replace('T', ' ').replace('Z', '')}] [${log.level}] [${log.category}] ${log.message}`)
    .join('\n');

  const handleCopyLogs = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRecheckSecurity = () => {
    setIsRevalidating(true);
    setTimeout(() => {
      setIsRevalidating(false);
      if (onRerunSecurityChecks) onRerunSecurityChecks();
    }, 800);
  };

  // Dedicated phase icons
  const getPhaseIcon = (id: number) => {
    switch (id) {
      case 1: return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
      case 2: return <FolderGit2 className="w-4 h-4 text-blue-400" />;
      case 3: return <Box className="w-4 h-4 text-purple-400" />;
      case 4: return <Wrench className="w-4 h-4 text-amber-400" />;
      case 5: return <PlayCircle className="w-4 h-4 text-cyan-400" />;
      case 6: return <Bug className="w-4 h-4 text-rose-400" />;
      case 7: return <BrainCircuit className="w-4 h-4 text-indigo-400" />;
      case 8: return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case 9: return <FileCheck className="w-4 h-4 text-teal-400" />;
      case 10: return <Sparkles className="w-4 h-4 text-amber-400" />;
      default: return <Activity className="w-4 h-4 text-indigo-400" />;
    }
  };

  // Phase 1 Security Deep Dive Checks — real results from this run's backend scan,
  // or empty until the pipeline has actually run Phase 1.
  const projectInputSecurityChecks = phase.validationReport?.securityChecks ?? [];

  const checkIcon = (id: string) => {
    switch (id) {
      case 'check-size': return <HardDrive className="w-4 h-4 text-emerald-400" />;
      case 'check-malicious': return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
      case 'check-traversal': return <Lock className="w-4 h-4 text-emerald-400" />;
      case 'check-integrity': return <Shield className="w-4 h-4 text-emerald-400" />;
      case 'check-context': return <FileText className="w-4 h-4 text-indigo-400" />;
      default: return <Shield className="w-4 h-4 text-gray-400" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'passed':
        return <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /><span>PASSED</span></span>;
      case 'failed':
        return <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1"><XCircle className="w-3 h-3" /><span>FAILED</span></span>;
      case 'warning':
        return <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1"><span>WARNING</span></span>;
      default:
        return <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-gray-700/40 text-gray-300 border border-gray-600/40 flex items-center gap-1"><span>INFO</span></span>;
    }
  };

  return (
    <div 
      id="phase-inspector-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div 
        id="phase-inspector-modal-content"
        className="bg-[#0D1117] border border-[#30363D] rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-all text-[#E2E8F0]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363D] bg-[#161B22]">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border font-mono font-bold text-xs ${
              phase.status === 'completed'
                ? 'bg-green-950/60 border-green-500/40 text-green-400'
                : phase.status === 'running'
                ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-400 animate-pulse'
                : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}>
              {getPhaseIcon(phase.id)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono bg-[#0D1117] border border-[#30363D] px-1.5 py-0.5 rounded text-gray-400">
                  PHASE {String(phase.id).padStart(2, '0')} OF 10
                </span>
                <h3 className="text-sm font-bold text-white tracking-tight font-mono">
                  {phase.name}
                </h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                  phase.status === 'completed'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : phase.status === 'running'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse'
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}>
                  {phase.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {phase.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {phase.id === 1 && (
              <button
                type="button"
                onClick={handleRecheckSecurity}
                disabled={isRevalidating}
                className="px-3 py-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] text-xs font-mono text-indigo-300 hover:text-white border border-[#30363D] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Re-run zero-trust security & path traversal check"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRevalidating ? 'animate-spin text-indigo-400' : ''}`} />
                <span>{isRevalidating ? 'Re-scanning...' : 'Re-verify Security'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Sub-Navigation Bar */}
        <div className="flex items-center gap-2 px-6 py-2 border-b border-[#30363D] bg-[#161B22]/60 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'details'
                ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            {phase.id === 1 ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Security & Sanitization</span>
              </>
            ) : phase.id === 10 ? (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Validation & Iteration</span>
              </>
            ) : (
              <>
                <Sliders className="w-3.5 h-3.5" />
                <span>Phase Architecture</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subprocesses')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'subprocesses'
                ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sub-Processes ({phase.subprocesses?.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('raw-logs')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'raw-logs'
                ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal / Raw Logs</span>
          </button>

          {phase.id === 10 && (
            <button
              type="button"
              onClick={() => setActiveTab('validation-report')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'validation-report'
                  ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                  : 'text-emerald-400 hover:text-emerald-300 hover:bg-[#21262D]'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Final Audit Report</span>
            </button>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-4 max-h-[64vh]">
          
          {/* TAB 1: PHASE DETAILS / ARCHITECTURE */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              
              {/* PHASE 1: Project Input Specialized View */}
              {phase.id === 1 && (
                <>
                  {projectInputSecurityChecks.length > 0 ? (
                    <>
                      {(() => {
                        const hasFailed = projectInputSecurityChecks.some(c => c.status === 'failed');
                        const hasWarning = projectInputSecurityChecks.some(c => c.status === 'warning');
                        const passedCount = projectInputSecurityChecks.filter(c => c.status === 'passed').length;
                        const banner = hasFailed
                          ? { wrap: 'p-3.5 rounded-lg bg-rose-950/20 border border-rose-500/30 flex items-start gap-3', icon: 'w-5 h-5 text-rose-400 shrink-0 mt-0.5', title: 'text-xs font-bold text-rose-300', body: 'text-[11px] text-rose-400/80 mt-0.5' }
                          : hasWarning
                          ? { wrap: 'p-3.5 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-start gap-3', icon: 'w-5 h-5 text-amber-400 shrink-0 mt-0.5', title: 'text-xs font-bold text-amber-300', body: 'text-[11px] text-amber-400/80 mt-0.5' }
                          : { wrap: 'p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-3', icon: 'w-5 h-5 text-emerald-400 shrink-0 mt-0.5', title: 'text-xs font-bold text-emerald-300', body: 'text-[11px] text-emerald-400/80 mt-0.5' };
                        return (
                          <div className={banner.wrap}>
                            <ShieldCheck className={banner.icon} />
                            <div>
                              <div className={banner.title}>
                                Zero-Trust Security & Input Validation Pipeline: {passedCount}/{projectInputSecurityChecks.length} Passed
                              </div>
                              <p className={banner.body}>
                                Archive input for <span className="font-mono font-semibold">{projectName}</span> was checked against size limits, extension-based binary scanning, and path traversal defenses before entering the isolated container environment.
                              </p>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="space-y-2.5">
                        {projectInputSecurityChecks.map((check) => (
                          <div
                            key={check.id}
                            className="rounded-lg bg-[#161B22] border border-[#30363D] p-3.5 space-y-2 hover:border-indigo-500/40 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="p-1 rounded bg-[#0D1117] border border-[#30363D]">
                                  {checkIcon(check.id)}
                                </div>
                                <span className="text-xs font-bold text-gray-200 font-mono">
                                  {check.title}
                                </span>
                              </div>
                              {statusBadge(check.status)}
                            </div>

                            <p className="text-[11px] text-gray-400 leading-relaxed">
                              {check.description}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[#30363D]/60 text-[11px] font-mono">
                              {Object.entries(check.metrics).map(([key, val]) => (
                                <div key={key} className="flex items-center justify-between p-1.5 rounded bg-[#0D1117] border border-[#30363D]/40">
                                  <span className="text-gray-500">{key}:</span>
                                  <span className="text-gray-300 font-semibold truncate ml-2">{val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="p-4 rounded-lg bg-[#161B22] border border-[#30363D] text-xs text-gray-400 text-center">
                      No security scan results yet for this phase — they appear here once the pipeline actually runs Phase 1 for this analysis.
                    </div>
                  )}
                </>
              )}

              {/* PHASE 10: Validation & Iteration — patch loop, re-run, cycle count */}
              {phase.id === 10 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-[#161B22] border border-[#30363D] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                          Retry Loop Outcome
                        </span>
                      </div>
                      {phase.validationReport?.cycleCount !== undefined && (
                        <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                          {phase.validationReport.cycleCount > 1 ? 'Retry loop ran' : 'No retries needed'}
                        </span>
                      )}
                    </div>

                    {phase.validationReport?.summary ? (
                      <div className="p-3 rounded bg-[#0D1117] border border-[#30363D] flex items-start gap-2.5">
                        {phase.validationReport.regressionFound ? (
                          <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="text-xs font-bold text-gray-200">
                            {phase.validationReport.regressionFound ? 'Needs Human Review' : 'All Bugs Validated'}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">{phase.validationReport.summary}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-[#0D1117] border border-[#30363D] text-xs text-gray-400 text-center">
                        No validation outcome yet — this fills in once Phase 10 actually runs for this analysis.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PHASE 8: Install → Build → Run & Test — Live Application Preview */}
              {phase.id === 8 && (
                <div className="p-3.5 rounded-lg bg-[#161B22] border border-[#30363D] space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" />
                    <div className="text-xs font-bold text-gray-200">Live Application Preview</div>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Runs the project as a real, reachable web server in a sandboxed container and
                    opens it in a new browser tab. Requires this phase to have completed at least
                    once so a runnable start command has been detected.
                  </p>

                  {previewError && (
                    <div className="p-2.5 rounded bg-red-950/40 border border-red-500/30 text-[11px] text-red-300">
                      {previewError}
                    </div>
                  )}

                  <button
                    onClick={onOpenPreview}
                    disabled={!onOpenPreview || previewLoading}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                  >
                    {previewLoading ? (
                      <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    <span>{previewLoading ? 'Starting preview…' : 'Open Live Preview'}</span>
                  </button>
                </div>
              )}

              {/* PHASES 2 to 7 Generic Overview Cards */}
              {phase.id !== 1 && phase.id !== 8 && phase.id !== 10 && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-[#161B22] border border-[#30363D] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-gray-200">Phase Status: {phase.status.toUpperCase()}</div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{phase.description}</p>
                    </div>
                    {phase.duration && (
                      <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20">
                        {phase.duration}
                      </span>
                    )}
                  </div>

                  {/* Architecture Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] space-y-1">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-sans font-semibold">
                        Execution Target
                      </span>
                      <div className="text-gray-200 font-bold">{projectName}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] space-y-1">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-sans font-semibold">
                        Runtime Boundary
                      </span>
                      <div className="text-indigo-300 font-bold">
                        {phase.id === 7 ? 'Docker Container (cgroups active)' : 'In-process (backend service, no sandbox)'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: EXPLICIT SUB-PROCESSES BREAKDOWN */}
          {activeTab === 'subprocesses' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="font-semibold uppercase tracking-wider text-[11px]">
                  Sub-Processes Under {phase.name}
                </span>
                <span className="font-mono text-indigo-300 font-bold">
                  {phase.subprocesses?.length ?? 0} Total Processes
                </span>
              </div>

              {phase.subprocesses && phase.subprocesses.length > 0 ? (
                <div className="space-y-2">
                  {phase.subprocesses.map((sub, idx) => {
                    const failed = sub.status === 'failed';
                    const running = sub.status === 'running';
                    return (
                      <div
                        key={sub.id ?? idx}
                        className="p-3 rounded-lg bg-[#161B22] border border-[#30363D] flex items-center justify-between text-xs hover:border-indigo-500/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-bold ${
                            sub.completed
                              ? 'bg-green-950/60 border border-green-500/40 text-green-400'
                              : failed
                              ? 'bg-rose-950/60 border border-rose-500/40 text-rose-400'
                              : 'bg-[#21262D] border border-[#30363D] text-gray-400'
                          }`}>
                            {sub.completed ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : failed ? <X className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
                          </div>
                          <div>
                            <div className={`font-mono font-medium ${sub.completed ? 'text-gray-200' : 'text-gray-400'}`}>
                              {sub.name}
                            </div>
                            {sub.metrics && Object.entries(sub.metrics).length > 0 && (
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {Object.entries(sub.metrics).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                              </div>
                            )}
                          </div>
                        </div>

                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded uppercase ${
                          sub.completed
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : failed
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : running
                            ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {sub.completed ? 'COMPLETED' : failed ? 'FAILED' : running ? 'RUNNING' : 'PENDING'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#161B22] border border-[#30363D] text-xs text-gray-400 text-center">
                  No sub-process data yet for this phase — it appears here once the pipeline starts running it.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RAW LOGS */}
          {activeTab === 'raw-logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-gray-400">
                  {projectName} · {phase.name} · {displayedLogsCount} log line{displayedLogsCount === 1 ? '' : 's'}
                  {phase.id === 1 && contextDocs.length > 0 && (
                    <span className="text-gray-600"> · {contextDocs.length} context doc{contextDocs.length === 1 ? '' : 's'} bound</span>
                  )}
                  {phaseIsRunning && <span className="ml-2 text-indigo-400">● live</span>}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyLogs(formattedLogText)}
                  disabled={rawLogs.length === 0}
                  className="px-2.5 py-1 rounded bg-[#21262D] hover:bg-[#30363D] disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-mono text-gray-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Copy className="w-3 h-3 text-indigo-400" />
                  <span>{copied ? 'Copied!' : 'Copy Raw Output'}</span>
                </button>
              </div>

              {logsLoading ? (
                <div className="p-4 rounded-lg bg-[#0B0E14] border border-[#30363D] text-xs text-gray-400 text-center">
                  Loading logs…
                </div>
              ) : logsError ? (
                <div className="p-4 rounded-lg bg-rose-950/20 border border-rose-500/30 text-xs text-rose-400 text-center">
                  {logsError}
                </div>
              ) : rawLogs.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#161B22] border border-[#30363D] text-xs text-gray-400 text-center">
                  No log output yet for this phase — it appears here once the pipeline starts running it.
                </div>
              ) : (
                <pre className="p-4 rounded-lg bg-[#0B0E14] border border-[#30363D] font-mono text-[11px] whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-72">
                  {rawLogs.map((log) => {
                    const levelColor =
                      log.level === 'ERROR' ? 'text-rose-400' :
                      log.level === 'WARN' ? 'text-amber-400' :
                      log.level === 'PASS' ? 'text-emerald-400' :
                      'text-indigo-300';
                    return (
                      <div key={log.id} className="text-gray-300">
                        <span className="text-gray-500">[{new Date(log.timestamp).toISOString().replace('T', ' ').replace('Z', '')}]</span>{' '}
                        <span className={levelColor}>[{log.level}]</span>{' '}
                        <span className="text-gray-400">[{log.category}]</span>{' '}
                        {log.message}
                      </div>
                    );
                  })}
                </pre>
              )}
            </div>
          )}

          {/* TAB 4: FINAL AUDIT REPORT (FOR PHASE 10: Validation & Iteration) */}
          {activeTab === 'validation-report' && phase.id === 10 && (
            <div className="space-y-4">
              {phase.validationReport?.summary ? (
                <div className={`p-4 rounded-lg space-y-3 ${
                  phase.validationReport.regressionFound
                    ? 'bg-rose-950/20 border border-rose-500/30'
                    : 'bg-emerald-950/20 border border-emerald-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {phase.validationReport.regressionFound ? (
                        <XCircle className="w-5 h-5 text-rose-400" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      )}
                      <span className={`text-xs font-bold uppercase tracking-wider ${phase.validationReport.regressionFound ? 'text-rose-300' : 'text-emerald-300'}`}>
                        Final Audit Report
                      </span>
                    </div>
                    {phase.validationReport.testPassRate && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                        phase.validationReport.regressionFound
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}>
                        {phase.validationReport.testPassRate} PASS RATE
                      </span>
                    )}
                  </div>

                  <p className={`text-xs leading-relaxed ${phase.validationReport.regressionFound ? 'text-rose-400/90' : 'text-emerald-400/90'}`}>
                    {phase.validationReport.summary}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs font-mono">
                    <div className="p-2.5 rounded bg-[#0D1117] border border-[#30363D]">
                      <div className="text-[10px] text-gray-500">Bug Pass Rate</div>
                      <div className={`font-bold text-sm ${phase.validationReport.regressionFound ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {phase.validationReport.testPassRate ?? '—'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-[#0D1117] border border-[#30363D]">
                      <div className="text-[10px] text-gray-500">Needs Human Review</div>
                      <div className={`font-bold text-sm ${phase.validationReport.regressionFound ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {phase.validationReport.regressionFound ? `Yes — ${phase.validationReport.failedTests ?? 0} bug(s)` : 'No'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-[#0D1117] border border-[#30363D]">
                      <div className="text-[10px] text-gray-500">Retry Cycles Run</div>
                      <div className="text-gray-200 font-bold text-sm">{phase.validationReport.cycleCount ?? 1}</div>
                    </div>
                  </div>

                  <div className="p-3 rounded bg-[#0D1117] border border-[#30363D] text-xs">
                    <div className="text-gray-400 font-semibold mb-1">Production Readiness Assessment:</div>
                    <div className="text-gray-200">{phase.validationReport.recommendation}</div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#161B22] border border-[#30363D] text-xs text-gray-400 text-center">
                  No audit report yet — this fills in once Phase 10 actually runs for this analysis.
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#30363D] bg-[#161B22]">
          <div className="text-[11px] text-gray-400 font-mono flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-green-400" />
            <span>Inspection view · Real-time pipeline state active</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
};
