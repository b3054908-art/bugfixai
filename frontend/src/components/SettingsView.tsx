import React, { useEffect, useState } from 'react';
import {
  Settings,
  Cpu,
  Shield,
  Check,
  Loader2,
  AlertCircle,
  HardDrive,
  Bug as BugIcon,
  Sparkles,
  BarChart3,
  Clock,
  Trash2,
  AlertTriangle,
  X,
  CheckCircle2,
} from 'lucide-react';
import { apiRequest, ApiError } from '../api/client';
import { clearBugs } from '../api/bugs';
import { clearFixHistory } from '../api/fixes';
import { fetchAnalytics, clearAnalyticsTestRuns } from '../api/analytics';
import { countAnalysisRuns, clearRecentAnalysisRuns } from '../api/analysis';
import { getRecentFiles, clearRecentFiles } from '../utils/recentFiles';

// UI model choice <-> backend (provider, model) pair.
const MODEL_OPTIONS = [
  { id: 'gpt-4o', provider: 'openai', model: 'gpt-4o', name: 'GPT-4o', providerLabel: 'OpenAI (Omni)', desc: 'Best for multi-file AST context & high complexity' },
  { id: 'claude-3-5', provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', providerLabel: 'Anthropic', desc: 'Superior code syntax precision & refactoring' },
  { id: 'gemini-1-5', provider: 'google', model: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', providerLabel: 'Google DeepMind', desc: '1M+ token context window for large monorepos' },
  { id: 'groq-gpt-oss-20b', provider: 'groq', model: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', providerLabel: 'Groq', desc: 'Fast hosted open-weight model for coding assistance' },
] as const;

interface UserSetting {
  primaryProvider: string;
  primaryModel: string;
  autoRunTests: boolean;
  minimumConfidence: number;
  sandboxGuardrails: boolean;
}

function modelIdFor(provider: string, model: string): string {
  const match = MODEL_OPTIONS.find((m) => m.provider === provider && m.model === model);
  return match?.id ?? MODEL_OPTIONS[0].id;
}

interface SettingsViewProps {
  projectId: string | null;
  onHistoryChanged?: () => void;
  /** Fired after the analytics/test-run data is purged, so the Analytics
   * view can switch to its cleared-telemetry state. */
  onAnalyticsCleared?: () => void;
}

type ClearActionType = 'recent' | 'bugs' | 'fixes' | 'tests' | 'all';

interface ConfirmModalState {
  title: string;
  description: string;
  actionType: ClearActionType;
  actionLabel: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ projectId, onHistoryChanged, onAnalyticsCleared }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o');
  const [autoRunTests, setAutoRunTests] = useState(true);
  const [minConfidence, setMinConfidence] = useState(85);
  const [sandboxGuardrails, setSandboxGuardrails] = useState(true);

  // --- Data Management & Storage Cleanup ---
  const [recentFilesCount, setRecentFilesCount] = useState(0);
  const [analysisRunCount, setAnalysisRunCount] = useState<number | null>(null);
  const [bugCount, setBugCount] = useState<number | null>(null);
  const [fixCount, setFixCount] = useState<number | null>(null);
  const [testRunCount, setTestRunCount] = useState<number | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [clearingAction, setClearingAction] = useState<ClearActionType | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadDataCounts = React.useCallback(async () => {
    if (!projectId) return;
    setRecentFilesCount(getRecentFiles(projectId).length);
    setDataLoading(true);
    setDataError(null);
    try {
      const [analytics, runCount] = await Promise.all([
        fetchAnalytics(projectId),
        countAnalysisRuns(projectId),
      ]);
      setBugCount(analytics.bugsDetected);
      setFixCount(analytics.fixesGenerated);
      setTestRunCount(analytics.testRunCount);
      setAnalysisRunCount(runCount);
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to load data usage');
    } finally {
      setDataLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest<UserSetting>('/settings/me');
        if (cancelled) return;
        setSelectedModel(modelIdFor(data.primaryProvider, data.primaryModel));
        setAutoRunTests(data.autoRunTests);
        setMinConfidence(data.minimumConfidence);
        setSandboxGuardrails(data.sandboxGuardrails);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void loadDataCounts();
  }, [loadDataCounts]);

  const handleExecuteConfirmedAction = async () => {
    if (!confirmModal || !projectId) return;
    const actionType = confirmModal.actionType;
    setClearingAction(actionType);
    setConfirmModal(null);
    try {
      if (actionType === 'recent') {
        const cleared = clearRecentFiles(projectId);
        const clearedRuns = await clearRecentAnalysisRuns();
        setRecentFilesCount(0);
        setAnalysisRunCount(0);
        onHistoryChanged?.();
        showToast(`Cleared ${cleared} recent file${cleared === 1 ? '' : 's'} from this browser and ${clearedRuns} analysis run${clearedRuns === 1 ? '' : 's'} (incl. their test results)`);
      } else if (actionType === 'bugs') {
        const deleted = await clearBugs(projectId);
        setBugCount(0);
        onHistoryChanged?.();
        showToast(`Cleared ${deleted} bug${deleted === 1 ? '' : 's'} (and their fix history)`);
      } else if (actionType === 'fixes') {
        const deleted = await clearFixHistory(projectId);
        setFixCount(0);
        onHistoryChanged?.();
        showToast(`Cleared ${deleted} AI fix record${deleted === 1 ? '' : 's'}`);
      } else if (actionType === 'tests') {
        const deleted = await clearAnalyticsTestRuns(projectId);
        setTestRunCount(0);
        onAnalyticsCleared?.();
        showToast(`Cleared ${deleted} test run record${deleted === 1 ? '' : 's'}`);
      } else if (actionType === 'all') {
        const clearedRecent = clearRecentFiles(projectId);
        const [deletedBugs, deletedTests, deletedRuns] = await Promise.all([
          clearBugs(projectId),
          clearAnalyticsTestRuns(projectId),
          clearRecentAnalysisRuns(),
        ]);
        setRecentFilesCount(0);
        setAnalysisRunCount(0);
        setBugCount(0);
        setFixCount(0);
        setTestRunCount(0);
        onHistoryChanged?.();
        onAnalyticsCleared?.();
        showToast(`Purged ${deletedBugs} bug${deletedBugs === 1 ? '' : 's'}, ${deletedTests} test run record${deletedTests === 1 ? '' : 's'}, ${deletedRuns} analysis run${deletedRuns === 1 ? '' : 's'}, and ${clearedRecent} recent file${clearedRecent === 1 ? '' : 's'}`);
      }
      await loadDataCounts();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to clear data');
    } finally {
      setClearingAction(null);
    }
  };

  const handleSave = async () => {
    const chosen = MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS[0];
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/settings/me', {
        method: 'PUT',
        body: {
          primaryProvider: chosen.provider,
          primaryModel: chosen.model,
          autoRunTests,
          minimumConfidence: minConfidence,
          sandboxGuardrails,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="settings-view" className="flex-1 overflow-y-auto bg-[#0B0E14] p-6 lg:p-8 space-y-6 text-[#E2E8F0]">

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-16 right-8 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#161B22] border border-emerald-500/60 shadow-2xl text-xs font-mono text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white shadow-md">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              Settings & AI Engine Configuration
            </h1>
            <p className="text-xs text-gray-400">
              Configure underlying LLM reasoning models, Docker sandbox execution limits, and notifications.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading || saving}
          className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium shadow-sm transition-colors cursor-pointer"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          <span>{saving ? 'Saving...' : saved ? 'Settings Saved' : 'Save Changes'}</span>
        </button>
      </div>

      {error && (
        <div className="max-w-3xl flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SECTION: DATA MANAGEMENT & STORAGE CLEANUP */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Data Management &amp; Storage Cleanup
            </h2>
          </div>
          <span className="text-[11px] text-gray-500 font-mono">
            Granular controls to wipe bugs, AI fix history, and test data
          </span>
        </div>

        {!projectId ? (
          <div className="text-xs text-gray-500">No project selected yet.</div>
        ) : dataError ? (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{dataError}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Card 1: Recent History & Cache */}
            <div className="rounded-xl bg-[#161B22] border border-[#30363D] p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-sm text-white">Recent History &amp; Cache</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                      recentFilesCount > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-400'
                    }`}>
                      {recentFilesCount} Recent File{recentFilesCount === 1 ? '' : 's'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                      (analysisRunCount ?? 0) > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-400'
                    }`}>
                      {dataLoading ? '…' : `${analysisRunCount ?? 0} Run${(analysisRunCount ?? 0) === 1 ? '' : 's'}`}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Clears the Workspace IDE&apos;s recently-opened files list (stored only in this browser) <strong className="text-gray-300">and</strong> this project&apos;s analysis run history shown on the Dashboard&apos;s Recent Runs panel — including the test results recorded under those runs. Bugs and AI fixes themselves are kept; use the cards below to clear those.
                </p>
              </div>

              <div className="pt-3 border-t border-[#21262D] flex items-center justify-end">
                <button
                  disabled={clearingAction !== null}
                  onClick={() => setConfirmModal({
                    title: 'Clear Recent History & Run Log?',
                    description: `This will remove all ${recentFilesCount} recently-opened file${recentFilesCount === 1 ? '' : 's'} tracked in this browser, and permanently delete all ${analysisRunCount ?? 0} analysis run${(analysisRunCount ?? 0) === 1 ? '' : 's'} (and their recorded test results) for this project from the Dashboard's Recent Runs history. Bugs and AI fixes are kept.`,
                    actionType: 'recent',
                    actionLabel: 'Clear Recent History',
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-mono font-semibold transition-colors cursor-pointer"
                >
                  {clearingAction === 'recent' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  <span>Clear Recent History</span>
                </button>
              </div>
            </div>

            {/* Card 2: Bug List Data */}
            <div className="rounded-xl bg-[#161B22] border border-[#30363D] p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <BugIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-sm text-white">Bug List Data</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                    (bugCount ?? 0) > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {dataLoading ? '…' : `${bugCount ?? 0} Bug${(bugCount ?? 0) === 1 ? '' : 's'}`}
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Permanently deletes every logged bug, severity assignment, and triage status for this project. This also deletes that project&apos;s AI fix history, since every fix belongs to a bug.
                </p>
              </div>

              <div className="pt-3 border-t border-[#21262D] flex items-center justify-end">
                <button
                  disabled={clearingAction !== null}
                  onClick={() => setConfirmModal({
                    title: 'Clear All Bug List Data?',
                    description: `This will permanently delete all ${bugCount ?? 0} bugs in this project, along with their AI fix history. This cannot be undone.`,
                    actionType: 'bugs',
                    actionLabel: 'Clear Bug List Data',
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-mono font-semibold transition-colors cursor-pointer"
                >
                  {clearingAction === 'bugs' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  <span>Clear Bug List Data</span>
                </button>
              </div>
            </div>

            {/* Card 3: AI Fix History */}
            <div className="rounded-xl bg-[#161B22] border border-[#30363D] p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-sm text-white">AI Fix History</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                    (fixCount ?? 0) > 0 ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {dataLoading ? '…' : `${fixCount ?? 0} Patch${(fixCount ?? 0) === 1 ? '' : 'es'}`}
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Erases all AI-generated unified diffs, confidence scores, and validation records for this project. Bugs themselves are kept.
                </p>
              </div>

              <div className="pt-3 border-t border-[#21262D] flex items-center justify-end">
                <button
                  disabled={clearingAction !== null}
                  onClick={() => setConfirmModal({
                    title: 'Clear AI Fix History Data?',
                    description: `This will permanently delete all ${fixCount ?? 0} AI-generated fix records in this project. This cannot be undone.`,
                    actionType: 'fixes',
                    actionLabel: 'Clear AI Fix History',
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-mono font-semibold transition-colors cursor-pointer"
                >
                  {clearingAction === 'fixes' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  <span>Clear AI Fix History</span>
                </button>
              </div>
            </div>

            {/* Card 4: Analytical Report */}
            <div className="rounded-xl bg-[#161B22] border border-[#30363D] p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <BarChart3 className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-sm text-white">Analytical Report</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                    (testRunCount ?? 0) > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {dataLoading ? '…' : `${testRunCount ?? 0} Test Run${(testRunCount ?? 0) === 1 ? '' : 's'}`}
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Clears recorded sandbox test-run results that feed this project&apos;s test pass rate on the Analytics dashboard. Bug- and fix-derived metrics (MTTR, bugs detected, fixes generated) are cleared via the cards above instead, since they come straight from the Bug/Fix data.
                </p>
              </div>

              <div className="pt-3 border-t border-[#21262D] flex items-center justify-end">
                <button
                  disabled={clearingAction !== null}
                  onClick={() => setConfirmModal({
                    title: 'Clear Analytical Report Data?',
                    description: `This will permanently delete all ${testRunCount ?? 0} recorded test runs for this project. This cannot be undone.`,
                    actionType: 'tests',
                    actionLabel: 'Clear Analytics Report',
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-mono font-semibold transition-colors cursor-pointer"
                >
                  {clearingAction === 'tests' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  <span>Clear Analytics Report</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Master Data Purge Bar */}
        {projectId && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/30 via-[#161B22] to-[#161B22] border border-red-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Master Data Cleanup</div>
                <div className="text-[11px] text-gray-400">
                  Wipe all recent history, analysis run history, bugs, AI fix history, and test run data for this project in one action.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                disabled={clearingAction !== null}
                onClick={() => setConfirmModal({
                  title: 'Purge All Project Data?',
                  description: `Warning: this will delete all ${bugCount ?? 0} bugs (and their fix history), ${testRunCount ?? 0} test runs, ${analysisRunCount ?? 0} analysis run${(analysisRunCount ?? 0) === 1 ? '' : 's'}, and ${recentFilesCount} recent file${recentFilesCount === 1 ? '' : 's'} for this project in one action. This cannot be undone.`,
                  actionType: 'all',
                  actionLabel: 'Purge Everything',
                })}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono font-semibold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {clearingAction === 'all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Purge All Data</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="max-w-3xl flex items-center gap-2 text-gray-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading settings...</span>
        </div>
      ) : (
      <div className="max-w-3xl space-y-6">
        
        {/* Model Selection */}
        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-200 uppercase tracking-wider">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span>Primary AI Analysis & Synthesis Model</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MODEL_OPTIONS.map(m => (
              <div
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                  selectedModel === m.id
                    ? 'bg-indigo-500/10 border-indigo-500 shadow-sm'
                    : 'bg-[#161B22] border-[#30363D] hover:border-gray-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-200 text-xs">{m.name}</span>
                  {selectedModel === m.id && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
                </div>
                <div className="text-[11px] text-indigo-300 mt-0.5">{m.providerLabel}</div>
                <p className="text-[11px] text-gray-400 mt-2">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* AI Confidence & Sandbox Guardrails */}
        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-200 uppercase tracking-wider">
            <Shield className="w-4 h-4 text-green-400" />
            <span>Sandbox Verification & Guardrails</span>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-200">Auto-execute test suite in Docker container</div>
                <div className="text-gray-400 text-[11px]">Validates that no existing tests break before suggesting a patch</div>
              </div>
              <input
                type="checkbox"
                checked={autoRunTests}
                onChange={(e) => setAutoRunTests(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-[#0B0E14] border-[#30363D]"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#30363D]">
              <div>
                <div className="font-semibold text-gray-200">Enforce sandbox guardrails</div>
                <div className="text-gray-400 text-[11px]">Runs untrusted code with network disabled and resource limits</div>
              </div>
              <input
                type="checkbox"
                checked={sandboxGuardrails}
                onChange={(e) => setSandboxGuardrails(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-[#0B0E14] border-[#30363D]"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-[#30363D]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-200">Minimum AI Confidence Score Required</span>
                <span className="font-mono font-bold text-indigo-300">{minConfidence}%</span>
              </div>
              <input
                type="range"
                min={70}
                max={99}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        </div>

      </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363D] bg-[#0D1117]">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="font-bold text-sm text-white">{confirmModal.title}</h3>
              </div>
              <button
                onClick={() => setConfirmModal(null)}
                className="p-1 rounded hover:bg-[#21262D] text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-gray-300">
              <p className="leading-relaxed">{confirmModal.description}</p>
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-red-300 text-[11px] font-mono">
                ⚠️ This permanently deletes the data from the database. There is no restore.
              </div>
            </div>

            <div className="px-5 py-3 bg-[#0D1117] border-t border-[#30363D] flex items-center justify-end gap-2.5 font-mono text-xs">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 rounded-lg hover:bg-[#21262D] text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleExecuteConfirmedAction()}
                className="px-4 py-1.5 rounded-lg font-semibold transition-all cursor-pointer shadow-sm bg-red-600 hover:bg-red-500 text-white"
              >
                {confirmModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};