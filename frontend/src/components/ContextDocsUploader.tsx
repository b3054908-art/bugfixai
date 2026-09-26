import {
  AlignLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Eye,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { ContextDoc } from '../types';

interface ContextDocsUploaderProps {
  docs: ContextDoc[];
  onAddDoc: (doc: ContextDoc) => void;
  onRemoveDoc: (id: string) => void;
  onClearAllDocs: () => void;
  customInstructions: string;
  onCustomInstructionsChange: (instructions: string) => void;
}

export const ContextDocsUploader: React.FC<ContextDocsUploaderProps> = ({
  docs,
  onAddDoc,
  onRemoveDoc,
  onClearAllDocs,
  customInstructions,
  onCustomInstructionsChange
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<ContextDoc | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getDocIcon = (type: ContextDoc['type']) => {
    switch (type) {
      case 'openapi':
        return <FileCode className="w-4 h-4 text-emerald-400" />;
      case 'markdown':
        return <BookOpen className="w-4 h-4 text-sky-400" />;
      case 'json':
        return <FileJson className="w-4 h-4 text-amber-400" />;
      case 'schema':
        return <FileSpreadsheet className="w-4 h-4 text-purple-400" />;
      case 'pdf':
        return <FileText className="w-4 h-4 text-red-400" />;
      case 'text':
      default:
        return <FileText className="w-4 h-4 text-indigo-400" />;
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    ingestFiles(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /** Builds a local placeholder doc immediately for responsive UI, keeping
   * the raw File so the real upload (handleStartAnalysis, once a project
   * id exists) can send it to the backend for real parsing/storage. PDFs
   * are never read with FileReader.readAsText -- that produces garbled
   * binary-as-text; the real extracted text comes back from the server
   * after upload and replaces this placeholder's `content`. */
  const ingestFiles = (files: File[]) => {
    files.forEach((file: File) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let type: ContextDoc['type'] = 'text';
      if (extension === 'md' || extension === 'markdown') type = 'markdown';
      else if (extension === 'json') type = 'json';
      else if (extension === 'yaml' || extension === 'yml') type = 'openapi';
      else if (extension === 'pdf') type = 'pdf';
      else if (extension === 'prisma' || extension === 'sql') type = 'schema';

      const baseDoc: ContextDoc = {
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type,
        content: '',
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        description: `Uploaded ${type.toUpperCase()} context file`,
        file
      };

      if (type === 'pdf') {
        // Real text is extracted server-side (pypdf) once this uploads.
        onAddDoc(baseDoc);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = (event.target?.result as string) || '';
        onAddDoc({ ...baseDoc, content });
      };
      reader.onerror = () => onAddDoc(baseDoc);
      reader.readAsText(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    ingestFiles(Array.from(files));
  };

  return (
    <div id="context-docs-uploader-section" className="rounded-lg bg-[#161B22] border border-[#30363D] p-4 space-y-3 transition-all">
      
      {/* 1. Header & Collapse Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <BookOpen className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                Context Documents & Guidelines
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                Optional
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Attach API specs, PRDs, or architecture notes to ground AI patch generation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {docs.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {docs.length} attached
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#21262D] transition-colors cursor-pointer"
            title={isExpanded ? "Collapse context docs" : "Expand context docs"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. Expanded Body */}
      {isExpanded && (
        <div className="space-y-3 pt-1 border-t border-[#30363D]/60">
          
          {/* Dropzone for Context Docs */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-md p-3.5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 ${
              isDragging 
                ? 'border-indigo-500 bg-indigo-500/10' 
                : 'border-[#30363D] hover:border-indigo-500/50 bg-[#0D1117]/60 hover:bg-[#0D1117]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept=".md,.txt,.json,.yaml,.yml,.pdf,.prisma,.sql"
              className="hidden"
            />
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>Click or drag context files here</span>
            </div>
            <div className="text-[10px] text-gray-500 flex items-center gap-1.5 flex-wrap justify-center">
              <span>Supports:</span>
              <span className="text-gray-400 font-mono">.md</span>
              <span>·</span>
              <span className="text-gray-400 font-mono">.yaml (OpenAPI)</span>
              <span>·</span>
              <span className="text-gray-400 font-mono">.json</span>
              <span>·</span>
              <span className="text-gray-400 font-mono">.txt</span>
              <span>·</span>
              <span className="text-gray-400 font-mono">.pdf</span>
            </div>
          </div>

          {/* Attached Files List */}
          {docs.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <span>Attached Documents ({docs.length})</span>
                <button
                  type="button"
                  onClick={onClearAllDocs}
                  className="text-red-400 hover:text-red-300 lowercase text-[10px] hover:underline cursor-pointer"
                >
                  Clear all
                </button>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2 rounded bg-[#0D1117] border border-[#30363D] text-xs transition-colors hover:border-indigo-500/30 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1 rounded bg-[#161B22] border border-[#30363D] shrink-0">
                        {getDocIcon(doc.type)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-gray-200 font-semibold truncate text-[11px]">
                          {doc.name}
                        </div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-2">
                          <span>{doc.size}</span>
                          <span>·</span>
                          <span className="uppercase text-gray-400 font-mono text-[9px]">{doc.type}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {doc.content && (
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="p-1 text-gray-400 hover:text-indigo-400 hover:bg-[#21262D] rounded transition-colors cursor-pointer"
                          title="Preview Document Content"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveDoc(doc.id)}
                        className="p-1 text-gray-400 hover:text-red-400 hover:bg-[#21262D] rounded transition-colors cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional Prompt Constraints / Instructions */}
          <div className="space-y-1 pt-1">
            <label className="block text-[11px] font-semibold text-gray-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <AlignLeft className="w-3 h-3 text-indigo-400" />
                <span>Custom AI Fix Constraints</span>
              </span>
              <span className="text-[10px] text-gray-500 font-normal">optional prompt rule</span>
            </label>
            <textarea
              rows={2}
              value={customInstructions}
              onChange={(e) => onCustomInstructionsChange(e.target.value)}
              placeholder="e.g. Do not modify public auth endpoints. Enforce backward-compatible JWT claims..."
              className="w-full px-3 py-1.5 rounded bg-[#0D1117] border border-[#30363D] text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono resize-none leading-relaxed"
            />
          </div>

        </div>
      )}

      {/* Preview Modal for Context Doc */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#0D1117] border border-[#30363D] rounded-lg max-w-xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363D] bg-[#161B22] rounded-t-lg">
              <div className="flex items-center gap-2">
                {getDocIcon(previewDoc.type)}
                <div>
                  <h4 className="text-xs font-bold text-gray-200 font-mono">{previewDoc.name}</h4>
                  <p className="text-[10px] text-gray-400">{previewDoc.size} · {previewDoc.description}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#21262D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto font-mono text-xs text-gray-300 bg-[#0B0E14] whitespace-pre-wrap leading-relaxed max-h-[60vh]">
              {previewDoc.content || 'No content preview available.'}
            </div>
            <div className="flex items-center justify-end px-4 py-2.5 border-t border-[#30363D] bg-[#161B22] rounded-b-lg">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
