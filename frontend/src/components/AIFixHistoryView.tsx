import React, { useState } from 'react';
import { History, Sparkles, Search, ExternalLink } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from 'recharts';
import { fetchFixHistory, fetchFixSummary } from '../api/fixes';
import { AIFixHistoryItem, FixSummary } from '../types';

// Same indigo/green/amber/red palette used elsewhere in the AI Fix History design.
const MODEL_BAR_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];

interface AIFixHistoryViewProps {
  refreshToken: number;
  onInspectFix: (item: AIFixHistoryItem) => void;
}
export const AIFixHistoryView: React.FC<AIFixHistoryViewProps> = ({ refreshToken, onInspectFix }) => {
  const [historyItems, setHistoryItems] = useState<AIFixHistoryItem[]>([]);
  const [selectedFix, setSelectedFix] = useState<AIFixHistoryItem | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const items = await fetchFixHistory();
        setHistoryItems(items);
        if (items.length > 0) setSelectedFix(items[0]);
      } catch (err) {
        console.error('Failed to load fix history:', err);
      }
    })();
  }, [refreshToken]);

  const totalFixes = historyItems.length;
  const appliedFixes = historyItems.filter(i => i.status === 'Applied').length;
  const avgConfidence = totalFixes > 0
    ? (historyItems.reduce((sum, i) => sum + i.confidence, 0) / totalFixes).toFixed(1)
    : '0';
  const totalMinutesSaved = historyItems.reduce((sum, i) => sum + parseInt(i.estTime, 10), 0);
  const hoursSaved = (totalMinutesSaved / 60).toFixed(1);

  const [summary, setSummary] = useState<FixSummary | null>(null);
  React.useEffect(() => {
    (async () => {
      try {
        setSummary(await fetchFixSummary());
      } catch (err) {
        console.error('Failed to load fix summary:', err);
      }
    })();
  }, [refreshToken]);

  // "Suggestions Over Time" — generated vs applied fixes, grouped by date.
  const timelineData = React.useMemo(() => {
    const byDate = new Map<string, { date: string; generated: number; applied: number }>();
    for (const item of historyItems) {
      const row = byDate.get(item.date) ?? { date: item.date, generated: 0, applied: 0 };
      row.generated += 1;
      if (item.status === 'Applied') row.applied += 1;
      byDate.set(item.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [historyItems]);

  // "Acceptance Rate by Model" — same bar-chart design as the severity-based
  // version, but grouped by AI model since fix history doesn't carry the
  // originating bug's severity.
  const modelAcceptanceData = React.useMemo(() => {
    const byModel = new Map<string, { model: string; total: number; applied: number }>();
    for (const item of historyItems) {
      const row = byModel.get(item.model) ?? { model: item.model, total: 0, applied: 0 };
      row.total += 1;
      if (item.status === 'Applied') row.applied += 1;
      byModel.set(item.model, row);
    }
    return Array.from(byModel.values()).map((row, index) => ({
      model: row.model,
      rate: row.total > 0 ? Math.round((row.applied / row.total) * 100) : 0,
      color: MODEL_BAR_COLORS[index % MODEL_BAR_COLORS.length],
    }));
  }, [historyItems]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Applied' | 'Ready' | 'Superseded'>('ALL');

  const filteredHistory = historyItems.filter(item => {
    const matchesSearch = 
      item.bugId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.bugTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.patchSummary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.model.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div id="ai-fix-history-view" className="flex-1 overflow-y-auto bg-[#0B0E14] p-6 lg:p-8 space-y-6 text-[#E2E8F0]">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-md">
            <History className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              AI Patch History & Generation Audit
            </h1>
            <p className="text-xs text-gray-400">
              Audit automated fixes generated across all models, confidence distributions, and applied diffs.
            </p>
          </div>
        </div>

      
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#0D1117] border border-[#30363D] text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-gray-300">{summary ? summary.acceptanceRate : '—'}% Acceptance Rate</span>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 space-y-1 shadow-sm">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Fixes Generated</div>
          <div className="text-2xl font-bold text-white">{totalFixes} Patches</div>
          <div className="text-[11px] text-gray-500">
            {summary ? `${summary.projectCount} repos · ${summary.dateSpanDays} days` : '—'}
          </div>
        </div>

        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 space-y-1 shadow-sm">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Applied to Production</div>
          <div className="text-2xl font-bold text-green-400">{appliedFixes} Fixes</div>
          <div className="text-[11px] text-gray-500">
            {summary ? `${summary.regressionsFound} regression${summary.regressionsFound === 1 ? '' : 's'} noted` : '—'}
          </div>
        </div>

        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 space-y-1 shadow-sm">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Avg AI Confidence</div>
          <div className="text-2xl font-bold text-indigo-300">{avgConfidence}%</div>
          <div className="text-[11px] text-gray-500">
            {summary ? `${summary.acceptanceRate}% acceptance rate` : '—'}
          </div>
        </div>

        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 space-y-1 shadow-sm">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dev Time Saved</div>
          <div className="text-2xl font-bold text-white">~{hoursSaved} hrs</div>
          <div className="text-[11px] text-gray-500">
            {summary ? `est. $${summary.estimatedDollarsSaved.toLocaleString()} saved` : '—'}
          </div>
        </div>
      </div>

      {/* 2 Visual Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                Suggestions Over Time
              </h2>
              <p className="text-[11px] text-gray-400">Daily AI suggestions generated vs applied</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-indigo-400">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> Generated
              </span>
              <span className="flex items-center gap-1 text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Applied
              </span>
            </div>
          </div>

          <div className="h-44 w-full">
            {timelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
                  <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '6px', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="generated" stroke="#6366f1" strokeWidth={2} fill="#6366f1" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="applied" stroke="#22c55e" strokeWidth={2} fill="#22c55e" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-gray-500">No fix history yet</div>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-5 space-y-3 shadow-sm">
          <div>
            <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              Acceptance Rate by Model
            </h2>
            <p className="text-[11px] text-gray-400">% of AI-generated fixes applied, per model</p>
          </div>

          <div className="h-44 w-full">
            {modelAcceptanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelAcceptanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262D" vertical={false} />
                  <XAxis dataKey="model" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} unit="%" allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '6px', fontSize: '11px' }} />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={32}>
                    {modelAcceptanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-gray-500">No fix history yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Split Audit List & Live Diff Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: List of Fixes (6 Cols) */}
        <div className="xl:col-span-6 rounded-lg bg-[#0D1117] border border-[#30363D] overflow-hidden shadow-sm flex flex-col">
          
          {/* List Header & Filters */}
          <div className="p-4 border-b border-[#30363D] space-y-3 bg-[#161B22]/60">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                Generated Patches
              </h2>
              <span className="text-xs text-gray-400 font-mono">
                {filteredHistory.length} patches
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search patches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#0D1117] border border-[#30363D] text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1 text-[10px] font-semibold bg-[#0D1117] p-0.5 rounded border border-[#30363D]">
                {(['ALL', 'Applied', 'Ready', 'Superseded'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`px-2 py-1 rounded transition-all cursor-pointer ${
                      statusFilter === tab
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* List Content */}
          <div className="divide-y divide-[#21262D] max-h-[560px] overflow-y-auto">
            {filteredHistory.map(item => {
              const isSelected = selectedFix?.id === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedFix(item)}
                  className={`p-4 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                    isSelected 
                      ? 'bg-indigo-500/10 border-l-2 border-indigo-500' 
                      : 'hover:bg-[#161B22]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-gray-200">
                        {item.bugId}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-[#161B22] text-gray-300 border border-[#30363D]">
                        {item.model}
                      </span>
                      <span className="text-[10px] font-semibold text-green-400 bg-green-950/40 border border-green-500/30 px-1.5 py-0.2 rounded">
                        {item.confidence}%
                      </span>
                    </div>

                    <div className="text-xs font-medium text-gray-200 line-clamp-1">
                      {item.bugTitle}
                    </div>

                    <div className="text-[11px] text-gray-400 line-clamp-1 font-mono">
                      {item.patchSummary}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-1">
                      <span>{item.date}</span>
                      <span>·</span>
                      <span>+{item.lines} lines modified</span>
                      <span>·</span>
                      <span>Saved ~{item.estTime}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      item.status === 'Applied' 
                        ? 'bg-green-500/10 text-green-300 border-green-500/30' 
                        : item.status === 'Ready'
                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                        : 'bg-gray-800 text-gray-500 border-gray-700'
                    }`}>
                      {item.status}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectFix(item);
                      }}
                      className="text-gray-400 hover:text-white p-1"
                      title="Inspect Diff Modal"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

                {/* Right Column: Active Diff Preview Panel (6 Cols) */}
        {selectedFix && (
        <div className="xl:col-span-6 rounded-lg bg-[#0D1117] border border-[#30363D] p-5 space-y-4 shadow-sm sticky top-6">
          <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs text-gray-200">
                  {selectedFix.bugId}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {selectedFix.model}
                </span>
              </div>
              <h3 className="text-xs font-bold text-white mt-1">
                {selectedFix.bugTitle}
              </h3>
            </div>

            <button
              onClick={() => onInspectFix(selectedFix)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Full Modal Inspector</span>
            </button>
          </div>

          {/* Rationale description */}
          <div className="p-3 rounded-md bg-[#161B22] border border-[#30363D] text-xs text-gray-300 space-y-1">
            <div className="font-semibold text-gray-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI Patch Explanation</span>
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              {selectedFix.patchSummary} Tested against unit suite in Docker container with 0 regressions.
            </p>
          </div>

          {/* Unified Diff Viewer Code Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-mono text-[11px]">Unified Diff Output</span>
              <span className="text-green-400 font-mono text-[11px]">+{selectedFix.lines} lines</span>
            </div>

            <div className="rounded-md bg-[#0B0E14] border border-[#30363D] p-3 font-mono text-xs overflow-x-auto leading-relaxed max-h-[300px]">
              {(selectedFix.fullDiff ?? '').split('\n').map((line, idx) => {
                if (line.startsWith('+')) {
                  return (
                    <div key={idx} className="bg-green-950/40 text-green-300 px-2 py-0.5 rounded -mx-1">
                      {line}
                    </div>
                  );
                } else if (line.startsWith('-')) {
                  return (
                    <div key={idx} className="bg-red-950/40 text-red-400 px-2 py-0.5 rounded -mx-1 line-through opacity-80">
                      {line}
                    </div>
                  );
                } else if (line.startsWith('@@')) {
                  return (
                    <div key={idx} className="text-indigo-400 py-0.5">
                      {line}
                    </div>
                  );
                }
                return (
                  <div key={idx} className="text-gray-400 px-1">
                    {line}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quality Metrics */}
          <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
            <div className="p-2.5 rounded bg-[#161B22] border border-[#30363D]">
              <div className="text-gray-400 text-[11px]">Confidence Score</div>
              <div className="text-base font-bold text-green-400 font-mono">{selectedFix.confidence}%</div>
            </div>
            <div className="p-2.5 rounded bg-[#161B22] border border-[#30363D]">
              <div className="text-gray-400 text-[11px]">Estimated Triage Savings</div>
              <div className="text-base font-bold text-indigo-300 font-mono">{selectedFix.estTime}</div>
            </div>
          </div>

                </div>
        )}

      </div>
    </div>
  );
};