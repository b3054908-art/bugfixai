import React, { useEffect, useRef } from 'react';
import { 
  LayoutGrid, 
  Bug, 
  History, 
  Code2, 
  BarChart3, 
  FileText, 
  Settings, 
  ChevronLeft,
  Plus,
  CheckCircle2
} from 'lucide-react';
import { AIFixHistoryItem, NavigationTab } from '../types';

interface SidebarProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  collapsed?: boolean;
  setCollapsed?: (val: boolean) => void;
  openLogBugModal?: () => void;
  openCriticalBugsModal?: () => void;
  bugCount?: number;
  fixHistoryCount?: number;
  recentFixes?: AIFixHistoryItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  collapsed = false,
  setCollapsed,
  openLogBugModal,
  bugCount = 0,
  fixHistoryCount = 0,
  recentFixes = [],
}) => {
  // Auto-hide: expand when the mouse touches the left edge of the screen,
  // collapse again when the mouse leaves the sidebar itself.
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!setCollapsed) return;
    const EDGE_PX = 8;
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX <= EDGE_PX) setCollapsed(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [setCollapsed]);

  return (
    <aside 
      id="sidebar" 
      ref={asideRef}
      onMouseLeave={() => setCollapsed?.(true)}
      className={`h-full bg-[#0D1117] border-r border-[#30363D] flex flex-col justify-between select-none transition-all duration-300 z-30 shrink-0 ${
        collapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Top Section */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        
        {/* Action Button: New Bug Analysis */}
        <div className="p-4 border-b border-[#30363D]">
          <button
            onClick={openLogBugModal}
            className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-3 rounded-md text-xs transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer ${
              collapsed ? 'p-2' : ''
            }`}
            title="New Bug Analysis"
          >
            <Plus className="w-4 h-4" />
            {!collapsed && <span>+ New Bug Analysis</span>}
          </button>
        </div>

        {/* CORE Navigation Items */}
        <div className="py-3 px-2 space-y-1">
          {!collapsed && (
            <div className="px-3 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Navigation
            </div>
          )}
          
          <button
            id="nav-dashboard-btn"
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-300 font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#161B22]'
            }`}
            title="Dashboard"
          >
            <LayoutGrid className={`w-4 h-4 ${activeTab === 'dashboard' ? 'text-indigo-400' : 'text-gray-400'}`} />
            {!collapsed && <span>Dashboard & Pipeline</span>}
          </button>

          <button
            id="nav-bugs-btn"
            onClick={() => setActiveTab('bugs')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'bugs'
                ? 'bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-300 font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#161B22]'
            }`}
            title="Bug List"
          >
            <div className="flex items-center gap-3">
              <Bug className={`w-4 h-4 ${activeTab === 'bugs' ? 'text-indigo-400' : 'text-gray-400'}`} />
              {!collapsed && <span>Bug List</span>}
            </div>
            {!collapsed && activeTab !== 'bugs' && bugCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded bg-red-500/20 text-red-400 border border-red-500/30">
                {bugCount}
              </span>
            )}
          </button>

          <button
            id="nav-fix-history-btn"
            onClick={() => setActiveTab('ai-fix-history')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'ai-fix-history'
                ? 'bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-300 font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#161B22]'
            }`}
            title="AI Fix History"
          >
            <div className="flex items-center gap-3">
              <History className={`w-4 h-4 ${activeTab === 'ai-fix-history' ? 'text-indigo-400' : 'text-gray-400'}`} />
              {!collapsed && <span>AI Fix History</span>}
            </div>
            {!collapsed && activeTab !== 'ai-fix-history' && fixHistoryCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {fixHistoryCount}
              </span>
            )}
          </button>

          <button
            id="nav-workspace-btn"
            onClick={() => setActiveTab('workspace')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-300 font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#161B22]'
            }`}
            title="Workspace IDE"
          >
            <Code2 className={`w-4 h-4 ${activeTab === 'workspace' ? 'text-indigo-400' : 'text-gray-400'}`} />
            {!collapsed && <span>Workspace IDE</span>}
          </button>

          <button
            id="nav-analytics-btn"
            onClick={() => setActiveTab('analytics')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-300 font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#161B22]'
            }`}
            title="Analytics"
          >
            <BarChart3 className={`w-4 h-4 ${activeTab === 'analytics' ? 'text-indigo-400' : 'text-gray-400'}`} />
            {!collapsed && <span>Analytics</span>}
          </button>

          <button
            id="nav-docs-btn"
            onClick={() => setActiveTab('docs')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'docs'
                ? 'bg-indigo-500/15 border-l-2 border-indigo-500 text-indigo-300 font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#161B22]'
            }`}
            title="Docs"
          >
            <FileText className={`w-4 h-4 ${activeTab === 'docs' ? 'text-indigo-400' : 'text-gray-400'}`} />
            {!collapsed && <span>Documentation</span>}
          </button>
        </div>

        {/* Recent Fixes Section */}
        {!collapsed && (
          <div className="py-2 space-y-1 border-t border-[#30363D]">
            <div className="px-4 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Recent Fixes
            </div>
            
            {recentFixes.length === 0 ? (
              <div className="px-4 py-2 text-xs text-gray-500">No recent fixes</div>
            ) : (
              recentFixes.map((fix) => (
                <div
                  key={fix.id}
                  onClick={() => setActiveTab('ai-fix-history')}
                  className="flex items-center px-4 py-2 hover:bg-[#161B22] text-xs text-gray-400 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-2.5 text-indigo-400 shrink-0" />
                  <span className="truncate font-mono">{fix.bugTitle || fix.patchSummary || 'Patch'}</span>
                </div>
              ))
            )}
          </div>
        )}

      </div>

      {/* Bottom Section: Usage & Settings */}
      <div className="border-t border-[#30363D] bg-[#161B22]/50 p-4 space-y-3">
        
        {/* Monthly Usage Gauge */}
        {!collapsed && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>Usage this month</span>
              <span className="font-semibold text-indigo-300">84%</span>
            </div>
            <div className="w-full bg-[#30363D] h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full w-[84%] rounded-full transition-all duration-500" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 text-xs transition-colors cursor-pointer ${
              activeTab === 'settings' ? 'text-indigo-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            {!collapsed && <span>Settings</span>}
          </button>

          {setCollapsed && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-[#21262D]"
              title="Toggle sidebar"
            >
              <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

      </div>
    </aside>
  );
};
