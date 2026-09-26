import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Gauge,
  Info,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import {
  CredentialStatus,
  ModelInfo as LiveModelInfo,
  ModelUsage,
  ProviderUsage,
  deleteCredential,
  fetchCredentialStatus,
  fetchProviderModels,
  fetchProviderUsage,
  saveCredential
} from '../api/credentials';
import { fetchSettings, updateSettings } from '../api/settings';

const USAGE_POLL_INTERVAL_MS = 20_000;

/** Formats a raw token count the way the provider reports it — no rounding
 * tricks, just compact grouping (e.g. 87,000 / 12.4K). */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatContextWindow(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M tokens`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k tokens`;
  return `${n} tokens`;
}

export interface AIModelOption {
  id: string;
  name: string;
  provider: string;
  badge?: string;
  contextWindow: string;
  latency: string;
  description: string;
  strengths: string[];
  enabled: boolean;
  status: 'available' | 'high-demand' | 'preview';
  benchmarkScore: number;
  /** Real backend provider/model identifiers this UI entry maps to. */
  backend: { provider: string; model: string };
}

export const defaultModels: AIModelOption[] = [
  {
    id: 'GPT-4-Turbo',
    name: 'GPT-4-Turbo',
    provider: 'OpenAI',
    badge: 'Standard',
    contextWindow: '128k tokens',
    latency: '1.2s avg',
    description: 'High-throughput reasoning model tuned for rapid AST parsing, unit test generation, and multi-step bug reproduction.',
    strengths: ['Fast Synthesis', 'Broad Ecosystem', 'Reliable Diffs'],
    enabled: true,
    status: 'available',
    benchmarkScore: 92.4,
    backend: { provider: 'openai', model: 'gpt-4-turbo' },
  },
  {
    id: 'GPT-4o',
    name: 'GPT-4o (Omni)',
    provider: 'OpenAI',
    badge: 'Popular',
    contextWindow: '128k tokens',
    latency: '0.8s avg',
    description: 'Flagship omni-modal reasoning with fast execution, exceptional code explanation, and deep cross-file dependency awareness.',
    strengths: ['Low Latency', 'Multi-File Context', 'High Confidence'],
    enabled: true,
    status: 'available',
    benchmarkScore: 95.8,
    backend: { provider: 'openai', model: 'gpt-4o' },
  },
  {
    id: 'Claude-3-5-Sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    badge: 'Top Coder',
    contextWindow: '200k tokens',
    latency: '1.4s avg',
    description: 'State-of-the-art coding benchmark performance. Excels at complex refactoring, subtle race conditions, and zero-regression patches.',
    strengths: ['Precise Syntax', 'Zero-Regressions', 'Complex Logic'],
    enabled: true,
    status: 'available',
    benchmarkScore: 98.2,
    backend: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  },
  {
    id: 'Gemini-1-5-Pro',
    name: 'Gemini 1.5 Pro',
    provider: 'Google DeepMind',
    badge: '2M Context',
    contextWindow: '2M tokens',
    latency: '1.5s avg',
    description: 'Extreme context window suitable for ingesting full multi-service monorepos, complete framework trees, and massive log dumps.',
    strengths: ['Massive Context', 'Deep Log Analysis', 'Monorepo Search'],
    enabled: true,
    status: 'available',
    benchmarkScore: 94.6,
    backend: { provider: 'google', model: 'gemini-1.5-pro' },
  },
  {
    id: 'DeepSeek-V3',
    name: 'DeepSeek-V3 / R1',
    provider: 'DeepSeek AI',
    badge: 'Reasoning',
    contextWindow: '64k tokens',
    latency: '1.9s avg',
    description: 'High-density chain-of-thought model specialized in mathematical correctness, algorithmic edge-cases, and formal verification.',
    strengths: ['Chain-of-Thought', 'Low Cost', 'Deep Algorithmic Fixes'],
    enabled: true,
    status: 'available',
    benchmarkScore: 96.1,
    backend: { provider: 'deepseek', model: 'deepseek-chat' },
  },
  {
    id: 'Llama-3-3-70B',
    name: 'Llama 3.3 70B Versatile',
    provider: 'Groq',
    badge: 'Free Tier',
    contextWindow: '131k tokens',
    latency: '0.4s avg',
    description: 'Open-weights model served on Groq\'s LPU hardware for extremely fast inference. Strong all-around free option — no cost, no card required.',
    strengths: ['Free & Fast', 'Zero Cost', 'Open Weights'],
    enabled: true,
    status: 'available',
    benchmarkScore: 89.9,
    backend: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  },
  {
    id: 'GPT-OSS-20B',
    name: 'GPT OSS 20B',
    provider: 'Groq',
    badge: 'Available',
    contextWindow: '131k tokens',
    latency: 'Fast',
    description: 'OpenAI open-weight model served through Groq for fast coding assistance.',
    strengths: ['Fast Inference', 'Coding', 'Open Weights'],
    enabled: true,
    status: 'available',
    benchmarkScore: 89.0,
    backend: { provider: 'groq', model: 'openai/gpt-oss-20b' },
  },
  {
    id: 'Llama-3-1-8B-Instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'Groq',
    badge: 'Free Tier',
    contextWindow: '131k tokens',
    latency: '0.2s avg',
    description: 'Smaller, extremely fast open-weights model on Groq. Best free option for quick, high-volume chat where the 70B model\'s extra reasoning isn\'t needed.',
    strengths: ['Fastest Response', 'Highest Free Quota', 'Zero Cost'],
    enabled: true,
    status: 'available',
    benchmarkScore: 85.2,
    backend: { provider: 'groq', model: 'llama-3.1-8b-instant' },
  },
  {
    id: 'Llama-4-Scout',
    name: 'Llama 4 Scout',
    provider: 'Groq',
    badge: 'Free Tier',
    contextWindow: '131k tokens',
    latency: '0.5s avg',
    description: 'Meta\'s newer MoE model on Groq\'s free tier — a solid step up in reasoning quality over Llama 3.x at similar speed.',
    strengths: ['Newer Architecture', 'Free & Fast', 'Good Reasoning'],
    enabled: true,
    status: 'available',
    benchmarkScore: 91.0,
    backend: { provider: 'groq', model: 'llama-4-scout-17b-16e-instruct' },
  },
  {
    id: 'Qwen3-32B',
    name: 'Qwen3 32B',
    provider: 'Groq',
    badge: 'Free Tier',
    contextWindow: '131k tokens',
    latency: '0.4s avg',
    description: 'Alibaba\'s Qwen3 served free on Groq. Competitive coding and reasoning performance for a fully free model.',
    strengths: ['Strong Coding', 'Free & Fast', 'Open Weights'],
    enabled: true,
    status: 'available',
    benchmarkScore: 90.4,
    backend: { provider: 'groq', model: 'qwen3-32b' },
  },
  {
    id: 'DeepSeek-R1-Distill-70B',
    name: 'DeepSeek R1 Distill 70B',
    provider: 'Groq',
    badge: 'Free Tier',
    contextWindow: '131k tokens',
    latency: '0.6s avg',
    description: 'Distilled reasoning model on Groq\'s free tier — chain-of-thought style reasoning at no cost.',
    strengths: ['Chain-of-Thought', 'Free & Fast', 'Zero Cost'],
    enabled: true,
    status: 'available',
    benchmarkScore: 92.8,
    backend: { provider: 'groq', model: 'deepseek-r1-distill-70b' },
  },
  {
    id: 'Kimi-K2',
    name: 'Kimi K2 Instruct',
    provider: 'Groq',
    badge: 'Free Tier',
    contextWindow: '262k tokens',
    latency: '0.5s avg',
    description: 'Moonshot AI\'s Kimi K2 on Groq\'s free tier — the largest free context window available here, useful for bigger files.',
    strengths: ['Largest Free Context', 'Free & Fast', 'Zero Cost'],
    enabled: true,
    status: 'available',
    benchmarkScore: 90.1,
    backend: { provider: 'groq', model: 'kimi-k2-instruct' },
  }
];

