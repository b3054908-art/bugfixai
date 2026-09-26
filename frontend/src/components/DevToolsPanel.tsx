import { Activity, FileCheck, Send, ShieldCheck, Sliders, Terminal, X } from 'lucide-react';
import React, { useState } from 'react';

export type DevToolsTab = 'console' | 'network' | 'openapi' | 'security';

interface ConsoleLog {
  id: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  timestamp: string;
  sample?: boolean;
}

interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status: number | null;
  statusText: string;
  time: string;
  size: string;
  timestamp: string;
  sample?: boolean;
}

interface DevToolsPanelProps {
  previewUrl: string;
}

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * DevTools drawer for the embedded preview window: Console / Network /
 * OpenAPI Spec / Security & Headers tabs, plus a Mutate Request composer.
 *
 * Ported from the BugFixAI design reference, with one deliberate change:
 * that reference simulates everything (hardcoded logs, Math.random()
 * latency, a fake "api-gateway" backend). Here, "Mutate Request" is real —
 * it sends an actual fetch() to your live preview container and the
 * Network tab reflects the real status/time. Console and Security &
 * Headers are still sample/placeholder (clearly labeled) because making
 * those real needs a backend endpoint (streaming `docker logs`, and a
 * server-side header inspector to get around CORS) that hasn't been built
 * yet — that's the next phase.
 */
