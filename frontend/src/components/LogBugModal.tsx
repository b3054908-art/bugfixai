import React, { useState } from 'react';
import { X, Sparkles, Bug as BugIcon } from 'lucide-react';
import { Bug as BugType, SeverityLevel } from '../types';

interface LogBugModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBug: (bug: BugType) => void | Promise<void>;
}

export const LogBugModal: React.FC<LogBugModalProps> = ({ isOpen, onClose, onAddBug }) => {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>('High');
  const [language, setLanguage] = useState('TypeScript');
  const [component, setComponent] = useState('Auth Middleware');
  const [tags, setTags] = useState('#auth #jwt');
  const [stackTrace, setStackTrace] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newBug: BugType = {
      id: `bug-${Date.now()}`,
      code: `BUG-0${Math.floor(Math.random() * 90 + 10)}`,
      title,
      tags: tags.split(' ').filter(t => t.startsWith('#')),
      severity,
      status: 'Open',
      aiStatus: 'Pending',
      language,
      component,
      loggedDate: new Date().toISOString().split('T')[0],
      updatedDate: new Date().toISOString().split('T')[0],
      stackTrace: stackTrace || undefined,
      fixSuggestion: {
        model: 'GPT-4o',
        confidence: 92,
        lines: 5,
        estTime: '10m',
        status: 'Ready',
        explanation: 'AI analysis suggests adding null validations and updating error handling wrapper.',
        diffSnippet: `@@ -1,3 +1,5 @@\n+ if (!input) return null;\n  return process(input);`
      }
    };

    onAddBug(newBug);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#0D1117] border border-[#30363D] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-[#30363D] flex items-center justify-between bg-[#161B22]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white">
              <BugIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Log New Bug</h2>
              <p className="text-[11px] text-gray-400">Trigger automated AST reproduction and AI triage</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#21262D] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          <div>
            <label className="block font-semibold text-gray-300 mb-1">
              Bug Title / Issue Description *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Unhandled Promise rejection in Stripe webhook payload dispatcher"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#161B22] border border-[#30363D] text-gray-200 focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-300 mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                className="w-full px-3 py-2 rounded-md bg-[#161B22] border border-[#30363D] text-gray-200 focus:outline-none text-xs"
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-300 mb-1">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-[#161B22] border border-[#30363D] text-gray-200 focus:outline-none text-xs"
              >
                <option value="TypeScript">TypeScript</option>
                <option value="Python">Python</option>
                <option value="Node.js">Node.js</option>
                <option value="PostgreSQL">PostgreSQL</option>
                <option value="Docker">Docker</option>
                <option value="React">React</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-300 mb-1">Component</label>
              <input
                type="text"
                value={component}
                onChange={(e) => setComponent(e.target.value)}
                placeholder="e.g. Auth Middleware"
                className="w-full px-3 py-2 rounded-md bg-[#161B22] border border-[#30363D] text-gray-200 focus:outline-none text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-300 mb-1">Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="#auth #jwt"
                className="w-full px-3 py-2 rounded-md bg-[#161B22] border border-[#30363D] text-gray-200 focus:outline-none text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-300 mb-1">
              Stack Trace / Error Logs (optional)
            </label>
            <textarea
              rows={4}
              value={stackTrace}
              onChange={(e) => setStackTrace(e.target.value)}
              placeholder="Paste terminal exception or test output..."
              className="w-full px-3 py-2 rounded-md bg-[#161B22] border border-[#30363D] font-mono text-gray-200 focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md bg-[#161B22] hover:bg-[#21262D] text-gray-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Log & Auto-Triage</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
