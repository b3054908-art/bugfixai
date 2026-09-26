import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  Check,
  Layout,
  Sidebar as SidebarIcon,
  Minus,
  Square,
  X,
  Bot,
  AlertTriangle,
  Gauge,
} from 'lucide-react';
import { ProviderUsage, fetchAllProviderUsage } from '../api/credentials';

const USAGE_POLL_INTERVAL_MS = 20_000;

/** Persistent badge + one-time toast for provider quota exhaustion. Polls
 * independently of the model-selector modal, since exhaustion can happen
 * mid-session while the modal is closed (that's the whole point). */
const UsageAlertBadge: React.FC = () => {
  const [usages, setUsages] = useState<ProviderUsage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<ProviderUsage | null>(null);
  const alreadyToasted = useRef<Set<string>>(new Set());
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const all = await fetchAllProviderUsage();
        if (cancelled) return;
        setUsages(all);
        // Fire a one-time toast per provider the first time it flips to
        // exhausted — never repeat it every poll tick while it stays there.
        for (const u of all) {
          if (u.exhausted && !alreadyToasted.current.has(u.provider)) {
            alreadyToasted.current.add(u.provider);
            setToast(u);
          } else if (!u.exhausted && alreadyToasted.current.has(u.provider)) {
            // Quota reset (new window) — allow a fresh toast if it runs out again.
            alreadyToasted.current.delete(u.provider);
          }
        }
      } catch {
        // Non-fatal — badge just stays at its last known state.
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), USAGE_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const trackedUsages = usages.filter(u => u.tracked);
  const exhaustedUsages = trackedUsages.filter(u => u.exhausted);

  return (
    <div className="relative" ref={wrapperRef}>
      {/* One-time toast on the transition to exhausted */}
      {toast && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-[#252526] border border-[#F48771]/50 rounded-lg shadow-2xl p-3 z-[200] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#F48771] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white capitalize">{toast.provider} quota exhausted</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {toast.worst?.model ?? 'A model'} on your {toast.provider} key has run out of tokens.
                {toast.worst?.resetTokensSeconds
                  ? ` Resets in ~${Math.ceil(toast.worst.resetTokensSeconds / 60)}m.`
                  : ' Switch models or add a different key to keep going.'}
              </p>
            </div>
            <button onClick={() => setToast(null)} className="text-gray-500 hover:text-white shrink-0 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Persistent badge — only rendered once at least one key has ever been used */}
      {trackedUsages.length > 0 && (
        <button
          onClick={() => setIsOpen(o => !o)}
          className={`flex items-center gap-1 p-1 rounded hover:bg-[#2D2D2D] transition-colors cursor-pointer ${
            exhaustedUsages.length > 0 ? 'text-[#F48771]' : 'text-[#858585] hover:text-white'
          }`}
          title="AI engine quota"
        >
          <Gauge className="w-3.5 h-3.5" />
          {exhaustedUsages.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#F48771] animate-pulse" />
          )}
        </button>
      )}

      {isOpen && trackedUsages.length > 0 && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-[#252526] border border-[#454545] rounded shadow-2xl py-1.5 z-[110] text-[12px]">
          {trackedUsages.map(u => {
            const worst = u.worst;
            const remaining = worst?.remainingTokens ?? worst?.remainingRequests;
            const limit = worst?.limitTokens ?? worst?.limitRequests;
            return (
              <div key={u.provider} className="px-3 py-1.5 flex items-center justify-between gap-3">
                <span className="capitalize text-[#CCCCCC]">{u.provider}</span>
                <span className={`font-mono text-[11px] ${u.exhausted ? 'text-[#F48771] font-bold' : 'text-[#858585]'}`}>
                  {remaining != null && limit != null ? `${remaining}/${limit}` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  hasSubmenu?: boolean;
  submenuItems?: MenuItem[];
  action?: () => void;
}

export interface IdeMenuBarProps {
  projectName?: string;
  activeFile?: string;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isBottomPanelOpen?: boolean;
  onToggleBottomPanel?: () => void;
  isRightCopilotOpen?: boolean;
  onToggleRightCopilot?: () => void;
  onSelectActivityTab?: (tab: string) => void;
  onSelectBottomTab?: (tab: string) => void;
  onRunActiveFile?: () => void;
  onStartDebugging?: () => void;
  onRunBuildTask?: () => void;
  onOpenTaskPicker?: () => void;
  onSaveFile?: () => void;
  onCloseFile?: () => void;
  onToggleDiff?: () => void;
  onOpenModelSelector?: () => void;
  onOpenCopilotSettings?: () => void;
  onOpenGoToFile?: () => void;
  onOpenWorkspaceSymbols?: () => void;
  onOpenEditorSymbols?: () => void;
  wordWrap?: boolean;
  onToggleWordWrap?: () => void;
  autoSave?: boolean;
  onToggleAutoSave?: () => void;
}

export const IdeMenuBar: React.FC<IdeMenuBarProps> = ({
  projectName = 'nexus-v3 - Antigravity IDE',
  activeFile: _activeFile = 'auth_service.py',
  isSidebarOpen = true,
  onToggleSidebar,
  isBottomPanelOpen = true,
  onToggleBottomPanel,
  isRightCopilotOpen = false,
  onToggleRightCopilot,
  onSelectActivityTab,
  onSelectBottomTab,
  onRunActiveFile,
  onStartDebugging,
  onRunBuildTask,
  onOpenTaskPicker,
  onSaveFile,
  onCloseFile,
  onToggleDiff,
  onOpenModelSelector,
  onOpenCopilotSettings,
  onOpenGoToFile,
  onOpenWorkspaceSymbols,
  onOpenEditorSymbols,
  wordWrap = false,
  onToggleWordWrap,
  autoSave = true,
  onToggleAutoSave,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
        setActiveSubmenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menuId: string) => {
    if (activeMenu === menuId) {
      setActiveMenu(null);
      setActiveSubmenu(null);
    } else {
      setActiveMenu(menuId);
      setActiveSubmenu(null);
    }
  };

  const handleMenuHover = (menuId: string) => {
    if (activeMenu !== null && activeMenu !== menuId) {
      setActiveMenu(menuId);
      setActiveSubmenu(null);
    }
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled || item.hasSubmenu) return;
    if (item.action) {
      item.action();
    }
    setActiveMenu(null);
    setActiveSubmenu(null);
  };

  // Menu Definitions
  const menus: { id: string; label: string; items: MenuItem[] }[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new_text_file', label: 'New Text File', shortcut: 'Ctrl+N' },
        { id: 'new_file', label: 'New File...', shortcut: 'Ctrl+Alt+Windows+N' },
        { id: 'new_window', label: 'New Window', shortcut: 'Ctrl+Shift+N' },
        {
          id: 'new_window_profile',
          label: 'New Window with Profile',
          hasSubmenu: true,
          submenuItems: [
            { id: 'profile_default', label: 'Default' },
            { id: 'profile_python', label: 'Python Developer' },
            { id: 'profile_frontend', label: 'Frontend Developer' }
          ]
        },
        { id: 'sep1', label: '', separator: true },
        { id: 'open_file', label: 'Open File...', shortcut: 'Ctrl+O', action: () => onSelectActivityTab?.('explorer') },
        { id: 'open_folder', label: 'Open Folder...', shortcut: 'Ctrl+K Ctrl+O', action: () => onSelectActivityTab?.('explorer') },
        { id: 'open_workspace_file', label: 'Open Workspace from File...' },
        {
          id: 'open_recent',
          label: 'Open Recent',
          hasSubmenu: true,
          submenuItems: [
            { id: 'recent_1', label: 'nexus-v3 (~/workspace/nexus-v3)' },
            { id: 'recent_2', label: 'auth-microservice' },
            { id: 'recent_3', label: 'api-gateway-v2' }
          ]
        },
        { id: 'sep2', label: '', separator: true },
        { id: 'add_folder_ws', label: 'Add Folder to Workspace...' },
        { id: 'save_ws_as', label: 'Save Workspace As...' },
        { id: 'dup_ws', label: 'Duplicate Workspace' },
        { id: 'sep3', label: '', separator: true },
        { id: 'save', label: 'Save', shortcut: 'Ctrl+S', action: onSaveFile },
        { id: 'save_as', label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: onSaveFile },
        { id: 'save_all', label: 'Save All', shortcut: 'Ctrl+K S', action: onSaveFile },
        { id: 'sep4', label: '', separator: true },
        {
          id: 'share',
          label: 'Share',
          hasSubmenu: true,
          submenuItems: [
            { id: 'share_live', label: 'Export Codebase...' },
            { id: 'share_gist', label: 'Create Public Gist' }
          ]
        },
        { id: 'sep5', label: '', separator: true },
        {
          id: 'auto_save',
          label: 'Auto Save',
          checked: autoSave,
          action: onToggleAutoSave
        },
        {
          id: 'preferences',
          label: 'Preferences',
          hasSubmenu: true,
          submenuItems: [
            { id: 'pref_settings', label: 'Settings', shortcut: 'Ctrl+,', action: onOpenCopilotSettings },
            { id: 'pref_shortcuts', label: 'Keyboard Shortcuts', shortcut: 'Ctrl+K Ctrl+S' },
            { id: 'pref_theme', label: 'Color Theme' },
            { id: 'pref_model', label: 'AI Model Selection', action: onOpenModelSelector }
          ]
        },
        { id: 'sep6', label: '', separator: true },
        { id: 'revert_file', label: 'Revert File', action: onToggleDiff },
        { id: 'close_editor', label: 'Close Editor', shortcut: 'Ctrl+F4', action: onCloseFile },
        { id: 'close_folder', label: 'Close Folder', shortcut: 'Ctrl+K F' },
        { id: 'close_window', label: 'Close Window', shortcut: 'Alt+F4' },
        { id: 'sep7', label: '', separator: true },
        { id: 'exit', label: 'Exit' }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z' },
        { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y' },
        { id: 'sep_e1', label: '', separator: true },
        { id: 'cut', label: 'Cut', shortcut: 'Ctrl+X' },
        { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C' },
        { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V' },
        { id: 'sep_e2', label: '', separator: true },
        { id: 'find', label: 'Find', shortcut: 'Ctrl+F' },
        { id: 'replace', label: 'Replace', shortcut: 'Ctrl+H' },
        { id: 'sep_e3', label: '', separator: true },
        { id: 'find_in_files', label: 'Find in Files', shortcut: 'Ctrl+Shift+F', action: () => onSelectActivityTab?.('search') },
        { id: 'replace_in_files', label: 'Replace in Files', shortcut: 'Ctrl+Shift+H', action: () => onSelectActivityTab?.('search') },
        { id: 'sep_e4', label: '', separator: true },
        { id: 'toggle_line_comment', label: 'Toggle Line Comment', shortcut: 'Ctrl+/' },
        { id: 'toggle_block_comment', label: 'Toggle Block Comment', shortcut: 'Shift+Alt+A' },
        { id: 'emmet_expand', label: 'Emmet: Expand Abbreviation', shortcut: 'Tab' }
      ]
    },
    {
      id: 'selection',
      label: 'Selection',
      items: [
        { id: 'select_all', label: 'Select All', shortcut: 'Ctrl+A' },
        { id: 'expand_sel', label: 'Expand Selection', shortcut: 'Shift+Alt+RightArrow' },
        { id: 'shrink_sel', label: 'Shrink Selection', shortcut: 'Shift+Alt+LeftArrow' },
        { id: 'sep_s1', label: '', separator: true },
        { id: 'copy_line_up', label: 'Copy Line Up', shortcut: 'Shift+Alt+UpArrow' },
        { id: 'copy_line_down', label: 'Copy Line Down', shortcut: 'Shift+Alt+DownArrow' },
        { id: 'move_line_up', label: 'Move Line Up', shortcut: 'Alt+UpArrow' },
        { id: 'move_line_down', label: 'Move Line Down', shortcut: 'Alt+DownArrow' },
        { id: 'dup_selection', label: 'Duplicate Selection' },
        { id: 'sep_s2', label: '', separator: true },
        { id: 'add_cursor_above', label: 'Add Cursor Above', shortcut: 'Ctrl+Alt+UpArrow' },
        { id: 'add_cursor_below', label: 'Add Cursor Below', shortcut: 'Ctrl+Alt+DownArrow' },
        { id: 'add_cursors_ends', label: 'Add Cursors to Line Ends', shortcut: 'Shift+Alt+I' },
        { id: 'add_next_occ', label: 'Add Next Occurrence', shortcut: 'Ctrl+D' },
        { id: 'add_prev_occ', label: 'Add Previous Occurrence' },
        { id: 'select_all_occ', label: 'Select All Occurrences' },
        { id: 'sep_s3', label: '', separator: true },
        { id: 'ctrl_click_cursor', label: 'Switch to Ctrl+Click for Multi-Cursor' },
        { id: 'col_sel_mode', label: 'Column Selection Mode' }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'cmd_palette', label: 'Command Palette...', shortcut: 'Ctrl+Shift+P' },
        { id: 'open_view', label: 'Open View...' },
        { id: 'sep_v1', label: '', separator: true },
        {
          id: 'appearance',
          label: 'Appearance',
          hasSubmenu: true,
          submenuItems: [
            { id: 'app_side_bar', label: 'Primary Side Bar', checked: isSidebarOpen, action: onToggleSidebar },
            { id: 'app_panel', label: 'Panel', checked: isBottomPanelOpen, action: onToggleBottomPanel },
            { id: 'app_copilot', label: 'Secondary Side Bar (Copilot)', checked: isRightCopilotOpen, action: onToggleRightCopilot }
          ]
        },
        {
          id: 'editor_layout',
          label: 'Editor Layout',
          hasSubmenu: true,
          submenuItems: [
            { id: 'layout_single', label: 'Single' },
            { id: 'layout_two_cols', label: 'Two Columns', action: onToggleRightCopilot },
            { id: 'layout_diff', label: 'Unified Diff Mode', action: onToggleDiff }
          ]
        },
        { id: 'sep_v2', label: '', separator: true },
        { id: 'view_explorer', label: 'Explorer', shortcut: 'Ctrl+Shift+E', action: () => onSelectActivityTab?.('explorer') },
        { id: 'view_search', label: 'Search', shortcut: 'Ctrl+Shift+F', action: () => onSelectActivityTab?.('search') },
        { id: 'view_scm', label: 'Source Control', shortcut: 'Ctrl+Shift+G', action: () => onSelectActivityTab?.('git') },
        { id: 'view_run', label: 'Run', shortcut: 'Ctrl+Shift+D', action: () => onSelectActivityTab?.('debug') },
        { id: 'view_extensions', label: 'Extensions', shortcut: 'Ctrl+Shift+X', action: () => onSelectActivityTab?.('extensions') },
        { id: 'view_testing', label: 'Testing', action: () => onSelectActivityTab?.('debug') },
        { id: 'sep_v3', label: '', separator: true },
        { id: 'view_problems', label: 'Problems', shortcut: 'Ctrl+Shift+M', action: () => { onSelectBottomTab?.('problems'); onToggleBottomPanel?.(); } },
        { id: 'view_output', label: 'Output', shortcut: 'Ctrl+Shift+U', action: () => { onSelectBottomTab?.('output'); onToggleBottomPanel?.(); } },
        { id: 'view_debug_console', label: 'Debug Console', shortcut: 'Ctrl+Shift+Y', action: () => { onSelectBottomTab?.('debug_console'); onToggleBottomPanel?.(); } },
        { id: 'view_terminal', label: 'Terminal', shortcut: 'Ctrl+`', action: () => { onSelectBottomTab?.('terminal'); onToggleBottomPanel?.(); } },
        { id: 'sep_v4', label: '', separator: true },
        { id: 'word_wrap', label: 'Word Wrap', shortcut: 'Alt+Z', checked: wordWrap, action: onToggleWordWrap }
      ]
    },
    {
      id: 'go',
      label: 'Go',
      items: [
        { id: 'go_back', label: 'Back', shortcut: 'Alt+LeftArrow' },
        { id: 'go_forward', label: 'Forward', shortcut: 'Alt+RightArrow' },
        { id: 'last_edit_loc', label: 'Last Edit Location', shortcut: 'Ctrl+K Ctrl+Q' },
        { id: 'sep_g1', label: '', separator: true },
        {
          id: 'switch_editor',
          label: 'Switch Editor',
          hasSubmenu: true,
          submenuItems: [
            { id: 'sw_next', label: 'Next Editor', shortcut: 'Ctrl+PageDown' },
            { id: 'sw_prev', label: 'Previous Editor', shortcut: 'Ctrl+PageUp' }
          ]
        },
        {
          id: 'switch_group',
          label: 'Switch Group',
          hasSubmenu: true,
          submenuItems: [
            { id: 'grp_1', label: 'Group 1' },
            { id: 'grp_2', label: 'Group 2' }
          ]
        },
        { id: 'sep_g2', label: '', separator: true },
        { id: 'go_to_file', label: 'Go to File...', shortcut: 'Ctrl+P', action: onOpenGoToFile },
        { id: 'go_to_sym_ws', label: 'Go to Symbol in Workspace...', shortcut: 'Ctrl+T', action: onOpenWorkspaceSymbols },
        { id: 'sep_g3', label: '', separator: true },
        { id: 'go_to_sym_ed', label: 'Go to Symbol in Editor...', shortcut: 'Ctrl+Shift+O', action: onOpenEditorSymbols },
        { id: 'go_to_def', label: 'Go to Definition', shortcut: 'F12', action: onOpenEditorSymbols },
        { id: 'go_to_decl', label: 'Go to Declaration' },
        { id: 'go_to_type_def', label: 'Go to Type Definition' },
        { id: 'go_to_impl', label: 'Go to Implementations', shortcut: 'Ctrl+F12' },
        { id: 'go_to_refs', label: 'Go to References', shortcut: 'Shift+F12' },
        { id: 'sep_g4', label: '', separator: true },
        { id: 'go_to_line', label: 'Go to Line/Column...', shortcut: 'Ctrl+G' },
        { id: 'go_to_bracket', label: 'Go to Bracket', shortcut: 'Ctrl+Shift+\\' },
        { id: 'sep_g5', label: '', separator: true },
        { id: 'next_problem', label: 'Next Problem', shortcut: 'F8' },
        { id: 'prev_problem', label: 'Previous Problem', shortcut: 'Shift+F8' },
        { id: 'sep_g6', label: '', separator: true },
        { id: 'next_change', label: 'Next Change', shortcut: 'Alt+F3' },
        { id: 'prev_change', label: 'Previous Change', shortcut: 'Shift+Alt+F3' }
      ]
    },
    {
      id: 'run',
      label: 'Run',
      items: [
        { id: 'start_debugging', label: 'Start Debugging', shortcut: 'F5', action: onStartDebugging },
        { id: 'run_no_debugging', label: 'Run Without Debugging', shortcut: 'Ctrl+F5', action: onRunActiveFile },
        { id: 'stop_debugging', label: 'Stop Debugging', shortcut: 'Shift+F5' },
        { id: 'restart_debugging', label: 'Restart Debugging', shortcut: 'Ctrl+Shift+F5', action: onRunActiveFile },
        { id: 'sep_r1', label: '', separator: true },
        { id: 'open_configs', label: 'Open Configurations', action: onOpenTaskPicker },
        { id: 'add_config', label: 'Add Configuration...', action: onOpenTaskPicker },
        { id: 'sep_r2', label: '', separator: true },
        { id: 'step_over', label: 'Step Over', shortcut: 'F10' },
        { id: 'step_into', label: 'Step Into', shortcut: 'F11' },
        { id: 'step_out', label: 'Step Out', shortcut: 'Shift+F11' },
        { id: 'continue', label: 'Continue', shortcut: 'F5' },
        { id: 'sep_r3', label: '', separator: true },
        { id: 'toggle_breakpoint', label: 'Toggle Breakpoint', shortcut: 'F9' },
        {
          id: 'new_breakpoint',
          label: 'New Breakpoint',
          hasSubmenu: true,
          submenuItems: [
            { id: 'conditional_bp', label: 'Conditional Breakpoint...' },
            { id: 'logpoint', label: 'Logpoint...' }
          ]
        },
        { id: 'sep_r4', label: '', separator: true },
        { id: 'enable_all_bp', label: 'Enable All Breakpoints' },
        { id: 'disable_all_bp', label: 'Disable All Breakpoints' },
        { id: 'remove_all_bp', label: 'Remove All Breakpoints' },
        { id: 'sep_r5', label: '', separator: true },
        { id: 'install_debuggers', label: 'Install Additional Debuggers...' }
      ]
    },
    {
      id: 'terminal',
      label: 'Terminal',
      items: [
        { id: 'new_terminal', label: 'New Terminal', shortcut: 'Ctrl+Shift+`', action: () => { onSelectBottomTab?.('terminal'); } },
        { id: 'split_terminal', label: 'Split Terminal', shortcut: 'Ctrl+Shift+5' },
        { id: 'new_terminal_window', label: 'New Terminal Window', shortcut: 'Ctrl+Shift+Alt+`' },
        { id: 'sep_t1', label: '', separator: true },
        { id: 'run_task', label: 'Run Task...', action: onOpenTaskPicker },
        { id: 'run_build_task', label: 'Run Build Task...', shortcut: 'Ctrl+Shift+B', action: onRunBuildTask ?? onOpenTaskPicker },
        { id: 'run_active_file', label: 'Run Active File', action: onRunActiveFile },
        { id: 'run_selected_text', label: 'Run Selected Text' },
        { id: 'sep_t2', label: '', separator: true },
        { id: 'show_running_tasks', label: 'Show Running Tasks...' },
        { id: 'restart_running_task', label: 'Restart Running Task...' },
        { id: 'terminate_task', label: 'Terminate Task...' },
        { id: 'sep_t3', label: '', separator: true },
        { id: 'configure_tasks', label: 'Configure Tasks...', action: onOpenTaskPicker },
        { id: 'configure_default_build', label: 'Configure Default Build Task...', action: onRunBuildTask ?? onOpenTaskPicker }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'welcome', label: 'Welcome' },
        { id: 'show_all_commands', label: 'Show All Commands', shortcut: 'Ctrl+Shift+P' },
        { id: 'editor_playground', label: 'Editor Playground' },
        { id: 'open_walkthrough', label: 'Open Walkthrough...' },
        { id: 'provide_feedback', label: 'Provide Feedback' },
        { id: 'download_diagnostics', label: 'Download Diagnostics' },
        { id: 'sep_h1', label: '', separator: true },
        { id: 'view_license', label: 'View License' },
        { id: 'sep_h2', label: '', separator: true },
        { id: 'toggle_devtools', label: 'Toggle Developer Tools' },
        { id: 'open_process_exp', label: 'Open Process Explorer' },
        { id: 'sep_h3', label: '', separator: true },
        { id: 'check_updates', label: 'Check for Updates...' },
        { id: 'sep_h4', label: '', separator: true },
        { id: 'about', label: 'About', shortcut: 'Ctrl+L' }
      ]
    }
  ];

  return (
    <div
      ref={menuBarRef}
      id="vscode-top-menu-bar"
      className="h-[30px] bg-[#1E1E1E] text-[#CCCCCC] text-[12px] flex items-center justify-between px-2 border-b border-[#2D2D2D] select-none z-50 shrink-0 relative"
    >
      {/* Left: Brand Icon + Top Menu Items */}
      <div className="flex items-center gap-0.5 h-full">
        {/* Antigravity / IDE Logo Icon */}
        <div className="flex items-center justify-center px-1.5 py-1 mr-1 text-[#388BFD] hover:opacity-80 transition-opacity cursor-pointer">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 19.7778H22L12 2ZM12 6.22222L17.5556 16.4444H6.44444L12 6.22222Z" />
          </svg>
        </div>

        {/* Menu Buttons: File, Edit, Selection, View, Go, Run, Terminal, Help */}
        {menus.map(menu => {
          const isOpen = activeMenu === menu.id;
          return (
            <div key={menu.id} className="relative h-full flex items-center">
              <button
                onClick={() => handleMenuClick(menu.id)}
                onMouseEnter={() => handleMenuHover(menu.id)}
                className={`px-2 py-0.5 rounded text-[12px] cursor-pointer transition-colors ${
                  isOpen
                    ? 'bg-[#3C3C3C] text-white'
                    : 'hover:bg-[#2D2D2D] text-[#CCCCCC] hover:text-white'
                }`}
              >
                {menu.label}
              </button>

              {/* Dropdown Menu Popup */}
              {isOpen && (
                <div className="absolute top-[30px] left-0 min-w-[260px] bg-[#252526] text-[#CCCCCC] rounded shadow-2xl border border-[#454545] py-1.5 z-[100] animate-in fade-in-50 duration-75 text-[12px]">
                  {menu.items.map((item, idx) => {
                    if (item.separator) {
                      return <div key={`sep-${idx}`} className="my-1 border-t border-[#3C3C3C]" />;
                    }

                    const isSubOpen = activeSubmenu === item.id;

                    return (
                      <div
                        key={item.id}
                        className="relative"
                        onMouseEnter={() => item.hasSubmenu && setActiveSubmenu(item.id)}
                        onMouseLeave={() => item.hasSubmenu && setActiveSubmenu(null)}
                      >
                        <div
                          onClick={() => handleItemClick(item)}
                          className={`flex items-center justify-between px-3 py-1 cursor-pointer transition-colors ${
                            item.disabled
                              ? 'text-[#6E6E6E] cursor-default'
                              : 'hover:bg-[#094771] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate pr-4">
                            {/* Checkmark placeholder */}
                            <span className="w-3.5 flex items-center justify-center">
                              {item.checked && <Check className="w-3 h-3 text-white" />}
                            </span>
                            <span className="truncate">{item.label}</span>
                          </div>

                          {/* Shortcut or Submenu Arrow */}
                          <div className="text-[11px] text-[#858585] ml-4 flex items-center gap-1 font-mono">
                            {item.shortcut && <span>{item.shortcut}</span>}
                            {item.hasSubmenu && <ChevronRight className="w-3 h-3 text-[#858585]" />}
                          </div>
                        </div>

                        {/* Nested Submenu */}
                        {item.hasSubmenu && isSubOpen && item.submenuItems && (
                          <div className="absolute top-0 left-full -ml-1 min-w-[200px] bg-[#252526] text-[#CCCCCC] rounded shadow-2xl border border-[#454545] py-1 z-[110]">
                            {item.submenuItems.map(subItem => (
                              <div
                                key={subItem.id}
                                onClick={() => handleItemClick(subItem)}
                                className="flex items-center justify-between px-3 py-1 hover:bg-[#094771] hover:text-white cursor-pointer text-[12px]"
                              >
                                <div className="flex items-center gap-2 truncate pr-2">
                                  <span className="w-3.5 flex items-center justify-center">
                                    {subItem.checked && <Check className="w-3 h-3 text-white" />}
                                  </span>
                                  <span className="truncate">{subItem.label}</span>
                                </div>
                                {subItem.shortcut && (
                                  <span className="text-[11px] text-[#858585] font-mono">{subItem.shortcut}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Center: Title / Workspace Breadcrumb */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-[#8E8E8E] pointer-events-none select-none font-sans">
        <span className="truncate max-w-[340px] font-normal">{projectName}</span>
      </div>

      {/* Right: Layout Toggles + Controls */}
      <div className="flex items-center gap-1 h-full text-[#858585]">
        {/* Toggle Primary Sidebar (Explorer) */}
        <button
          onClick={onToggleSidebar}
          className={`p-1 rounded hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer ${
            isSidebarOpen ? 'text-white' : 'text-[#858585]'
          }`}
          title="Toggle Primary Side Bar (Ctrl+B)"
        >
          <SidebarIcon className="w-3.5 h-3.5" />
        </button>

        {/* Toggle Bottom Panel (Terminal / Problems) */}
        <button
          onClick={onToggleBottomPanel}
          className={`p-1 rounded hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer ${
            isBottomPanelOpen ? 'text-white' : 'text-[#858585]'
          }`}
          title="Toggle Panel (Ctrl+J)"
        >
          <Layout className="w-3.5 h-3.5 rotate-180" />
        </button>

        {/* Toggle Secondary Side Bar / Copilot */}
        <button
          onClick={onToggleRightCopilot}
          className={`p-1 rounded hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer ${
            isRightCopilotOpen ? 'text-[#388BFD]' : 'text-[#858585]'
          }`}
          title="Toggle Secondary Side Bar / AI Copilot (Ctrl+Alt+B)"
        >
          <Bot className="w-3.5 h-3.5" />
        </button>

        {/* AI engine quota — persistent badge + one-time toast on exhaustion */}
        <UsageAlertBadge />

        <div className="h-3.5 w-[1px] bg-[#333333] mx-1" />

        {/* Window controls (VS Code styling) */}
        <button className="p-1 hover:bg-[#2D2D2D] hover:text-white rounded cursor-pointer" title="Minimize">
          <Minus className="w-3 h-3" />
        </button>
        <button className="p-1 hover:bg-[#2D2D2D] hover:text-white rounded cursor-pointer" title="Maximize">
          <Square className="w-2.5 h-2.5" />
        </button>
        <button className="p-1 hover:bg-[#E81123] hover:text-white rounded cursor-pointer" title="Close">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};