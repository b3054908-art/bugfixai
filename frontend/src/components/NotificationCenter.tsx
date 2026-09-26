import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  X, 
  Flame, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Info, 
  Clock, 
  Check, 
  ArrowRight
} from 'lucide-react';
import { AppNotification, NavigationTab, NotificationType } from '../types';

interface NotificationCenterProps {
  notifications: AppNotification[];
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onSelectBugById?: (bugId: string) => void;
  onDownloadFixes?: (notification: AppNotification) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  isOpen,
  onClose,
  onToggle,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClearAll,
  onNavigateTab,
  onSelectBugById,
  onDownloadFixes,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'critical' | 'fix'>('all');
  const popoverRef = useRef<HTMLDivElement>(null);
  void onToggle; // kept in the prop contract for the header bell trigger; not used inside the panel itself

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        // Only close if click is not on the trigger buttons
        const target = e.target as HTMLElement;
        if (!target.closest('[data-notification-trigger]')) {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const criticalCount = notifications.filter(n => n.type === 'critical').length;
  const fixCount = notifications.filter(n => n.type === 'fix').length;

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'unread') return !n.read;
    if (activeFilter === 'critical') return n.type === 'critical';
    if (activeFilter === 'fix') return n.type === 'fix';
    return true;
  });

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) {
      onMarkAsRead(n.id);
    }
    if (n.bugId && onSelectBugById) {
      onSelectBugById(n.bugId);
    } else if (n.actionTab) {
      onNavigateTab(n.actionTab);
    }
    onClose();
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'critical':
        return <Flame className="w-3.5 h-3.5 text-red-400" />;
      case 'fix':
        return <Sparkles className="w-3.5 h-3.5 text-purple-400" />;
      case 'security':
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'system':
        return <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />;
      case 'info':
      default:
        return <Info className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const getTypeBadge = (type: NotificationType) => {
    switch (type) {
      case 'critical':
        return 'bg-red-950/60 text-red-300 border-red-500/40';
      case 'fix':
        return 'bg-purple-950/60 text-purple-300 border-purple-500/40';
      case 'security':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
      case 'system':
        return 'bg-blue-950/60 text-blue-300 border-blue-500/40';
      case 'info':
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={popoverRef}
      id="notification-center-panel"
      className="fixed bottom-10 right-4 z-50 w-[420px] max-w-[calc(100vw-32px)] max-h-[580px] flex flex-col bg-[#161B22] border border-[#30363D] rounded-2xl shadow-2xl shadow-black/80 backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200 text-[#E2E8F0] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363D] bg-[#0D1117]/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-white tracking-tight">Notifications</h2>
              {unreadCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white animate-pulse">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                  All caught up
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400">Defects, AST Patches & Automated Pipeline Alerts</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              title="Mark all as read"
              className="p-1.5 rounded-md text-gray-400 hover:text-indigo-300 hover:bg-[#21262D] transition-colors cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
          )}

          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              title="Clear all notifications"
              className="p-1.5 rounded-md text-gray-400 hover:text-red-300 hover:bg-[#21262D] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#30363D] bg-[#0D1117]/40 shrink-0 text-xs">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-indigo-600 text-white font-semibold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
          }`}
        >
          All ({notifications.length})
        </button>

        <button
          onClick={() => setActiveFilter('unread')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
            activeFilter === 'unread'
              ? 'bg-indigo-600 text-white font-semibold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
          }`}
        >
          Unread ({unreadCount})
        </button>

        <button
          onClick={() => setActiveFilter('critical')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
            activeFilter === 'critical'
              ? 'bg-red-600 text-white font-semibold'
              : 'text-red-400 hover:bg-red-950/30'
          }`}
        >
          <Flame className="w-3 h-3" />
          <span>Critical ({criticalCount})</span>
        </button>

        <button
          onClick={() => setActiveFilter('fix')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
            activeFilter === 'fix'
              ? 'bg-purple-600 text-white font-semibold'
              : 'text-purple-400 hover:bg-purple-950/30'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Fixes ({fixCount})</span>
        </button>
      </div>

      {/* Notification Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#30363D]/60 max-h-[380px] p-1 scrollbar-thin">
        {filteredNotifications.length === 0 ? (
          <div className="py-12 px-4 text-center flex flex-col items-center justify-center text-gray-500 space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#0D1117] border border-[#30363D] flex items-center justify-center text-gray-600">
              <Check className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-gray-400">No notifications to display</p>
            <p className="text-[11px] text-gray-600 max-w-[240px]">
              {activeFilter === 'unread' ? 'All notifications have been marked as read.' : 'No alerts match the active filter.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((n) => (
            <div
              key={n.id}
              className={`p-3 transition-colors hover:bg-[#21262D]/60 relative group rounded-lg m-1 cursor-pointer ${
                !n.read ? 'bg-[#1C2128]/80 border-l-2 border-indigo-500' : 'opacity-85'
              }`}
              onClick={() => handleNotificationClick(n)}
            >
              <div className="flex items-start gap-2.5">
                {/* Type Icon */}
                <div className="mt-0.5 shrink-0">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${getTypeBadge(n.type)}`}>
                    {getTypeIcon(n.type)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-white truncate">
                      {n.title}
                    </span>
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 animate-ping" />
                    )}
                  </div>

                  <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed mb-1.5">
                    {n.message}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      <span>{n.timestamp}</span>
                    </div>

                    {n.downloadAnalysisRunId && onDownloadFixes ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDownloadFixes(n);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <span>Download AI fixes</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    ) : (
                      <span className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 group-hover:underline">
                        <span>View details</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Item Actions on Hover */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkAsRead(n.id);
                    }}
                    title={n.read ? "Mark as unread" : "Mark as read"}
                    className="p-1 rounded bg-[#161B22] text-gray-400 hover:text-white border border-[#30363D]"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(n.id);
                    }}
                    title="Dismiss"
                    className="p-1 rounded bg-[#161B22] text-gray-400 hover:text-red-400 border border-[#30363D]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Controls */}
      <div className="p-2.5 border-t border-[#30363D] bg-[#0D1117] flex items-center justify-end text-[11px] shrink-0">
        <div className="flex items-center gap-2 text-gray-500 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>Live Agent Sync</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export interface NotificationBellProps {
  notifications: AppNotification[];
  isOpen: boolean;
  onToggle: () => void;
  position?: 'footer' | 'header';
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  isOpen,
  onToggle,
  position = 'footer'
}) => {
  const unreadCount = notifications.filter(n => !n.read).length;
  const hasCritical = notifications.some(n => !n.read && n.type === 'critical');

  if (position === 'header') {
    return (
      <button
        data-notification-trigger
        onClick={onToggle}
        className={`relative p-2 rounded-md border text-xs transition-all cursor-pointer ${
          isOpen
            ? 'bg-indigo-600/30 border-indigo-500 text-white'
            : 'bg-[#0D1117] hover:bg-[#21262D] border-[#30363D] text-gray-300 hover:text-white'
        }`}
        title={`Notifications (${unreadCount} unread)`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className={`absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full text-[9px] font-bold text-white ${
            hasCritical ? 'bg-red-500 animate-pulse ring-2 ring-red-950' : 'bg-indigo-600'
          }`}>
            {unreadCount}
          </span>
        )}
      </button>
    );
  }

  // Footer status bar placement (replaces "Nexus v3.4.1")
  return (
    <button
      data-notification-trigger
      onClick={onToggle}
      className={`flex items-center gap-2 px-2.5 py-1 rounded border transition-all cursor-pointer text-[11px] ${
        isOpen
          ? 'bg-indigo-600/30 border-indigo-500/70 text-indigo-200 shadow-sm shadow-indigo-900/40'
          : 'bg-[#161B22] hover:bg-[#21262D] border-[#30363D] hover:border-indigo-500/50 text-gray-300 hover:text-white'
      }`}
      title="Open Notifications Center"
    >
      <div className="relative flex items-center justify-center">
        <Bell className={`w-3.5 h-3.5 ${hasCritical ? 'text-red-400' : 'text-indigo-400'}`} />
        {unreadCount > 0 && (
          <span className={`absolute -top-1 -right-1.5 w-2 h-2 rounded-full ${
            hasCritical ? 'bg-red-500 animate-ping' : 'bg-indigo-500'
          }`} />
        )}
      </div>

      <span className="font-semibold text-[10px] tracking-wider uppercase text-gray-300">
        Notifications
      </span>

      {unreadCount > 0 ? (
        <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold text-white ${
          hasCritical ? 'bg-red-600 animate-pulse' : 'bg-indigo-600'
        }`}>
          {unreadCount}
        </span>
      ) : (
        <span className="text-[9px] text-gray-500 font-mono">0</span>
      )}
    </button>
  );
};
