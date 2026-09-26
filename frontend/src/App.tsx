import { ChevronDown } from 'lucide-react';
import React, { useState } from 'react';
import { apiRequest } from './api/client';
import { createBugApi, fetchBugs, updateBugStatusApi } from './api/bugs';
import { createProject } from './api/Project';
import { fetchSettings } from './api/settings';
import { downloadAnalysisFixes, fetchFixHistory } from './api/fixes';
import { fetchProviderUsage } from './api/credentials';
import { AIFixHistoryView } from './components/AIFixHistoryView';
import { AnalyticsView } from './components/AnalyticsView';
import { BugListView } from './components/BugListView';
import { DashboardView } from './components/DashboardView';
import { DocsView } from './components/DocsView';
import { InspectFixModal } from './components/InspectFixModal';
import { LogBugModal } from './components/LogBugModal';
import { defaultModels, ModelSelectorModal } from './components/ModelSelectorModal';
import { NotificationBell, NotificationCenter } from './components/NotificationCenter';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { WorkspaceView } from './components/WorkspaceView';
import { AIFixHistoryItem, AppNotification, Bug, NavigationTab } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('workspace');
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [fixHistoryCount, setFixHistoryCount] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [isLogBugOpen, setIsLogBugOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [inspectingBug, setInspectingBug] = useState<Bug | null>(null);
  const [inspectingHistoryItem, setInspectingHistoryItem] = useState<AIFixHistoryItem | null>(null);
  const [workspaceTargetBug, setWorkspaceTargetBug] = useState<Bug | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentModel, setCurrentModel] = useState('GPT-4-Turbo');
  const [activeModelBackend, setActiveModelBackend] = useState<{ provider: string; model: string } | null>(null);
  const [fixHistoryRefreshToken, setFixHistoryRefreshToken] = useState(0);
  const [dashboardRefreshToken, setDashboardRefreshToken] = useState(0);
  const [recentFixes, setRecentFixes] = useState<AIFixHistoryItem[]>([]);
  const [isAnalyticsCleared, setIsAnalyticsCleared] = useState(false);
  const [showProjectOnboarding, setShowProjectOnboarding] = useState(false);
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingSourceType, setOnboardingSourceType] = useState<'ZIP' | 'GITHUB' | 'PASTE'>('ZIP');
  const [onboardingRepositoryUrl, setOnboardingRepositoryUrl] = useState('');
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const quotaAlertsRef = React.useRef(new Set<string>());

  // --- Notifications (starts empty — populated from real events as they happen) ---
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const handleMarkNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleDismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
  };

  const handleAnalysisCompleted = (analysisRunId: string, analyzedProjectName: string) => {
    setActiveTab('bugs');
    setNotifications((prev) => [{
      id: `analysis-fixes-${analysisRunId}`,
      title: 'AI fixes are ready',
      message: `All 10 analysis phases finished for ${analyzedProjectName || 'the project'}. Download the generated AI fix file?`,
      timestamp: 'just now',
      read: false,
      type: 'fix',
      actionTab: 'ai-fix-history',
      downloadAnalysisRunId: analysisRunId,
      downloadProjectName: analyzedProjectName,
    }, ...prev]);
  };

  const handleDownloadFixes = async (notification: AppNotification) => {
    if (!notification.downloadAnalysisRunId) return;
    try {
      const count = await downloadAnalysisFixes(
        notification.downloadAnalysisRunId,
        notification.downloadProjectName || 'project',
      );
      if (count === 0) {
        console.info('No AI fix proposals were generated for this analysis.');
      }
      setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
    } catch (error) {
      console.error('Failed to download AI fixes:', error);
    }
  };

  const handleSelectBugById = (bugId: string) => {
    const target = bugs.find(b => b.id === bugId || b.code === bugId);
    if (target) setInspectingBug(target);
    setActiveTab('bugs');
  };

  const handleProjectCreated = React.useCallback(async (createdProjectId: string) => {
    setProjectId(createdProjectId);
    setShowProjectOnboarding(false);
    setOnboardingError(null);
    try {
      const realBugs = await fetchBugs(createdProjectId);
      setBugs(realBugs);
    } catch (err) {
      console.error('Failed to load created project bugs:', err);
    }
  }, []);

  const handleCreateProject = React.useCallback(async () => {
    const trimmedName = onboardingName.trim();
    if (!trimmedName) {
      setOnboardingError('Choose a project name before continuing.');
      return;
    }

    setOnboardingLoading(true);
    setOnboardingError(null);

    try {
      const project = await createProject(trimmedName, onboardingSourceType, onboardingSourceType === 'GITHUB' && onboardingRepositoryUrl.trim()
        ? { repositoryUrl: onboardingRepositoryUrl.trim(), defaultBranch: 'main' }
        : undefined);
      await handleProjectCreated(project.id);
      setActiveTab('dashboard');
    } catch (err) {
      console.error('Failed to create onboarding project:', err);
      setOnboardingError(err instanceof Error ? err.message : 'Could not create the project.');
    } finally {
      setOnboardingLoading(false);
    }
  }, [handleProjectCreated, onboardingName, onboardingRepositoryUrl, onboardingSourceType]);

  React.useEffect(() => {
    (async () => {
      try {
        const [projectList, settings] = await Promise.all([
          apiRequest<{ items?: Array<{ id: string }> }>('/projects'),
          fetchSettings(),
        ]);
        const existingProjectId = projectList.items && projectList.items.length > 0 ? projectList.items[0].id : null;
        if (existingProjectId) {
          setProjectId(existingProjectId);
          const realBugs = await fetchBugs(existingProjectId);
          setBugs(realBugs);
        } else {
          setShowProjectOnboarding(true);
        }
        const savedModel = defaultModels.find(
          (model) => model.backend.provider === settings.primaryProvider && model.backend.model === settings.primaryModel,
        );
        setCurrentModel(savedModel?.id ?? settings.primaryModel);
        setActiveModelBackend({ provider: settings.primaryProvider, model: settings.primaryModel });
        setBackendConnected(true);
      } catch (err) {
        console.error('Failed to load backend data:', err);
        setBackendConnected(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!activeModelBackend) return;
    let cancelled = false;

    const checkQuota = async () => {
      try {
        const usage = await fetchProviderUsage(activeModelBackend.provider);
        if (cancelled) return;
        const modelUsage = usage.models.find((item) => item.model === activeModelBackend.model);
        if (!modelUsage) return;

        const limit = modelUsage.limitTokens ?? modelUsage.limitRequests;
        const remaining = modelUsage.remainingTokens ?? modelUsage.remainingRequests;
        if (!limit || remaining == null) return;

        const percent = (remaining / limit) * 100;
        const thresholds = percent <= 0 || modelUsage.exhausted
          ? [{ key: 'exhausted', threshold: 0, title: 'AI model quota exhausted', type: 'critical' as const }]
          : percent <= 10
          ? [{ key: '10', threshold: 10, title: 'AI model quota is below 10%', type: 'critical' as const }]
          : percent <= 50
          ? [{ key: '50', threshold: 50, title: 'AI model quota is below 50%', type: 'info' as const }]
          : [];

        thresholds.forEach(({ key, threshold, title, type }) => {
          const alertKey = `${activeModelBackend.provider}:${activeModelBackend.model}:${key}`;
          if (quotaAlertsRef.current.has(alertKey)) return;
          quotaAlertsRef.current.add(alertKey);
          setNotifications((prev) => [{
            id: `model-quota-${alertKey}`,
            title,
            message: `${activeModelBackend.model} has approximately ${Math.max(0, Math.round(percent))}% quota remaining${threshold ? ` (threshold ${threshold}%)` : ''}.`,
            timestamp: 'just now',
            read: false,
            type,
          }, ...prev]);
        });
      } catch {
        // Quota headers are provider-specific; a failed check should not interrupt the app.
      }
    };

    void checkQuota();
    const interval = window.setInterval(() => void checkQuota(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeModelBackend]);

  const handleAddBug = async (newBug: Bug) => {
    if (!projectId) return;
    try {
      const created = await createBugApi(projectId, newBug);
      setBugs(prev => [created, ...prev]);
    } catch (err) {
      console.error('Failed to create bug:', err);
    }
  };

  const handleApplyPatch = async (bugId: string) => {
    const target = bugs.find(b => b.code === bugId || b.id === bugId);
    if (!target) return;
    try {
      const updated = await updateBugStatusApi(target.id, 'Fixed');
      setBugs(prev => prev.map(b => (b.id === updated.id ? updated : b)));
    } catch (err) {
      console.error('Failed to apply patch:', err);
    }
  };

  const handleNavigateToWorkspaceWithBug = (bug: Bug) => {
    setWorkspaceTargetBug(bug);
    setActiveTab('workspace');
  };

  const handleAnalysisDataChanged = async (analyzedProjectId: string) => {
    setProjectId(analyzedProjectId);
    try {
      const nextBugs = await fetchBugs(analyzedProjectId);
      const nextHistory = await fetchFixHistory();
      setBugs(nextBugs);
      setRecentFixes(nextHistory.slice(0, 3));
      setFixHistoryCount(nextHistory.length);
      setFixHistoryRefreshToken((token) => token + 1);
      setDashboardRefreshToken((token) => token + 1);
      setActiveTab('bugs');
    } catch (err) {
      console.error('Failed to refresh analyzed project data:', err);
    }
  };

  const handleHistoryChanged = React.useCallback(() => {
    setBugs([]);
    setRecentFixes([]);
    setFixHistoryCount(0);
    setFixHistoryRefreshToken((token) => token + 1);
    setDashboardRefreshToken((token) => token + 1);
  }, []);

  React.useEffect(() => {
    if (!projectId) {
      setRecentFixes([]);
      setFixHistoryCount(0);
      return;
    }

    let cancelled = false;
    fetchFixHistory()
      .then((items) => {
        if (!cancelled) {
          setRecentFixes(items.slice(0, 3));
          setFixHistoryCount(items.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentFixes([]);
          setFixHistoryCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, fixHistoryRefreshToken]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B0E14] text-[#E2E8F0] font-sans overflow-hidden select-none">
      
      {/* Top Navigation Bar (Professional Polish Design) */}
      <header className="flex items-center justify-between px-6 py-2.5 bg-[#161B22] border-b border-[#30363D] shrink-0 z-40">
        
        {/* Brand Logo */}
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setActiveTab('dashboard')}
        >
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-md shadow-indigo-900/30 group-hover:bg-indigo-500 transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <span className="font-bold text-base tracking-tight text-white">
            BugFixer<span className="text-indigo-400">.ai</span>
          </span>
        </div>

        {/* Right Section Controls */}
        <div className="flex items-center gap-4">
          
          {/* Active Model Pill (Clickable Model Selector) */}
          <button
            onClick={() => setIsModelSelectorOpen(true)}
            className="flex items-center gap-2 bg-[#0D1117] hover:bg-[#21262D] px-3 py-1.5 rounded-md border border-[#30363D] hover:border-indigo-500/60 text-xs transition-all cursor-pointer group shadow-xs"
            title="Click to switch active AI model & manage availability"
          >
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm shadow-green-500/50" />
            <span className="text-gray-400 group-hover:text-gray-300">Model:</span>
            <span className="text-gray-200 font-mono font-semibold text-indigo-300">{currentModel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-white transition-transform group-hover:translate-y-0.5" />
          </button>

          {/* Nav Links */}
          <div className="flex items-center gap-4">
            <NotificationBell
              notifications={notifications}
              isOpen={isNotificationOpen}
              onToggle={() => setIsNotificationOpen(prev => !prev)}
              position="header"
            />

            <button 
              onClick={() => setActiveTab('docs')}
              className={`text-xs transition-colors cursor-pointer ${
                activeTab === 'docs' ? 'text-indigo-400 font-semibold' : 'text-gray-400 hover:text-white'
              }`}
            >
              Documentation
            </button>

            <button
              onClick={() => setIsLogBugOpen(true)}
              className="hidden sm:flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm cursor-pointer"
            >
              <span>+ Quick Triage</span>
            </button>

            {/* User Avatar */}
            <div 
              onClick={() => setActiveTab('settings')}
              className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center text-xs font-bold text-indigo-300 cursor-pointer hover:bg-indigo-500/30 transition-colors shadow-inner"
              title="User Account: JD"
            >
              JD
            </div>
          </div>

        </div>
      </header>

      {/* Main App Body with Sidebar & Content */}
      {showProjectOnboarding && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-[#30363D] bg-[#0D1117] p-6 shadow-2xl">
            <div className="mb-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">Project setup</div>
              <h2 className="mt-2 text-2xl font-bold text-white">Start with a real project</h2>
              <p className="mt-2 text-sm text-gray-400">
                Create your first project before running the pipeline so analysis, fixes, and workspace state are tied to the actual repository you want to inspect.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-300">Project name</label>
                <input
                  value={onboardingName}
                  onChange={(e) => setOnboardingName(e.target.value)}
                  placeholder="My API service"
                  className="w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-gray-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-300">Source type</label>
                <select
                  value={onboardingSourceType}
                  onChange={(e) => setOnboardingSourceType(e.target.value as 'ZIP' | 'GITHUB' | 'PASTE')}
                  className="w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  <option value="ZIP">Archive upload</option>
                  <option value="GITHUB">GitHub repository</option>
                  <option value="PASTE">Paste or local snapshot</option>
                </select>
              </div>

              {onboardingSourceType === 'GITHUB' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-300">Repository URL</label>
                  <input
                    value={onboardingRepositoryUrl}
                    onChange={(e) => setOnboardingRepositoryUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-indigo-500"
                  />
                </div>
              )}

              {onboardingError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {onboardingError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProjectOnboarding(false)}
                  className="rounded-lg border border-[#30363D] px-4 py-2 text-sm text-gray-300 hover:bg-[#161B22]"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateProject()}
                  disabled={onboardingLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {onboardingLoading ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          openLogBugModal={() => setIsLogBugOpen(true)}
          bugCount={bugs.length}
          fixHistoryCount={fixHistoryCount}
          recentFixes={recentFixes}
        />

        {/* Dynamic Center View */}
        <main className="flex-1 flex flex-col bg-[#0B0E14] overflow-hidden min-w-0">
          {activeTab === 'dashboard' && (
            <DashboardView
              refreshToken={dashboardRefreshToken}
              onAnalysisDataChanged={handleAnalysisDataChanged}
              onAnalysisCompleted={handleAnalysisCompleted}
            />
          )}
          
          {activeTab === 'bugs' && (
            <BugListView
              bugs={bugs}
              onOpenNewBugModal={() => setIsLogBugOpen(true)}
              onSelectBugForDiff={(bug) => setInspectingBug(bug)}
              onNavigateToWorkspaceWithBug={handleNavigateToWorkspaceWithBug}
            />
          )}

          {activeTab === 'ai-fix-history' && (
            <AIFixHistoryView
              refreshToken={fixHistoryRefreshToken}
              onInspectFix={(item) => setInspectingHistoryItem(item)}
            />
          )}


          {activeTab === 'workspace' && (
            <WorkspaceView 
              initialSelectedBug={workspaceTargetBug}
              activeModel={currentModel}
              onOpenModelSelector={() => setIsModelSelectorOpen(true)}
              projectId={projectId}
              bugs={bugs}
            />
          )}

            {activeTab === 'analytics' && (
              <AnalyticsView
                projectId={projectId}
                refreshToken={dashboardRefreshToken}
                isCleared={isAnalyticsCleared}
                onResetAnalytics={() => setIsAnalyticsCleared(false)}
              />
            )}

          {activeTab === 'docs' && <DocsView />}

          {activeTab === 'settings' && (
            <SettingsView
              projectId={projectId}
              onHistoryChanged={handleHistoryChanged}
              onAnalyticsCleared={() => setIsAnalyticsCleared(true)}
            />
          )}
        </main>

      </div>

      {/* Footer Status Bar (Professional Polish Design) */}
      <footer className="bg-[#0D1117] border-t border-[#30363D] px-6 py-2 flex items-center justify-between text-[11px] text-gray-400 shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-gray-300">
            <span className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {backendConnected ? 'Connected to Backend' : 'Backend Unreachable'}
          </span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 font-mono">UTF-8</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 font-mono">Line 6, Col 24</span>
        </div>

        <div className="flex items-center gap-4 uppercase tracking-widest font-bold text-[10px]">
          <span className="text-indigo-400">Nexus v3.4.1</span>
        </div>
      </footer>

      {/* Modals */}
      <LogBugModal
        isOpen={isLogBugOpen}
        onClose={() => setIsLogBugOpen(false)}
        onAddBug={handleAddBug}
      />

      <InspectFixModal
        isOpen={!!inspectingBug || !!inspectingHistoryItem}
        onClose={() => {
          setInspectingBug(null);
          setInspectingHistoryItem(null);
        }}
        bug={inspectingBug}
        historyItem={inspectingHistoryItem}
        onApplyPatch={handleApplyPatch}
      />

      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        currentModel={currentModel}
        onSelectModel={(model) => {
          setCurrentModel(model);
          quotaAlertsRef.current.clear();
          void fetchSettings().then((settings) => {
            setActiveModelBackend({ provider: settings.primaryProvider, model: settings.primaryModel });
          });
        }}
      />

      <NotificationCenter
        notifications={notifications}
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        onToggle={() => setIsNotificationOpen(prev => !prev)}
        onMarkAsRead={handleMarkNotificationAsRead}
        onMarkAllAsRead={handleMarkAllNotificationsAsRead}
        onDismiss={handleDismissNotification}
        onClearAll={handleClearAllNotifications}
        onNavigateTab={setActiveTab}
        onSelectBugById={handleSelectBugById}
        onDownloadFixes={handleDownloadFixes}
      />
    </div>
  );
}