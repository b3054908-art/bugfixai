import { AlertTriangle, Bug, ExternalLink, Loader2, Lock, RotateCw, Sparkles, Terminal, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getPreviewState, PreviewBuild, PreviewFix, startPreview, stopPreview } from '../api/preview';
import { DevToolsPanel } from './DevToolsPanel';

interface EmbeddedBrowserPreviewProps {
  projectId: string;
  projectName: string;
  previewCommand: { command: string; port: number };
  onClose: () => void;
}

/**
 * A floating, in-dashboard "browser window" for Phase 5's Live Application
 * Preview. Unlike the old behavior (window.open into a new tab), this opens
 * the running app inline and lets the person flip between the project's
 * "Original (Buggy)" and "AI Patched" build without leaving the dashboard.
 *
 * The two builds are real: switching tabs calls the backend, which
 * applies/reverts the project's actual FixProposal records against the one
 * real workspace and restarts the preview container on top of it — the same
 * apply/revert path the Fixes tab uses, just driven from here.
 */
export const EmbeddedBrowserPreview: React.FC<EmbeddedBrowserPreviewProps> = ({
  projectId,
  projectName,
  previewCommand,
  onClose,
}) => {
  const [build, setBuild] = useState<PreviewBuild>('original');
  const [fixes, setFixes] = useState<PreviewFix[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const startedOnce = useRef(false);

  const boot = async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await getPreviewState(projectId);
      setFixes(state.fixes);
      const initialBuild = state.build;
      setBuild(initialBuild);
      const res = await startPreview(projectId, initialBuild);
      setUrl(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start preview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startedOnce.current) return;
    startedOnce.current = true;
    boot();
    return () => {
      stopPreview(projectId).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleSwitchBuild = async (next: PreviewBuild) => {
    if (next === build || switching) return;
    setSwitching(true);
    setError(null);
    setIframeLoaded(false);
    try {
      const res = await startPreview(projectId, next);
      setBuild(res.build);
      setUrl(res.url);
      const state = await getPreviewState(projectId);
      setFixes(state.fixes);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not switch build.');
    } finally {
      setSwitching(false);
    }
  };

  const handleRefresh = () => {
    setIframeLoaded(false);
    setReloadKey((k) => k + 1);
  };

  const handleClose = () => {
    stopPreview(projectId).catch(() => undefined);
    onClose();
  };

  const patchedFiles = fixes.filter((f) => f.status === 'Applied' || build === 'patched');
  const patchedCount = fixes.length;
  const busy = loading || switching;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-8">
      <div className="w-full max-w-5xl h-full max-h-[720px] rounded-lg border border-[#30363D] bg-[#0D1117] shadow-2xl flex flex-col overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-3 px-3 py-2 bg-[#161B22] border-b border-[#30363D]">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-300 font-mono truncate min-w-0">
            <span className="truncate">{projectName}</span>
            <span className="text-gray-600">(:{previewCommand.port})</span>
            <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`} />
          </div>
          <div className="flex-1" />
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-[#21262D] text-gray-400 hover:text-gray-200 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => setShowDevTools((v) => !v)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
              showDevTools ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262D]'
            }`}
            title="Toggle DevTools"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>DevTools</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-[#21262D] text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
            title="Close preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Build tabs */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0D1117] border-b border-[#30363D]">
          <button
            type="button"
            onClick={() => handleSwitchBuild('original')}
            disabled={busy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
              build === 'original'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : 'bg-transparent border-[#30363D] text-gray-400 hover:text-gray-200'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>Original (Buggy)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchBuild('patched')}
            disabled={busy || patchedCount === 0}
            title={patchedCount === 0 ? 'No AI fix proposals available yet for this project' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
              build === 'patched'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-transparent border-[#30363D] text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Patched{patchedCount > 0 ? ` (${patchedCount} fix${patchedCount === 1 ? '' : 'es'})` : ''}</span>
          </button>
          {build === 'patched' && patchedFiles.length > 0 && (
            <span
              className="ml-1 px-2 py-1 rounded bg-[#161B22] border border-[#30363D] text-[10px] font-mono text-gray-400 truncate max-w-[220px]"
              title={patchedFiles.map((f) => f.file).join(', ')}
            >
              {patchedFiles[0].file}
              {patchedFiles.length > 1 ? ` +${patchedFiles.length - 1}` : ''}
            </span>
          )}
          <div className="flex-1" />
          {switching && (
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Switching build…
            </span>
          )}
        </div>

        {/* Address bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0D1117] border-b border-[#30363D]">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={busy || !url}
            className="p-1 rounded hover:bg-[#21262D] text-gray-400 hover:text-gray-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Reload"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161B22] border border-[#30363D] text-[11px] font-mono text-gray-300 truncate">
            <Lock className="w-3 h-3 text-gray-600 shrink-0" />
            <span className="truncate">{url ?? `http://localhost:${previewCommand.port}`}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 relative bg-white min-h-0">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0D1117] px-6 text-center">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
              <p className="text-xs text-rose-300 max-w-sm">{error}</p>
              <button
                type="button"
                onClick={boot}
                className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {(loading || switching || !iframeLoaded) && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#0D1117] text-gray-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{loading ? 'Starting preview container…' : switching ? 'Rebuilding with selected patches…' : 'Loading…'}</span>
                </div>
              )}
              {url && (
                <iframe
                  key={`${build}-${reloadKey}`}
                  src={url}
                  title={`${projectName} live preview`}
                  className="w-full h-full border-0 bg-white"
                  onLoad={() => setIframeLoaded(true)}
                  sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
                />
              )}
            </>
          )}
        </div>

        {/* Status footer */}
        <div className="flex items-center gap-3 px-3 py-1.5 bg-[#161B22] border-t border-[#30363D] text-[10px] text-gray-500 font-mono">
          <span>{previewCommand.command}</span>
          <span className="text-gray-700">|</span>
          <span>Build: {build === 'patched' ? 'AI Patched' : 'Baseline Buggy'}</span>
          <span className="text-gray-700">|</span>
          <span>Port {previewCommand.port}</span>
        </div>

        {showDevTools && url && <DevToolsPanel previewUrl={url} />}
      </div>
    </div>
  );
};
