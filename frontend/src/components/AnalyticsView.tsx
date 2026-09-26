import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  Clock, 
  Cpu, 
  Sparkles, 
  CheckCircle2, 
  ShieldAlert, 
  Zap,
  Activity,
  Search,
  Sliders,
  Edit2,
  Gauge,
  Percent,
  X,
  Check
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell,
  BarChart,
  Bar
} from 'recharts';
import { AnalyticsResponse, fetchAnalytics } from '../api/analytics';

export interface ModelTokenMetric {
  id: string;
  name: string;
  provider: 'Google AI' | 'OpenAI' | 'Anthropic' | 'Groq LPU' | 'OpenRouter';
  providerKey: 'google' | 'openai' | 'anthropic' | 'groq' | 'openrouter';
  badge: string;
  contextWindow: string;
  contextWindowTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  tokensUsed: number;
  tokenLimit: number;
  tpmLimit: number;
  rpmLimit: number;
  estCost: number;
}

const initialModelMetrics: ModelTokenMetric[] = [
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google AI',
    providerKey: 'google',
    badge: 'Flagship Coding',
    contextWindow: '2M tokens',
    contextWindowTokens: 2000000,
    promptTokens: 620400,
    completionTokens: 220100,
    cachedTokens: 340000,
    tokensUsed: 840500,
    tokenLimit: 2000000,
    tpmLimit: 2000000,
    rpmLimit: 360,
    estCost: 4.20
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google AI',
    providerKey: 'google',
    badge: 'Ultra Fast',
    contextWindow: '1M tokens',
    contextWindowTokens: 1000000,
    promptTokens: 325000,
    completionTokens: 85200,
    cachedTokens: 120000,
    tokensUsed: 410200,
    tokenLimit: 1000000,
    tpmLimit: 4000000,
    rpmLimit: 1000,
    estCost: 0.41
  },
  {
    id: 'openai-gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    providerKey: 'openai',
    badge: 'Omni Coder',
    contextWindow: '128k tokens',
    contextWindowTokens: 128000,
    promptTokens: 388100,
    completionTokens: 136000,
    cachedTokens: 150000,
    tokensUsed: 524100,
    tokenLimit: 1000000,
    tpmLimit: 800000,
    rpmLimit: 500,
    estCost: 5.24
  },
  {
    id: 'anthropic-claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    badge: 'Top Benchmark',
    contextWindow: '200k tokens',
    contextWindowTokens: 2000000,
    promptTokens: 278200,
    completionTokens: 104200,
    cachedTokens: 80000,
    tokensUsed: 382400,
    tokenLimit: 600000,
    tpmLimit: 400000,
    rpmLimit: 250,
    estCost: 3.82
  },
  {
    id: 'groq-llama-3.3-70b',
    name: 'Llama 3.3 70B Versatile',
    provider: 'Groq LPU',
    providerKey: 'groq',
    badge: '500+ tok/s',
    contextWindow: '128k tokens',
    contextWindowTokens: 128000,
    promptTokens: 165300,
    completionTokens: 50500,
    cachedTokens: 0,
    tokensUsed: 215800,
    tokenLimit: 500000,
    tpmLimit: 1000000,
    rpmLimit: 600,
    estCost: 0.18
  },
  {
    id: 'openrouter-deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'OpenRouter',
    providerKey: 'openrouter',
    badge: 'Reasoning',
    contextWindow: '64k tokens',
    contextWindowTokens: 64000,
    promptTokens: 72120,
    completionTokens: 40200,
    cachedTokens: 25000,
    tokensUsed: 112320,
    tokenLimit: 300000,
    tpmLimit: 200000,
    rpmLimit: 150,
    estCost: 0.35
  }
];

const mttrData = [
  { week: 'Wk 28', manualHours: 18.5, aiHours: 2.1 },
  { week: 'Wk 29', manualHours: 16.2, aiHours: 1.8 },
  { week: 'Wk 30', manualHours: 19.4, aiHours: 1.4 },
  { week: 'Wk 31', manualHours: 15.0, aiHours: 1.1 },
  { week: 'Wk 32', manualHours: 14.2, aiHours: 0.8 },
];

