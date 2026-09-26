import {
  AlertTriangle,
  ArrowDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Info,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  XCircle
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { LogLine } from '../types';

export interface ExtendedLogLine extends LogLine {
  phaseName?: string;
  durationMs?: number;
  details?: string;
  codeSnippet?: string;
}

interface LiveLogTableProps {
  logs: ExtendedLogLine[];
  isExecuting: boolean;
  currentPhaseName?: string;
  onClearLogs?: () => void;
  onRestartPipeline?: () => void;
}

export const LiveLogTable: React.FC<LiveLogTableProps> = ({
  logs,
  isExecuting,
  currentPhaseName = 'Run & Test',
  onClearLogs,
  onRestartPipeline
}) => {
  const [filter, setFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'PASS' | 'INFO'>('ALL');

  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const tableBottomRef = useRef<HTMLTableRowElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive (if autoScroll enabled and not paused)
  useEffect(() => {
    if (autoScroll && !isPaused && tableBottomRef.current) {
      tableBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isPaused]);

  const handleCopyLog = (log: ExtendedLogLine, e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = `[${log.timestamp}] [${log.level}] [${log.category || log.phaseName || 'system'}] ${log.message}${log.details ? '\nDetails: ' + log.details : ''}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportLogs = () => {
    const logData = logs.map(l => `[${l.timestamp}] [${l.level.padEnd(5)}] [${(l.phaseName || l.category).padEnd(14)}] ${l.message}${l.details ? `\n    └─ ${l.details}` : ''}`).join('\n');
    const blob = new Blob([logData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-execution-run-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter logs based on search query and log level
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.category && log.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.phaseName && log.phaseName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.details && log.details.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filter === 'ALL') return true;
    if (filter === 'ERROR') return log.level === 'ERROR';
    if (filter === 'WARN') return log.level === 'WARN';
    if (filter === 'PASS') return log.level === 'PASS';
    if (filter === 'INFO') return log.level === 'INFO';
    return true;
  });

  const errorCount = logs.filter(l => l.level === 'ERROR').length;
  const warnCount = logs.filter(l => l.level === 'WARN').length;
  const passCount = logs.filter(l => l.level === 'PASS').length;
  const infoCount = logs.filter(l => l.level === 'INFO').length;

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-950/60 text-red-400 border border-red-500/40">
            <XCircle className="w-2.5 h-2.5" />
            ERROR
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-2.5 h-2.5" />
            WARN
          </span>
        );
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-950/60 text-green-400 border border-green-500/40">
            <CheckCircle2 className="w-2.5 h-2.5" />
            PASS
          </span>
        );
      case 'INFO':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/50 text-indigo-300 border border-indigo-500/30">
            <Info className="w-2.5 h-2.5" />
            INFO
          </span>
        );
    }
  };

  return (
    <div 
      id="analysis-live-log-table-card" 
      className={`rounded-lg bg-[#0D1117] border border-[#30363D] flex flex-col shadow-sm transition-all duration-200 ${
        isMaximized ? 'fixed inset-4 z-50 bg-[#0D1117]/95 backdrop-blur-md shadow-2xl border-indigo-500/50' : 'w-full'
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-[#161B22] border-b border-[#30363D] rounded-t-lg">
        
        {/* Left: Title & Live Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              Execution Live Log Table
            </h3>
          </div>

          {/* Real-time Status Badge */}
          {isExecuting ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-[10px] font-mono font-semibold text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
              <span>STREAMING LIVE · {currentPhaseName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#21262D] border border-[#30363D] text-[10px] font-mono text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span>SYNCED ({logs.length} lines)</span>
            </div>
          )}
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          
          {/* Pause / Resume Log Streaming */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
              isPaused 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                : 'bg-[#21262D] text-gray-300 border-[#30363D] hover:text-white'
            }`}
            title={isPaused ? "Resume Live Stream" : "Pause Live Stream to Inspect"}
          >
            {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
            <span className="text-[11px]">{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
              autoScroll 
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40' 
                : 'bg-[#21262D] text-gray-400 border-[#30363D] hover:text-gray-200'
            }`}
            title="Auto-scroll to latest log row"
          >
            <ArrowDown className={`w-3 h-3 ${autoScroll ? 'text-indigo-400' : ''}`} />
            <span>Auto-scroll</span>
          </button>

          {/* Clear logs */}
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="p-1.5 rounded text-gray-400 hover:text-white bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] transition-colors cursor-pointer"
              title="Clear current log table"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}

          {/* Export logs */}
          <button
            onClick={handleExportLogs}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262D] hover:bg-[#30363D] text-gray-300 hover:text-white border border-[#30363D] text-[11px] font-medium transition-colors cursor-pointer"
            title="Export full raw logs as .log file"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Maximize / Minimize Table */}
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 rounded text-gray-400 hover:text-white bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] transition-colors cursor-pointer"
            title={isMaximized ? "Restore view" : "Maximize log table"}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

        </div>

      </div>

      {/* 2. Filter & Live Search Sub-bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 py-2 bg-[#0B0E14] border-b border-[#30363D] text-xs">
        
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search logs by error, phase, file, test..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 rounded bg-[#161B22] border border-[#30363D] text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-[11px]"
            >
              ×
            </button>
          )}
        </div>

        {/* Level Filters with Counts */}
        <div className="flex items-center gap-1 text-[10px] font-semibold bg-[#161B22] p-0.5 rounded border border-[#30363D] overflow-x-auto">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap ${
              filter === 'ALL' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            ALL ({logs.length})
          </button>

          <button
            onClick={() => setFilter('ERROR')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              filter === 'ERROR' ? 'bg-red-600 text-white shadow-xs' : 'text-red-400 hover:text-red-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            ERRORS ({errorCount})
          </button>

          <button
            onClick={() => setFilter('WARN')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              filter === 'WARN' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            WARNS ({warnCount})
          </button>

          <button
            onClick={() => setFilter('PASS')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              filter === 'PASS' ? 'bg-green-600 text-white shadow-xs' : 'text-green-400 hover:text-green-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            PASS ({passCount})
          </button>

          <button
            onClick={() => setFilter('INFO')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap ${
              filter === 'INFO' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            INFO ({infoCount})
          </button>
        </div>

      </div>

      {/* 3. High-Density Structured Table Area */}
      <div 
        ref={tableContainerRef}
        className={`overflow-x-auto overflow-y-auto font-mono text-xs ${
          isMaximized ? 'flex-1' : 'max-h-[340px]'
        }`}
      >
        <table className="w-full text-left border-collapse select-text">
          {/* Table Header */}
          <thead className="sticky top-0 z-10 bg-[#161B22] text-[#858585] text-[10px] uppercase font-bold tracking-wider border-b border-[#30363D]">
            <tr>
              <th className="py-2 px-3 w-8"></th>
              <th className="py-2 px-3 w-24">TIME</th>
              <th className="py-2 px-3 w-20">LEVEL</th>
              <th className="py-2 px-3 w-36">PHASE / SCOPE</th>
              <th className="py-2 px-4">EXECUTION MESSAGE</th>
              <th className="py-2 px-3 text-right w-20">DELTA</th>
              <th className="py-2 px-3 text-center w-12">ACTION</th>
            </tr>
          </thead>

          {/* Table Body Rows */}
          <tbody className="divide-y divide-[#21262D] text-[11px] leading-relaxed text-[#D4D4D4]">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-500 font-sans">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Terminal className="w-8 h-8 text-gray-600" />
                    <span>No log entries match the selected filter query</span>
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="text-xs text-indigo-400 hover:underline cursor-pointer"
                      >
                        Clear search term
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredLogs.map((log, index) => {
                const isExpanded = expandedLogId === log.id;
                const isError = log.level === 'ERROR';
                const isWarn = log.level === 'WARN';
                const isPass = log.level === 'PASS';

                return (
                  <React.Fragment key={log.id}>
                    <tr 
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className={`hover:bg-[#161B22] transition-colors cursor-pointer group ${
                        isExpanded ? 'bg-[#1C2128]' : isError ? 'bg-red-950/15' : isWarn ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Expand Chevron */}
                      <td className="py-2 px-2 text-center text-gray-500">
                        {log.details || log.codeSnippet ? (
                          isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300" />
                          )
                        ) : (
                          <span className="text-gray-700 text-[10px]">#{index + 1}</span>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="py-2 px-3 text-gray-400 whitespace-nowrap text-[10px]">
                        {log.timestamp}
                      </td>

                      {/* Level Badge */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {getLevelBadge(log.level)}
                      </td>

                      {/* Phase / Scope */}
                      <td className="py-2 px-3 text-gray-300 whitespace-nowrap">
                        <span className="font-semibold text-gray-200">
                          {log.phaseName ? `[${log.phaseName}]` : `[${log.category}]`}
                        </span>
                      </td>

                      {/* Execution Message */}
                      <td className="py-2 px-4">
                        <span className={`${
                          isError 
                            ? 'text-red-300 font-semibold' 
                            : isWarn 
                            ? 'text-amber-200' 
                            : isPass 
                            ? 'text-green-300' 
                            : 'text-gray-300'
                        }`}>
                          {log.message}
                        </span>
                      </td>

                      {/* Duration / Delta */}
                      <td className="py-2 px-3 text-right text-gray-500 whitespace-nowrap text-[10px]">
                        {log.durationMs ? `+${log.durationMs}ms` : '—'}
                      </td>

                      {/* Quick Copy Action */}
                      <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleCopyLog(log, e)}
                          className="p-1 text-gray-500 hover:text-white rounded hover:bg-[#2A2D2E] transition-colors cursor-pointer"
                          title="Copy log entry"
                        >
                          {copiedId === log.id ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Detail Sub-row */}
                    {isExpanded && (log.details || log.codeSnippet) && (
                      <tr className="bg-[#0B0E14] border-l-2 border-indigo-500">
                        <td colSpan={7} className="p-3 pl-8">
                          <div className="space-y-2 text-xs font-mono">
                            {log.details && (
                              <div className="p-2.5 rounded bg-[#161B22] border border-[#30363D] text-gray-300 leading-relaxed">
                                <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">
                                  Diagnostic Stack & Context
                                </div>
                                <div className="text-gray-300 whitespace-pre-wrap">
                                  {log.details}
                                </div>
                              </div>
                            )}

                            {log.codeSnippet && (
                              <div className="p-2.5 rounded bg-[#161B22] border border-[#30363D]">
                                <div className="text-[10px] text-indigo-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                  <Sparkles className="w-3 h-3" />
                                  <span>Automated Fix Suggestion Preview</span>
                                </div>
                                <pre className="text-green-400 text-[11px] overflow-x-auto">
                                  {log.codeSnippet}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
            <tr ref={tableBottomRef} />
          </tbody>
        </table>
      </div>

      {/* 4. Table Footer Summary */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161B22] border-t border-[#30363D] text-[11px] text-gray-400 rounded-b-lg select-none">
        <div className="flex items-center gap-4">
          <span>Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong> execution entries</span>
          {isPaused && (
            <span className="text-amber-400 font-medium">⚠️ Live stream is paused</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Buffer: Healthy</span>
          </span>
          {onRestartPipeline && (
            <button
              onClick={onRestartPipeline}
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Re-run Analysis</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
};