/** Maps a real backend (provider, model) pair back to this UI's model id, for
 * showing the correct selection when settings were set some other way. */
export function resolveModelId(provider: string, model: string): string {
  const match = defaultModels.find(
    m => m.backend.provider === provider && m.backend.model === model
  );
  return match?.id ?? defaultModels[0].id;
}

// Provider tabs that hit the live "bring your own key" flow. 'ALL' stays a
// curated static overview and isn't part of this list.
const LIVE_PROVIDER_TABS: { label: string; id: string }[] = [
  { label: 'Groq', id: 'groq' },
  { label: 'OpenAI', id: 'openai' },
  { label: 'Anthropic', id: 'anthropic' },
  { label: 'Google', id: 'google' },
  { label: 'DeepSeek', id: 'deepseek' },
  { label: 'OpenRouter', id: 'openrouter' },
  { label: 'NVIDIA', id: 'nvidia' },
];

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onSelectModel: (modelId: string) => void;
}

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  currentModel,
  onSelectModel
}) => {
  const [models, setModels] = useState<AIModelOption[]>(defaultModels);
  const [selectedId, setSelectedId] = useState<string>(currentModel);
  const [activeBackend, setActiveBackend] = useState<{ provider: string; model: string } | null>(null);
  const [filterProvider, setFilterProvider] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live "bring your own key" state, keyed by provider id.
  const [credentialStatus, setCredentialStatus] = useState<Record<string, CredentialStatus>>({});
  const [liveModels, setLiveModels] = useState<Record<string, LiveModelInfo[]>>({});
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Real per-key/per-model quota, captured from actual chat calls — only
  // populated for providers the user has actually used at least once.
  const [providerUsage, setProviderUsage] = useState<Record<string, ProviderUsage>>({});

  // Sync with the real persisted setting whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setFilterProvider('ALL');
    setKeyInput('');
    setKeyError(null);
    (async () => {
      try {
        const settings = await fetchSettings();
        const resolved = resolveModelId(settings.primaryProvider, settings.primaryModel);
        setSelectedId(resolved);
        setActiveBackend({ provider: settings.primaryProvider, model: settings.primaryModel });
      } catch (err) {
        // Non-fatal — keep whatever was passed in as currentModel.
        setError(err instanceof ApiError ? err.message : 'Could not load saved model preference.');
      }
      try {
        const statuses = await fetchCredentialStatus();
        const byProvider: Record<string, CredentialStatus> = {};
        statuses.forEach(s => { byProvider[s.provider] = s; });
        setCredentialStatus(byProvider);
      } catch {
        // Non-fatal — provider tabs will just show the key form on demand.
      }
    })();
  }, [isOpen]);

  const loadProviderModels = async (providerId: string) => {
    setLoadingProvider(providerId);
    setKeyError(null);
    try {
      const res = await fetchProviderModels(providerId);
      setCredentialStatus(prev => ({
        ...prev,
        [providerId]: {
          provider: providerId,
          hasKey: prev[providerId]?.hasKey ?? false,
          envFallback: res.configured && !(prev[providerId]?.hasKey),
          baseUrl: prev[providerId]?.baseUrl ?? null,
        },
      }));
      if (res.configured) {
        setLiveModels(prev => ({ ...prev, [providerId]: res.models }));
      }
    } catch (err) {
      setKeyError(err instanceof ApiError ? err.message : 'Could not load models for this provider.');
    } finally {
      setLoadingProvider(null);
    }
  };

  useEffect(() => {
    if (!isOpen || filterProvider === 'ALL') return;
    const providerId = LIVE_PROVIDER_TABS.find(t => t.label === filterProvider)?.id;
    if (!providerId || liveModels[providerId]) return;
    void loadProviderModels(providerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProvider, isOpen]);

  // Poll real usage for whichever provider tab is active — quota changes
  // any time a chat call goes through, independent of anything this modal
  // triggers itself, so a snapshot-on-open would go stale fast.
  useEffect(() => {
    if (!isOpen || filterProvider === 'ALL') return;
    const providerId = LIVE_PROVIDER_TABS.find(t => t.label === filterProvider)?.id;
    if (!providerId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const usage = await fetchProviderUsage(providerId);
        if (!cancelled) setProviderUsage(prev => ({ ...prev, [providerId]: usage }));
      } catch {
        // Non-fatal — usage display just stays stale until the next tick.
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), USAGE_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [filterProvider, isOpen]);

  if (!isOpen) return null;

  const toggleModelAvailability = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModels(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };

  const handleApplySelection = async (modelId: string) => {
    const target = models.find(m => m.id === modelId);
    if (!target) return;

    if (!target.enabled) {
      setModels(prev => prev.map(m => m.id === modelId ? { ...m, enabled: true } : m));
    }

    setSaving(true);
    setError(null);
    try {
      await updateSettings(target.backend.provider, target.backend.model);
      setSelectedId(modelId);
      setActiveBackend(target.backend);
      onSelectModel(modelId);
      setTimeout(() => onClose(), 400);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not save this model as the active engine.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSelectLiveModel = async (providerId: string, model: LiveModelInfo) => {
    setSaving(true);
    setError(null);
    try {
      await updateSettings(providerId, model.id);
      setSelectedId('');
      setActiveBackend({ provider: providerId, model: model.id });
      onSelectModel(model.name);
      setTimeout(() => onClose(), 400);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this model as the active engine.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async (providerId: string) => {
    if (!keyInput.trim()) return;
    setConnecting(true);
    setKeyError(null);
    try {
      const res = await saveCredential(providerId, keyInput.trim());
      setCredentialStatus(prev => ({
        ...prev,
        [providerId]: { provider: providerId, hasKey: true, envFallback: false, baseUrl: null },
      }));
      setLiveModels(prev => ({ ...prev, [providerId]: res.models }));
      setKeyInput('');
    } catch (err) {
      setKeyError(err instanceof ApiError ? err.message : 'Could not validate this API key.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    setConnecting(true);
    setKeyError(null);
    try {
      await deleteCredential(providerId);
      setCredentialStatus(prev => ({ ...prev, [providerId]: { provider: providerId, hasKey: false, envFallback: false, baseUrl: null } }));
      setLiveModels(prev => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
    } catch (err) {
      setKeyError(err instanceof ApiError ? err.message : 'Could not remove this key.');
    } finally {
      setConnecting(false);
    }
  };

  const filteredModels = models.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          m.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          m.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProvider = filterProvider === 'ALL' || m.provider.toLowerCase().includes(filterProvider.toLowerCase());
    return matchesSearch && matchesProvider;
  });

  const activeProviderTab = LIVE_PROVIDER_TABS.find(t => t.label === filterProvider);
  const activeProviderId = activeProviderTab?.id ?? null;
  const activeStatus = activeProviderId ? credentialStatus[activeProviderId] : undefined;
  const activeModels = activeProviderId ? (liveModels[activeProviderId] ?? []) : [];
  const freeModels = activeModels.filter(m => m.free).filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.id.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const paidModels = activeModels.filter(m => !m.free).filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.id.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const isConfigured = !!activeStatus && (activeStatus.hasKey || activeStatus.envFallback);
  const activeUsage = activeProviderId ? providerUsage[activeProviderId] : undefined;
  const usageByModel: Record<string, ModelUsage> = {};
  activeUsage?.models.forEach(m => { usageByModel[m.model] = m; });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#0D1117] border border-[#30363D] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-150 text-[#E2E8F0]">

        {/* Modal Header */}
        <div className="p-5 border-b border-[#30363D] flex items-center justify-between bg-[#161B22]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-900/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">AI Engine & Model Management</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/30 rounded-full">
                  6 Models Connected
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Switch the active LLM engine for AST parsing, real-time code fixes, and workspace chat.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#21262D] rounded-lg transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 border-b border-[#30363D] bg-[#0B0E14] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['ALL', ...LIVE_PROVIDER_TABS.map(t => t.label)].map(p => (
              <button
                key={p}
                onClick={() => setFilterProvider(p)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  filterProvider === p
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-[#161B22] text-gray-400 hover:text-gray-200 border border-[#30363D]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search model or capability..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-56 px-3 py-1.5 bg-[#161B22] border border-[#30363D] rounded-md text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 text-xs text-[#F48771] bg-[#4B1113]/30 border border-[#F48771]/40 rounded px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-[#0B0E14]">
          {filterProvider === 'ALL' ? (
            filteredModels.map((model) => {
              const isCurrentlySelected = selectedId === model.id;

              return (
                <div
                  key={model.id}
                  onClick={() => void handleApplySelection(model.id)}
                  className={`group rounded-lg border p-4 transition-all cursor-pointer relative ${
                    isCurrentlySelected
                      ? 'bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-950/30'
                      : 'bg-[#0D1117] border-[#30363D] hover:border-gray-500 hover:bg-[#161B22]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">

                    {/* Left info */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${model.enabled ? 'bg-green-500 shadow-xs shadow-green-500/50' : 'bg-gray-600'}`} />
                          <h3 className="text-sm font-bold text-white font-mono">{model.name}</h3>
                        </div>

                        <span className="text-[11px] text-gray-400 font-mono">by {model.provider}</span>

                        {model.badge && (
                          <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                            {model.badge}
                          </span>
                        )}

                        {isCurrentlySelected && (
                          <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-green-500/20 text-green-300 border border-green-500/40 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            ACTIVE ENGINE
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-300 leading-relaxed pr-2">
                        {model.description}
                      </p>

                      {/* Metadata tags */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="px-2 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-[11px] text-gray-400 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-indigo-400" />
                          {model.contextWindow}
                        </span>

                        <span className="px-2 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          {model.latency}
                        </span>

                        <span className="px-2 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-[11px] text-gray-400 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-green-400" />
                          {model.benchmarkScore}% CodeEval
                        </span>

                        {model.strengths.map((str, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-[#161B22] text-gray-400 text-[10px]">
                            • {str}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#21262D]">

                      {/* Availability Switch */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[11px] text-gray-400">Availability</span>
                        <button
                          onClick={(e) => toggleModelAvailability(model.id, e)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                            model.enabled ? 'bg-indigo-600' : 'bg-gray-700'
                          }`}
                          title={model.enabled ? "Disable model" : "Enable model"}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            model.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>

                      {/* Choose button */}
                      <button
                        onClick={() => void handleApplySelection(model.id)}
                        disabled={saving}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                          isCurrentlySelected
                            ? 'bg-green-600 text-white shadow-sm'
                            : 'bg-[#21262D] hover:bg-indigo-600 text-gray-200 hover:text-white border border-[#30363D]'
                        }`}
                      >
                        {saving && isCurrentlySelected ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isCurrentlySelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </>
                        ) : (
                          <span>Select Model</span>
                        )}
                      </button>

                    </div>

                  </div>
                </div>
              );
            })
          ) : (
            <>
              {keyError && (
                <div className="flex items-start gap-2 text-xs text-[#F48771] bg-[#4B1113]/30 border border-[#F48771]/40 rounded px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{keyError}</span>
                </div>
              )}

              {loadingProvider === activeProviderId && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-10">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking your {filterProvider} account...
                </div>
              )}

              {loadingProvider !== activeProviderId && !isConfigured && activeProviderId && (
                <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-6 max-w-lg mx-auto text-center space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mx-auto">
                    <KeyRound className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Connect your {filterProvider} account</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Enter an API key and we'll validate it directly against {filterProvider}, then list every free and paid model your key can access.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={`${filterProvider} API key`}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect(activeProviderId); }}
                      className="flex-1 px-3 py-2 bg-[#161B22] border border-[#30363D] rounded-md text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => void handleConnect(activeProviderId)}
                      disabled={connecting || !keyInput.trim()}
                      className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                      Connect
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500">Your key is encrypted at rest and only used server-side to call {filterProvider}.</p>
                </div>
              )}

              {loadingProvider !== activeProviderId && isConfigured && activeProviderId && (
                <>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      {activeStatus?.hasKey ? 'Connected with your API key' : 'Using the server default key'}
                    </span>
                    {activeStatus?.hasKey && (
                      <button
                        onClick={() => void handleDisconnect(activeProviderId)}
                        disabled={connecting}
                        className="flex items-center gap-1 text-gray-400 hover:text-[#F48771] cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" /> Remove key
                      </button>
                    )}
                  </div>

                  {/* Per-key quota summary — the model closest to exhaustion
                      among everything real chat calls have reported so far. */}
                  {activeUsage?.tracked && activeUsage.worst && (
                    <KeyUsageSummary usage={activeUsage} />
                  )}

                  {freeModels.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-400 uppercase tracking-wide px-1">
                        <Sparkles className="w-3.5 h-3.5" /> Free Models
                      </div>
                      {freeModels.map(model => (
                        <LiveModelCard
                          key={model.id}
                          model={model}
                          usage={usageByModel[model.id]}
                          isActive={activeBackend?.provider === activeProviderId && activeBackend?.model === model.id}
                          saving={saving}
                          onSelect={() => void handleSelectLiveModel(activeProviderId, model)}
                        />
                      ))}
                    </div>
                  )}

                  {paidModels.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 uppercase tracking-wide px-1">
                        <Lock className="w-3.5 h-3.5" /> Paid Models
                      </div>
                      {paidModels.map(model => (
                        <LiveModelCard
                          key={model.id}
                          model={model}
                          usage={usageByModel[model.id]}
                          isActive={activeBackend?.provider === activeProviderId && activeBackend?.model === model.id}
                          saving={saving}
                          onSelect={() => void handleSelectLiveModel(activeProviderId, model)}
                        />
                      ))}
                    </div>
                  )}

                  {freeModels.length === 0 && paidModels.length === 0 && (
                    <div className="text-center text-xs text-gray-500 py-10">
                      No models matched your search for {filterProvider}.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#30363D] bg-[#161B22] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-gray-400">
            <Info className="w-4 h-4 text-indigo-400" />
            <span>Active model applies immediately to Workspace IDE, AST diagnostics & PR bots.</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] text-gray-200 font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};

/** Key-level quota summary shown right under the "Connected with your API
 * key" line — surfaces the model closest to exhaustion among everything
 * we've actually captured real usage for under this key. Never a fabricated
 * account-wide number: if `usage.worst` is missing a limit, we just don't
 * render that half of the bar. */
const KeyUsageSummary: React.FC<{ usage: ProviderUsage }> = ({ usage }) => {
  const worst = usage.worst;
  if (!worst) return null;
  const hasTokenData = worst.limitTokens != null;
  const remaining = worst.remainingTokens ?? worst.remainingRequests ?? 0;
  const limit = worst.limitTokens ?? worst.limitRequests ?? 0;
  const pct = limit > 0 ? Math.max(0, Math.min(100, (remaining / limit) * 100)) : 100;

  return (
    <div
      className={`rounded-lg border px-3 py-2 space-y-1.5 ${
        usage.exhausted
          ? 'bg-[#4B1113]/30 border-[#F48771]/40'
          : 'bg-[#0D1117] border-[#30363D]'
      }`}
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-gray-300">
          <Gauge className={`w-3.5 h-3.5 ${usage.exhausted ? 'text-[#F48771]' : 'text-indigo-400'}`} />
          Key quota (closest to limit: <span className="font-mono text-gray-200">{worst.model}</span>)
        </span>
        <span className={`font-mono ${usage.exhausted ? 'text-[#F48771] font-bold' : 'text-gray-400'}`}>
          {hasTokenData
            ? `${formatTokenCount(remaining)} / ${formatTokenCount(limit)} tokens left`
            : `${remaining} / ${limit} requests left`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            usage.exhausted ? 'bg-[#F48771]' : pct < 20 ? 'bg-amber-500' : 'bg-green-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {usage.exhausted && (
        <p className="text-[10px] text-[#F48771] flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          This key is out of quota{worst.resetTokensSeconds ? ` — resets in ~${Math.ceil(worst.resetTokensSeconds / 60)}m` : ''}.
        </p>
      )}
    </div>
  );
};

const LiveModelCard: React.FC<{
  model: LiveModelInfo;
  usage?: ModelUsage;
  isActive: boolean;
  saving: boolean;
  onSelect: () => void;
}> = ({ model, usage, isActive, saving, onSelect }) => {
  const hasTokenData = usage?.limitTokens != null;
  const remaining = usage?.remainingTokens ?? usage?.remainingRequests ?? null;
  const limit = usage?.limitTokens ?? usage?.limitRequests ?? null;
  const usagePct = limit && limit > 0 ? Math.max(0, Math.min(100, ((remaining ?? 0) / limit) * 100)) : null;

  return (
    <div
      onClick={onSelect}
      className={`group rounded-lg border p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 ${
        isActive
          ? 'bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-950/30'
          : 'bg-[#0D1117] border-[#30363D] hover:border-gray-500 hover:bg-[#161B22]'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`w-2 h-2 rounded-full shrink-0 ${model.free ? 'bg-green-500' : 'bg-amber-500'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-bold text-white font-mono truncate">{model.name}</h4>
            {isActive && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-300 border border-green-500/40 shrink-0">
                ACTIVE
              </span>
            )}
            {usage?.exhausted && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#4B1113]/40 text-[#F48771] border border-[#F48771]/40 shrink-0 flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" /> QUOTA EXHAUSTED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {model.contextWindow != null && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Layers className="w-2.5 h-2.5" />
                {formatContextWindow(model.contextWindow)}
              </span>
            )}
            {model.pricing && <p className="text-[10px] text-gray-500">{model.pricing}</p>}
          </div>
          {/* Real usage — only shown once this model has actually been
              called, since that's the only way any provider reports it. */}
          {usagePct != null && (
            <div className="flex items-center gap-2 mt-1.5 max-w-xs">
              <div className="h-1 flex-1 rounded-full bg-[#21262D] overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    usage?.exhausted ? 'bg-[#F48771]' : usagePct < 20 ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <span className="text-[9px] text-gray-500 font-mono whitespace-nowrap">
                {hasTokenData ? `${formatTokenCount(remaining ?? 0)}/${formatTokenCount(limit ?? 0)} tok` : `${remaining}/${limit} req`}
              </span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        disabled={saving}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0 ${
          isActive
            ? 'bg-green-600 text-white'
            : 'bg-[#21262D] hover:bg-indigo-600 text-gray-200 hover:text-white border border-[#30363D]'
        }`}
      >
        {saving && isActive ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isActive ? (
          <>
            <Check className="w-3.5 h-3.5" /> <span>Active</span>
          </>
        ) : (
          <span>Select</span>
        )}
      </button>
    </div>
  );
};