const categoryDistribution = [
  { name: 'Auth & JWT', value: 35, color: '#a855f7' },
  { name: 'Rate Limiting', value: 25, color: '#06b6d4' },
  { name: 'Memory Leaks', value: 20, color: '#f59e0b' },
  { name: 'DB / SQL', value: 15, color: '#10b981' },
  { name: 'Docker / Infra', value: 5, color: '#f43f5e' },
];

export interface AnalyticsViewProps {
  isCleared?: boolean;
  onResetAnalytics?: () => void;
  projectId?: string | null;
  refreshToken?: number;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  isCleared = false,
  onResetAnalytics,
  projectId,
  refreshToken = 0,
}) => {
  // Custom or configured model token limits state
  const [modelMetrics, setModelMetrics] = useState<ModelTokenMetric[]>(() => {
    try {
      const stored = localStorage.getItem('bugfixer_custom_token_limits');
      if (stored) {
        const customLimits = JSON.parse(stored) as Record<string, number>;
        return initialModelMetrics.map(m => ({
          ...m,
          tokenLimit: customLimits[m.id] !== undefined ? customLimits[m.id] : m.tokenLimit
        }));
      }
    } catch (e) {
      console.error(e);
    }
    return initialModelMetrics;
  });

  // Filter and search states for the token limit tracker
  const [providerFilter, setProviderFilter] = useState<string>('ALL');
  const [modelSearchQuery, setModelSearchQuery] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'month' | 'week' | 'today'>('month');

  // Modal / Inline editor state for editing a model's token limit
  const [editingModel, setEditingModel] = useState<{ id: string; name: string; currentLimit: number } | null>(null);
  const [customLimitInput, setCustomLimitInput] = useState<string>('');

  const [projectMetrics, setProjectMetrics] = useState<AnalyticsResponse | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProjectMetrics(null);
      return;
    }

    let cancelled = false;
    fetchAnalytics(projectId)
      .then((data) => {
        if (!cancelled) setProjectMetrics(data);
      })
      .catch(() => {
        if (!cancelled) setProjectMetrics(null);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshToken]);

  // Time range multiplier for demo simulation
  const timeMultiplier = timeRange === 'month' ? 1.0 : timeRange === 'week' ? 0.28 : 0.05;

  const handleOpenLimitEditor = (model: ModelTokenMetric) => {
    setEditingModel({
      id: model.id,
      name: model.name,
      currentLimit: model.tokenLimit
    });
    setCustomLimitInput(model.tokenLimit.toString());
  };

  const handleSaveTokenLimit = () => {
    if (!editingModel) return;
    const newLimit = parseInt(customLimitInput.replace(/,/g, ''), 10);
    if (isNaN(newLimit) || newLimit <= 0) return;

    setModelMetrics(prev => {
      const updated = prev.map(m => m.id === editingModel.id ? { ...m, tokenLimit: newLimit } : m);
      try {
        const savedMap: Record<string, number> = {};
        updated.forEach(item => { savedMap[item.id] = item.tokenLimit; });
        localStorage.setItem('bugfixer_custom_token_limits', JSON.stringify(savedMap));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });

    setEditingModel(null);
  };

  // Filtered and calculated model data
  const filteredModels = useMemo(() => {
    return modelMetrics.filter(m => {
      const matchesProvider = providerFilter === 'ALL' || m.providerKey === providerFilter;
      const matchesSearch = m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                            m.provider.toLowerCase().includes(modelSearchQuery.toLowerCase());
      return matchesProvider && matchesSearch;
    });
  }, [modelMetrics, providerFilter, modelSearchQuery]);

  // Aggregate totals
  const effectiveMttrMinutes = isCleared ? 0 : (projectMetrics?.mttrMinutes ?? 48);
  const effectiveAiRepairedBugs = isCleared ? 0 : (projectMetrics?.aiRepairedBugs ?? 92);
  const effectiveTestPassRate = isCleared ? 0 : (projectMetrics?.testPassRate ?? 100);
  const effectiveBugsDetected = isCleared ? 0 : (projectMetrics?.bugsDetected ?? 92);
  const effectiveFixesGenerated = isCleared ? 0 : (projectMetrics?.fixesGenerated ?? 94);
  const effectiveCost = isCleared ? 0 : (projectMetrics?.aiComputeCost ?? Number((modelMetrics.reduce((acc, m) => acc + (m.estCost * timeMultiplier), 0)).toFixed(2)));

  const totalTokensUsed = isCleared 
    ? 0 
    : Math.round(modelMetrics.reduce((acc, m) => acc + (m.tokensUsed * timeMultiplier), 0));

  const totalTokenLimit = isCleared 
    ? 0 
    : modelMetrics.reduce((acc, m) => acc + m.tokenLimit, 0);

  const totalPromptTokens = isCleared 
    ? 0 
    : Math.round(modelMetrics.reduce((acc, m) => acc + (m.promptTokens * timeMultiplier), 0));

  const totalCompletionTokens = isCleared 
    ? 0 
    : Math.round(modelMetrics.reduce((acc, m) => acc + (m.completionTokens * timeMultiplier), 0));

  const totalCost = isCleared 
    ? 0 
    : effectiveCost;

  const overallQuotaPercentage = totalTokenLimit > 0 
    ? Number(((totalTokensUsed / totalTokenLimit) * 100).toFixed(1)) 
    : 0;

  const remainingTokens = Math.max(0, totalTokenLimit - totalTokensUsed);

  // Bar chart data for tokens used vs limit
  const chartData = useMemo(() => {
    return modelMetrics.map(m => {
      const used = isCleared ? 0 : Math.round(m.tokensUsed * timeMultiplier);
      const limit = m.tokenLimit;
      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
      return {
        name: m.name.replace(' (OpenRouter)', '').replace(' (Groq)', ''),
        used,
        limit,
        percent,
        provider: m.provider
      };
    });
  }, [modelMetrics, isCleared, timeMultiplier]);

  const displayedMttr = isCleared ? [
    { week: 'Wk 28', manualHours: 0, aiHours: 0 },
    { week: 'Wk 29', manualHours: 0, aiHours: 0 },
    { week: 'Wk 30', manualHours: 0, aiHours: 0 },
    { week: 'Wk 31', manualHours: 0, aiHours: 0 },
    { week: 'Wk 32', manualHours: 0, aiHours: 0 },
  ] : mttrData;

  const displayedCategories = isCleared ? [
    { name: 'No Telemetry Recorded', value: 100, color: '#334155' }
  ] : categoryDistribution;

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatShort = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  return (
    <div id="analytics-view" className="flex-1 overflow-y-auto bg-[#0b0f19] p-6 lg:p-8 space-y-8 text-[#E2E8F0]">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-md">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              Engineering Diagnostics &amp; Analytics
            </h1>
            <p className="text-sm text-slate-400">
              AI repair velocity, LLM model token usage &amp; quota limits, MTTR reductions, and vulnerability telemetry.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isCleared && onResetAnalytics && (
            <button
              onClick={onResetAnalytics}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-semibold transition-colors cursor-pointer shadow-md"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Reload Benchmark Report</span>
            </button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#131826] border border-[#1f283d] text-xs font-semibold text-slate-300">
            <Activity className={`w-3.5 h-3.5 ${!isCleared ? 'text-emerald-400 animate-pulse' : 'text-gray-500'}`} />
            <span>{!isCleared ? 'Real-Time Telemetry Active' : 'Telemetry Report Cleared'}</span>
          </div>
        </div>
      </div>

      {/* Cleared Notice Banner */}
      {isCleared && (
        <div className="p-5 rounded-2xl bg-[#131826] border border-[#1f283d] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Analytical Report Cleared</div>
              <p className="text-xs text-slate-400 mt-0.5">
                The analytical diagnostics, MTTR trends, and model token usage dataset was purged in Settings.
              </p>
            </div>
          </div>
          {onResetAnalytics && (
            <button
              onClick={onResetAnalytics}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold font-mono transition-colors shrink-0 cursor-pointer shadow-md"
            >
              Regenerate Telemetry Report
            </button>
          )}
        </div>
      )}

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#131826] border border-[#1f283d] p-5 space-y-1">
          <div className="flex items-center justify-between text-cyan-400">
            <Clock className="w-4 h-4" />
            <span className={`text-[11px] font-bold ${!isCleared ? 'text-emerald-400' : 'text-slate-500'}`}>
              {!isCleared ? `${Math.max(0, 100 - Math.min(99, Math.round(effectiveMttrMinutes / 3)))}%` : '0%'}
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{!isCleared ? `${effectiveMttrMinutes} mins` : '0 mins'}</div>
          <div className="text-xs text-slate-400 font-medium">Mean Time to Repair (MTTR)</div>
        </div>

        <div className="rounded-2xl bg-[#131826] border border-[#1f283d] p-5 space-y-1">
          <div className="flex items-center justify-between text-purple-400">
            <Zap className="w-4 h-4" />
            <span className={`text-[11px] font-bold ${!isCleared ? 'text-purple-400' : 'text-slate-500'}`}>
              {!isCleared ? `${Math.min(100, Math.round((effectiveAiRepairedBugs / Math.max(1, effectiveBugsDetected || effectiveAiRepairedBugs || 1)) * 100))}%` : '0%'}
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{!isCleared ? `${effectiveBugsDetected} Bugs` : '0 Bugs'}</div>
          <div className="text-xs text-slate-400 font-medium">{!isCleared ? `Detected • ${effectiveFixesGenerated} generated` : 'Bugs Detected'}</div>
        </div>

        <div className="rounded-2xl bg-[#131826] border border-[#1f283d] p-5 space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className={`text-[11px] font-bold ${!isCleared ? 'text-emerald-400' : 'text-slate-500'}`}>
              {!isCleared ? `${effectiveTestPassRate}%` : 'No data'}
            </span>
          </div>
          <div className={`text-2xl font-bold ${!isCleared ? 'text-emerald-400' : 'text-slate-500'}`}>
            {!isCleared ? `${effectiveTestPassRate}%` : '0%'}
          </div>
          <div className="text-xs text-slate-400 font-medium">Docker Sandbox Test Pass Rate</div>
        </div>

        <div className="rounded-2xl bg-[#131826] border border-[#1f283d] p-5 space-y-1">
          <div className="flex items-center justify-between text-amber-400">
            <Cpu className="w-4 h-4" />
            <span className="text-[11px] font-bold text-slate-400">
              {!isCleared ? `${formatShort(totalTokensUsed)} / ${formatShort(totalTokenLimit)}` : '0'}
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{!isCleared ? `$${totalCost.toFixed(2)}` : '$0.00'}</div>
          <div className="text-xs text-slate-400 font-medium">Est. AI Token Compute Cost</div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION: LLM MODELS TOTAL TOKENS USED & LIMIT TRACKER */}
      {/* ============================================================ */}
      <div id="llm-model-tokens-section" className="rounded-2xl bg-[#131826] border border-[#1f283d] p-6 space-y-6">
        
        {/* Section Header with Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#1f283d]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  LLM Models: Total Tokens Used &amp; Quota Limits
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Live Quota Tracker
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Comprehensive token consumption telemetry, per-model quota thresholds, and rate limits across all integrated AI models.
              </p>
            </div>
          </div>

          {/* Timeframe & Filter controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg bg-[#0b0f19] border border-[#1f283d] p-0.5 text-xs font-medium">
              <button
                onClick={() => setTimeRange('month')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'month' ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly Quota
              </button>
              <button
                onClick={() => setTimeRange('week')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'week' ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Past 7 Days
              </button>
              <button
                onClick={() => setTimeRange('today')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  timeRange === 'today' ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Today
              </button>
            </div>
          </div>
        </div>

        {/* Global Token Quota & Consumption Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Tokens Used */}
          <div className="p-4 rounded-xl bg-[#0b0f19] border border-[#1f283d] space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Total Tokens Used</span>
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">
                {formatNumber(totalTokensUsed)}
              </span>
              <span className="text-xs font-mono text-cyan-400 font-semibold">
                ({formatShort(totalTokensUsed)})
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-[#1a2234]">
              <span>Prompt: <strong className="text-slate-300 font-mono">{formatShort(totalPromptTokens)}</strong></span>
              <span>Completion: <strong className="text-slate-300 font-mono">{formatShort(totalCompletionTokens)}</strong></span>
            </div>
          </div>

          {/* Card 2: Total Token Limit (Quota) */}
          <div className="p-4 rounded-xl bg-[#0b0f19] border border-[#1f283d] space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Total Token Limit / Quota</span>
              <Gauge className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">
                {formatNumber(totalTokenLimit)}
              </span>
              <span className="text-xs font-mono text-purple-400 font-semibold">
                ({formatShort(totalTokenLimit)})
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-[#1a2234]">
              <span>Remaining:</span>
              <span className="text-emerald-400 font-mono font-semibold">
                {formatNumber(remainingTokens)} tokens
              </span>
            </div>
          </div>

          {/* Card 3: Quota Consumption % Meter */}
          <div className="p-4 rounded-xl bg-[#0b0f19] border border-[#1f283d] space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Limit Consumed</span>
              <Percent className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-2xl font-bold font-mono ${
                overallQuotaPercentage > 85 ? 'text-rose-400' : overallQuotaPercentage > 60 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {overallQuotaPercentage}%
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {modelMetrics.length} Models Active
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-[#1a2234] overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  overallQuotaPercentage > 85 
                    ? 'bg-rose-500' 
                    : overallQuotaPercentage > 60 
                    ? 'bg-amber-500' 
                    : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                }`}
                style={{ width: `${Math.min(100, overallQuotaPercentage)}%` }}
              />
            </div>
          </div>

          {/* Card 4: Estimated Compute Cost */}
          <div className="p-4 rounded-xl bg-[#0b0f19] border border-[#1f283d] space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Total Incurred Spend</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">
                ${totalCost.toFixed(2)}
              </span>
              <span className="text-xs text-emerald-400 font-semibold font-mono">
                USD
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-[#1a2234]">
              <span>Avg cost / 1k tok:</span>
              <span className="text-slate-300 font-mono">
                ${totalTokensUsed > 0 ? ((totalCost / totalTokensUsed) * 1000).toFixed(4) : '0.0000'}
              </span>
            </div>
          </div>

        </div>

        {/* Visual Chart: Tokens Used vs Token Limit per Model */}
        <div className="p-5 rounded-xl bg-[#0b0f19] border border-[#1f283d] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Tokens Used vs Token Limit by Model</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Visualizing headroom and allocated quota saturation across models
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="w-3 h-3 rounded-xs bg-indigo-500" />
                <span>Tokens Used</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="w-3 h-3 rounded-xs bg-[#222f4c] border border-cyan-500/40" />
                <span>Token Limit (Quota)</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2234" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  tick={{ fontSize: 11, fill: '#94a3b8' }} 
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis 
                  stroke="#64748b" 
                  tick={{ fontSize: 11, fill: '#94a3b8' }} 
                  tickFormatter={(val) => formatShort(val)}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f1422', 
                    borderColor: '#1f283d', 
                    borderRadius: '10px', 
                    fontSize: '12px',
                    fontFamily: 'monospace'
                  }}
                  formatter={(val: any, name: any) => {
                    const num = Number(val);
                    return [
                      `${formatNumber(num)} tokens (${formatShort(num)})`,
                      name === 'used' ? 'Tokens Used' : 'Token Limit'
                    ];
                  }}
                />
                <Bar dataKey="limit" fill="#1e293b" stroke="#38bdf8" strokeWidth={1} radius={[4, 4, 0, 0]} name="limit" />
                <Bar dataKey="used" fill="#6366f1" radius={[4, 4, 0, 0]} name="used" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Filter Tabs & Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
          {/* Provider Filter Tabs */}
          <div className="flex items-center flex-wrap gap-1.5">
            {[
              { id: 'ALL', label: 'All Providers' },
              { id: 'google', label: 'Google AI' },
              { id: 'openai', label: 'OpenAI' },
              { id: 'anthropic', label: 'Anthropic' },
              { id: 'groq', label: 'Groq LPU' },
              { id: 'openrouter', label: 'OpenRouter' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setProviderFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                  providerFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-[#0b0f19] hover:bg-[#161f33] text-slate-400 hover:text-white border border-[#1f283d]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search model or provider..."
              value={modelSearchQuery}
              onChange={(e) => setModelSearchQuery(e.target.value)}
              className="w-full bg-[#0b0f19] border border-[#1f283d] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-mono"
            />
          </div>
        </div>

        {/* Granular Per-Model Breakdown Table */}
        <div className="overflow-x-auto rounded-xl border border-[#1f283d]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0b0f19] border-b border-[#1f283d] text-slate-400 font-mono uppercase text-[10px]">
                <th className="py-3 px-4">LLM Model</th>
                <th className="py-3 px-4">Provider</th>
                <th className="py-3 px-4">Tokens Used</th>
                <th className="py-3 px-4">Token Limit</th>
                <th className="py-3 px-4">Quota Utilization</th>
                <th className="py-3 px-4">Context / Rate Limit</th>
                <th className="py-3 px-4">Est. Cost</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2234] bg-[#0d121f]">
              {filteredModels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 font-mono">
                    No models match your current filter or search criteria.
                  </td>
                </tr>
              ) : (
                filteredModels.map(model => {
                  const used = isCleared ? 0 : Math.round(model.tokensUsed * timeMultiplier);
                  const limit = model.tokenLimit;
                  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
                  const prompt = isCleared ? 0 : Math.round(model.promptTokens * timeMultiplier);
                  const completion = isCleared ? 0 : Math.round(model.completionTokens * timeMultiplier);
                  const cost = isCleared ? 0 : (model.estCost * timeMultiplier);

                  const statusColor = percent > 85 
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' 
                    : percent > 60 
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' 
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

                  const statusLabel = percent > 95
                    ? 'Limit Exceeded'
                    : percent > 85
                    ? 'Approaching Limit'
                    : percent > 60
                    ? 'Moderate'
                    : 'Optimal';

                  return (
                    <tr key={model.id} className="hover:bg-[#131b2e] transition-colors">
                      {/* Model */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white font-mono">{model.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                            {model.badge}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          In: {formatShort(prompt)} | Out: {formatShort(completion)}
                        </div>
                      </td>

                      {/* Provider */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#161f33] text-slate-300 border border-[#222f4c]">
                          {model.provider}
                        </span>
                      </td>

                      {/* Tokens Used */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-bold text-white text-sm">
                          {formatNumber(used)}
                        </div>
                        <div className="text-[10px] text-cyan-400">
                          {formatShort(used)} tokens
                        </div>
                      </td>

                      {/* Token Limit */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-bold text-slate-200">
                          {formatNumber(limit)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatShort(limit)} quota limit
                        </div>
                      </td>

                      {/* Quota Utilization & Progress Bar */}
                      <td className="py-3.5 px-4">
                        <div className="w-40 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-white">{percent}%</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#1a2234] overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                percent > 85 ? 'bg-rose-500' : percent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, percent)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {formatShort(Math.max(0, limit - used))} remaining
                          </div>
                        </div>
                      </td>

                      {/* Context & Rate Limit */}
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="text-slate-300">
                          Window: <strong className="text-white">{model.contextWindow}</strong>
                        </div>
                        <div className="text-slate-500 text-[10px]">
                          TPM: {formatShort(model.tpmLimit)} | RPM: {model.rpmLimit}
                        </div>
                      </td>

                      {/* Est Cost */}
                      <td className="py-3.5 px-4 font-mono text-sm font-semibold text-emerald-400">
                        ${cost.toFixed(2)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenLimitEditor(model)}
                          className="flex items-center gap-1 ml-auto px-2.5 py-1 rounded-md bg-[#161f33] hover:bg-indigo-600 hover:text-white text-slate-300 border border-[#222f4c] text-[11px] font-mono transition-colors cursor-pointer"
                          title="Adjust token limit for this model"
                        >
                          <Edit2 className="w-3 h-3 text-cyan-400" />
                          <span>Edit Limit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* ============================================================ */}
      {/* SECTION: CHARTS SECTION (MTTR & ROOT CAUSE DISTRIBUTION) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* MTTR Reduction Chart (2 cols) */}
        <div className="lg:col-span-2 rounded-2xl bg-[#131826] border border-[#1f283d] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Mean Time to Resolution (MTTR in Hours)</h2>
              <p className="text-xs text-slate-400">Manual triage vs AI-assisted automated patch delivery</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600" /> Manual
              </span>
              <span className="flex items-center gap-1.5 text-purple-400">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> BugFixAI
              </span>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayedMttr}>
                <defs>
                  <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f283d" vertical={false} />
                <XAxis dataKey="week" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="h" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f1422', borderColor: '#1f283d', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Area type="monotone" dataKey="manualHours" stroke="#475569" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="aiHours" stroke="#8b5cf6" strokeWidth={2.5} fillOpacity={1} fill="url(#aiGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bug Category Breakdown (1 col) */}
        <div className="rounded-2xl bg-[#131826] border border-[#1f283d] p-6 space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Root Cause Distribution</h2>
            <p className="text-xs text-slate-400">Classification of bugs discovered in codebase</p>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={displayedCategories}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {displayedCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f1422', borderColor: '#1f283d', borderRadius: '12px', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 text-xs">
            {displayedCategories.map(cat => (
              <div key={cat.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span>{cat.name}</span>
                </span>
                <span className="font-semibold text-slate-400">{cat.value}%</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ============================================================ */}
      {/* EDIT TOKEN LIMIT MODAL */}
      {/* ============================================================ */}
      {editingModel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#131826] border border-[#1f283d] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f283d] bg-[#0b0f19]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Adjust Model Token Limit</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{editingModel.name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingModel(null)}
                className="p-1 rounded hover:bg-[#1a2234] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block font-mono">
                  Monthly Token Limit (Tokens)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={customLimitInput}
                    onChange={(e) => setCustomLimitInput(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-[#1f283d] rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-hidden focus:border-indigo-500"
                    placeholder="e.g. 1000000"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">
                    tokens
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Current configured limit: <strong className="text-white font-mono">{formatNumber(editingModel.currentLimit)}</strong> tokens
                </p>
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1.5 pt-2 border-t border-[#1a2234]">
                <span className="text-[11px] font-mono text-slate-400 block">Quick Preset Allocations:</span>
                <div className="flex items-center flex-wrap gap-2 font-mono">
                  {[
                    { label: '500k', value: 500000 },
                    { label: '1M', value: 1000000 },
                    { label: '2M', value: 2000000 },
                    { label: '5M', value: 5000000 },
                  ].map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setCustomLimitInput(preset.value.toString())}
                      className="px-2.5 py-1 rounded-md bg-[#0b0f19] hover:bg-indigo-600 hover:text-white border border-[#1f283d] text-slate-300 text-xs transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-[#0b0f19] border-t border-[#1f283d] flex items-center justify-end gap-2.5 font-mono text-xs">
              <button
                onClick={() => setEditingModel(null)}
                className="px-3.5 py-1.5 rounded-lg hover:bg-[#1a2234] text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTokenLimit}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all cursor-pointer shadow-md"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save New Limit</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};