export const DevToolsPanel: React.FC<DevToolsPanelProps> = ({ previewUrl }) => {
  const [activeTab, setActiveTab] = useState<DevToolsTab>('console');
  const [consoleLogs] = useState<ConsoleLog[]>([
    { id: 'c1', level: 'info', message: 'Preview container is running. Live log streaming from this container isn\u2019t wired up yet.', timestamp: now(), sample: true },
    { id: 'c2', level: 'info', message: 'Next backend step: a GET /preview/logs endpoint (docker logs -f), same pattern as the pipeline\u2019s Raw Logs tab.', timestamp: now(), sample: true },
  ]);
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);

  const [showMutate, setShowMutate] = useState(false);
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
  const [path, setPath] = useState('/');
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([{ key: 'Content-Type', value: 'application/json' }]);
  const [body, setBody] = useState('{\n  \n}');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<{ status: number; statusText: string; time: string; body: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [openApiResult, setOpenApiResult] = useState<{ ok: boolean; message: string; pathCount?: number; title?: string } | null>(null);
  const [openApiLoading, setOpenApiLoading] = useState(false);

  const [headerInspect, setHeaderInspect] = useState<{ ok: boolean; entries: [string, string][]; note: string } | null>(null);
  const [headerLoading, setHeaderLoading] = useState(false);

  const targetUrl = () => {
    const base = previewUrl.replace(/\/$/, '');
    return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  };

  const handleSend = async () => {
    setSending(true);
    setSendError(null);
    setResponse(null);
    const url = targetUrl();
    const start = performance.now();
    try {
      const headerObj: Record<string, string> = {};
      headers.forEach((h) => { if (h.key) headerObj[h.key] = h.value; });
      const init: RequestInit = { method, headers: headerObj };
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        init.body = body;
      }
      const res = await fetch(url, init);
      const elapsed = `${(performance.now() - start).toFixed(1)}ms`;
      const text = await res.text();
      setResponse({ status: res.status, statusText: res.statusText, time: elapsed, body: text.slice(0, 4000) });
      setNetworkRequests((prev) => [
        {
          id: `req-${Date.now()}`,
          method,
          url,
          status: res.status,
          statusText: res.statusText,
          time: elapsed,
          size: `${new Blob([text]).size} B`,
          timestamp: now(),
        },
        ...prev,
      ]);
    } catch (err) {
      const elapsed = `${(performance.now() - start).toFixed(1)}ms`;
      const message = err instanceof Error ? err.message : 'Request failed';
      setSendError(message);
      setNetworkRequests((prev) => [
        { id: `req-${Date.now()}`, method, url, status: null, statusText: 'Failed', time: elapsed, size: '\u2014', timestamp: now() },
        ...prev,
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleFetchOpenApiSpec = async () => {
    setOpenApiLoading(true);
    setOpenApiResult(null);
    const base = previewUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/openapi.json`);
      if (!res.ok) {
        setOpenApiResult({ ok: false, message: `No spec found at /openapi.json (HTTP ${res.status}). This app may not expose one, or it's served from a different path.` });
        return;
      }
      const spec = await res.json();
      const pathCount = spec.paths ? Object.keys(spec.paths).length : 0;
      setOpenApiResult({ ok: true, message: 'Live spec fetched successfully.', pathCount, title: spec.info?.title });
    } catch (err) {
      setOpenApiResult({ ok: false, message: err instanceof Error ? `Could not reach the preview app: ${err.message}` : 'Could not reach the preview app.' });
    } finally {
      setOpenApiLoading(false);
    }
  };

  const handleInspectHeaders = async () => {
    setHeaderLoading(true);
    setHeaderInspect(null);
    try {
      const res = await fetch(previewUrl, { method: 'GET' });
      const entries: [string, string][] = [];
      res.headers.forEach((value, key) => entries.push([key, value]));
      setHeaderInspect({
        ok: true,
        entries,
        note: 'Browsers only expose a safelisted subset of response headers to cross-origin fetch() unless the server sends Access-Control-Expose-Headers. Missing a security header below doesn\u2019t necessarily mean the app doesn\u2019t send it \u2014 it may just not be exposed to this check yet.',
      });
    } catch (err) {
      setHeaderInspect({ ok: false, entries: [], note: err instanceof Error ? err.message : 'Could not reach the preview app.' });
    } finally {
      setHeaderLoading(false);
    }
  };

  return (
    <div className="relative h-[220px] border-t border-[#30363D] bg-[#0D1117] flex flex-col shrink-0 text-xs">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161B22] border-b border-[#30363D] shrink-0 font-mono text-[11px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('console')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'console' ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <Terminal className="w-3 h-3" />
            <span>Console ({consoleLogs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('network')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'network' ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>Network ({networkRequests.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('openapi')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'openapi' ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <FileCheck className="w-3 h-3 text-indigo-400" />
            <span>OpenAPI Spec</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'security' ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
          >
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Security & Headers</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setShowMutate(true); setResponse(null); setSendError(null); }}
          className="px-2 py-0.5 rounded bg-[#21262D] hover:bg-[#30363D] text-indigo-300 hover:text-white font-mono cursor-pointer flex items-center gap-1"
        >
          <Sliders className="w-2.5 h-2.5" />
          <span>+ Mutate Request</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
        {activeTab === 'console' && (
          <div className="space-y-1">
            {consoleLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 py-1 px-1.5 rounded hover:bg-[#161B22]">
                <span className="text-gray-600 select-none text-[10px] shrink-0">{log.timestamp}</span>
                {log.level === 'info' && <span className="text-cyan-400 shrink-0">[INFO]</span>}
                {log.level === 'success' && <span className="text-green-400 shrink-0">[SUCCESS]</span>}
                {log.level === 'warn' && <span className="text-amber-400 shrink-0">[WARN]</span>}
                {log.level === 'error' && <span className="text-red-400 shrink-0">[ERROR]</span>}
                <span className="text-gray-300">{log.message}</span>
                {log.sample && <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[9px]">sample</span>}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'network' && (
          networkRequests.length === 0 ? (
            <div className="text-gray-500 p-2">No requests yet. Use + Mutate Request to send one against the live preview.</div>
          ) : (
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-[#30363D] text-gray-500">
                  <th className="py-1 px-2">Method</th>
                  <th className="py-1 px-2">URL</th>
                  <th className="py-1 px-2">Status</th>
                  <th className="py-1 px-2">Time</th>
                  <th className="py-1 px-2">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262D]">
                {networkRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-[#161B22]">
                    <td className="py-1 px-2 font-bold text-indigo-400">{req.method}</td>
                    <td className="py-1 px-2 text-gray-300 truncate max-w-[260px]">{req.url}</td>
                    <td className={`py-1 px-2 ${req.status && req.status < 400 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {req.status ?? '\u2014'} {req.statusText}
                    </td>
                    <td className="py-1 px-2 text-gray-400">{req.time}</td>
                    <td className="py-1 px-2 text-gray-400">{req.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'openapi' && (
          <div className="p-2 space-y-2">
            <button
              type="button"
              onClick={handleFetchOpenApiSpec}
              disabled={openApiLoading}
              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-[10px] cursor-pointer"
            >
              {openApiLoading ? 'Fetching\u2026' : 'Fetch live spec from /openapi.json'}
            </button>
            {openApiResult && (
              <div className={`p-2.5 rounded border text-[11px] ${openApiResult.ok ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/20 border-amber-500/30 text-amber-300'}`}>
                <div>{openApiResult.message}</div>
                {openApiResult.ok && (
                  <div className="text-gray-300 mt-1">{openApiResult.title ?? 'Untitled spec'} \u2014 {openApiResult.pathCount} path(s)</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="p-2 space-y-2">
            <button
              type="button"
              onClick={handleInspectHeaders}
              disabled={headerLoading}
              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-[10px] cursor-pointer"
            >
              {headerLoading ? 'Inspecting\u2026' : 'Inspect response headers'}
            </button>
            {headerInspect && (
              <div className="space-y-2">
                <p className="text-[10px] text-gray-500">{headerInspect.note}</p>
                {headerInspect.entries.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {headerInspect.entries.map(([key, value]) => (
                      <div key={key} className="p-2 rounded bg-[#161B22] border border-[#30363D]">
                        <span className="text-gray-500 block text-[10px]">{key}</span>
                        <span className="font-semibold text-white text-[11px] break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-[11px]">No headers were exposed to this check.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mutate Request modal */}
      {showMutate && (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-4 z-10">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[90%]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363D] bg-[#0D1117]">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-sm text-white font-mono">Mutate Request</span>
              </div>
              <button type="button" onClick={() => setShowMutate(false)} className="p-1 rounded hover:bg-[#21262D] text-gray-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto text-xs font-mono">
              <div className="space-y-1">
                <label className="text-gray-400 font-semibold">Method &amp; path (sent to the live preview)</label>
                <div className="flex items-center gap-2">
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as typeof method)}
                    className="bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-indigo-300 font-bold"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="/api/v1/health"
                    className="flex-1 bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-gray-200"
                  />
                </div>
                <p className="text-[10px] text-gray-500">{targetUrl()}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-gray-400 font-semibold">Headers ({headers.length})</label>
                  <button type="button" onClick={() => setHeaders((prev) => [...prev, { key: '', value: '' }])} className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer">
                    + Add Header
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                  {headers.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Header Key"
                        value={h.key}
                        onChange={(e) => { const v = e.target.value; setHeaders((prev) => prev.map((row, i) => (i === idx ? { ...row, key: v } : row))); }}
                        className="w-1/3 bg-[#0D1117] border border-[#30363D] rounded px-2 py-1 text-gray-300"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={h.value}
                        onChange={(e) => { const v = e.target.value; setHeaders((prev) => prev.map((row, i) => (i === idx ? { ...row, value: v } : row))); }}
                        className="flex-1 bg-[#0D1117] border border-[#30363D] rounded px-2 py-1 text-purple-300"
                      />
                      <button type="button" onClick={() => setHeaders((prev) => prev.filter((_, i) => i !== idx))} className="p-1 text-gray-500 hover:text-red-400 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
                <div className="space-y-1">
                  <label className="text-gray-400 font-semibold">Request Body</label>
                  <textarea
                    rows={4}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full bg-[#0D1117] border border-[#30363D] rounded p-2.5 text-indigo-300 font-mono text-[11px]"
                  />
                </div>
              )}

              {sendError && (
                <div className="p-2.5 rounded bg-rose-950/30 border border-rose-500/30 text-rose-300 text-[11px]">
                  {sendError} \u2014 likely CORS (the preview app doesn't allow cross-origin requests from this dashboard) or the app isn't reachable.
                </div>
              )}
              {response && (
                <div className="space-y-1">
                  <div className={`text-[11px] font-semibold ${response.status < 400 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {response.status} {response.statusText} \u00b7 {response.time}
                  </div>
                  <pre className="p-2.5 rounded bg-[#0B0E14] border border-[#30363D] text-[10px] text-gray-300 overflow-x-auto max-h-[160px]">{response.body || '(empty body)'}</pre>
                </div>
              )}
            </div>
            <div className="p-3 bg-[#0D1117] border-t border-[#30363D] flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowMutate(false)} className="px-3 py-1.5 rounded text-gray-400 hover:text-white cursor-pointer">
                Close
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold font-mono flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sending ? 'Sending\u2026' : 'Send Request'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
