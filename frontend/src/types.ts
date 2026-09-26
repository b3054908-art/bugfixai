export type NavigationTab = 'dashboard' | 'bugs' | 'ai-fix-history' | 'workspace' | 'analytics' | 'docs' | 'settings';

export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type BugStatus = 'Open' | 'In Review' | 'Fixed' | 'Closed' | 'AI Suggested' | 'Applying Fix';
export type AIStatus = 'Pending' | 'Ready' | 'Applied';
export type AIModel = string;

export interface Bug {
  id: string;
  code: string;
  title: string;
  tags: string[];
  severity: SeverityLevel;
  status: BugStatus;
  aiStatus: AIStatus;
  language: string;
  component: string;
  loggedDate: string;
  updatedDate: string;
  description?: string;
  stackTrace?: string;
  filePath?: string;
  lineNumber?: number;
  fixSuggestion?: {
    model: AIModel;
    confidence: number;
    explanation: string;
    diffSnippet: string;
    status: 'Ready' | 'Applied' | 'Superseded';
    lines: number;
    estTime: string;
  };
}

export interface AIFixHistoryItem {
  id: string;
  bugId: string;
  bugTitle: string;
  patchSummary: string;
  date: string;
  model: AIModel;
  confidence: number;
  status: 'Ready' | 'Applied' | 'Superseded';
  lines: number;
  estTime: string;
  fullDiff?: string;
  codeContext?: string;
}

export interface FixSummary {
  projectCount: number;
  dateSpanDays: number;
  regressionsFound: number;
  acceptanceRate: number;
  estimatedDollarsSaved: number;
}

export interface PhaseSubprocess {
  id: string;
  name: string;
  category?: string;
  description?: string;
  completed: boolean;
  status?: 'completed' | 'running' | 'pending' | 'failed';
  metrics?: Record<string, string>;
}

export interface SecurityCheck {
  id: string;
  title: string;
  description: string;
  status: 'passed' | 'failed' | 'warning' | 'info';
  metrics: Record<string, string>;
}

export interface PipelinePhase {
  id: number;
  name: string;
  description: string;
  duration?: string;
  status: 'completed' | 'running' | 'pending' | 'failed';
  subtasks?: { name: string; completed: boolean }[];
  subprocesses?: PhaseSubprocess[];
  validationStatus?: 'idle' | 'running' | 'passed' | 'failed' | 're_analyzing';
  validationReport?: {
    testPassRate?: string;
    totalTests?: number;
    passedTests?: number;
    failedTests?: number;
    regressionFound?: boolean;
    recommendation?: string;
    summary?: string;
    diffSnippet?: string;
    timestamp?: string;
    cycleCount?: number;
    securityChecks?: SecurityCheck[];
  };
}

// --- Pipeline v2 (10-phase architecture, see PIPELINE_V2_ARCHITECTURE.md) ---
// These types are UI-scaffold-only for now: the components that use them
// (PreviewCheckpointModal, PromptPad, AttemptDiffViewer, AttemptTimeline)
// run on local/sample state until the backend loop controller, FixAttempt
// table, and PreviewCheckpoint table (architecture doc \u00a73) are built.

export type AnalysisRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'AWAITING_REVIEW'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_HUMAN_REVIEW';

export interface FixAttempt {
  id: string;
  bugId: string;
  analysisRunId: string;
  attemptNumber: number; // 1, 2, 3...
  mode: 'automatic' | 'manual';
  triggerNote?: string | null; // the prompt pad text, if manual
  triggerFileEdit?: boolean; // true if triggered by a direct file edit
  diffSnippet: string;
  previousAttemptId?: string | null; // for old-vs-new diff view
  resultStatus: 'pending' | 'pass' | 'fail';
  errorFingerprint?: string | null; // normalized hash, for same-error detection
  rawErrorOutput?: string | null;
  createdAt: string;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface PreviewCheckpointPromptMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
}

export interface PreviewCheckpointFileEdit {
  filePath: string;
  diffSnippet: string;
  detectedAt: string;
  newContent?: string;
}

export interface PreviewCheckpoint {
  id: string;
  analysisRunId: string;
  previewSessionId?: string;
  status: 'awaiting_decision' | 'previewing' | 'resumed' | 'rejected' | 'timeout';
  promptMessages: PreviewCheckpointPromptMessage[];
  fileEditsDetected: PreviewCheckpointFileEdit[];
  createdAt: string;
  resumedAt?: string | null;
}

export interface LogLine {
  id: string;
  timestamp: string;
  level: 'INFO' | 'PASS' | 'WARN' | 'ERROR';
  category: string;
  message: string;
  phaseNumber?: number;
}

export interface WorkspaceFile {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: WorkspaceFile[];
  content?: string;
  language?: string;
  hasBug?: boolean;
  bugId?: string;
}

export interface ContextDoc {
  id: string;
  name: string;
  size: string;
  type: 'markdown' | 'openapi' | 'pdf' | 'json' | 'text' | 'schema';
  content?: string;
  uploadedAt: string;
  description?: string;
  /** Present only for a doc picked before a project exists yet (Phase 1's
   * pre-upload screen) -- holds the raw File so handleStartAnalysis can
   * actually upload it once a real project id exists. Never sent to the
   * backend itself (see api/contextDocs.ts, which sends `file` as
   * multipart form data, not this field). Cleared once uploaded. */
  file?: File;
}

export type NotificationType = 'critical' | 'fix' | 'security' | 'system' | 'info';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: NotificationType;
  bugId?: string;
  actionTab?: NavigationTab;
  codeSnippet?: string;
  downloadAnalysisRunId?: string;
  downloadProjectName?: string;
}
