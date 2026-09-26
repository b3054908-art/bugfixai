import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from 'xterm';
import { API_BASE_URL, getAuthToken } from '../api/client';
import { getProject } from '../api/Project';
import 'xterm/css/xterm.css';

interface RealTerminalPaneProps {
  projectId?: string | null;
}

function getWorkspaceTerminalSocketUrl(workspaceId: string): string {
  const token = getAuthToken();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = API_BASE_URL ? API_BASE_URL.replace(/^http/, 'ws') : `${protocol}//${window.location.host}`;
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  return `${base}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/terminal?${params.toString()}`;
}

export function RealTerminalPane({ projectId }: RealTerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'idle'>('idle');

  useEffect(() => {
    if (!projectId || !containerRef.current) return;

    let cancelled = false;

    const cleanup = () => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      socketRef.current = null;
      const term = termRef.current;
      if (term) {
        term.dispose();
      }
      termRef.current = null;
    };

    const connect = async () => {
      try {
        setStatus('connecting');
        const project = await getProject(projectId);
        const workspaceId = project.workspace?.id;
        if (cancelled || !workspaceId || !containerRef.current) return;

        const terminal = new Terminal({
          cursorBlink: true,
          convertEol: true,
          rows: 28,
          cols: 120,
          fontSize: 12,
          fontFamily: 'Menlo, Monaco, Consolas, monospace',
          theme: {
            background: '#1E1E1E',
            foreground: '#CCCCCC',
            cursor: '#FFFFFF',
            black: '#000000',
            red: '#F48771',
            green: '#4EC9B0',
            yellow: '#CCA700',
            blue: '#569CD6',
            magenta: '#C586C0',
            cyan: '#9CDCFE',
            white: '#D4D4D4',
          },
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);
        fitAddon.fit();
        terminal.focus();
        termRef.current = terminal;

        const socket = new WebSocket(getWorkspaceTerminalSocketUrl(workspaceId));
        socketRef.current = socket;

        socket.onopen = () => {
          if (cancelled) return;
          setStatus('connected');
          socket.send(JSON.stringify({ type: 'resize', rows: terminal.rows, cols: terminal.cols }));
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as { type?: string; data?: string };
            if (message.type === 'output' && message.data) {
              terminal.write(message.data);
            }
          } catch {
            terminal.write(event.data);
          }
        };

        socket.onerror = () => {
          if (!cancelled) setStatus('error');
        };

        socket.onclose = () => {
          if (!cancelled) {
            setStatus('idle');
          }
          cleanup();
        };

        terminal.onData((data) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'input', data }));
          }
        });

        terminal.onResize(({ cols, rows }) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        });

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);
        return () => {
          window.removeEventListener('resize', handleResize);
          cleanup();
        };
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    const cleanupPromise = connect();

    return () => {
      cancelled = true;
      cleanup();
      void cleanupPromise;
    };
  }, [projectId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1E1E1E]">
      <div className="flex items-center justify-between border-b border-[#2D2D2D] px-2 py-1.5 text-[10px] uppercase tracking-wide text-[#858585]">
        <span>Persistent Terminal</span>
        <span className={status === 'connected' ? 'text-[#4EC9B0]' : status === 'error' ? 'text-[#F48771]' : 'text-[#858585]'}>
          {status}
        </span>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
