import { Bug, AIFixHistoryItem, PipelinePhase, LogLine, WorkspaceFile, FixAttempt, PreviewCheckpoint } from '../types';

export const initialBugs: Bug[] = [
  {
    id: 'bug-1',
    code: 'BUG-006',
    title: 'API rate limiter not resetting per-minute bucket in Redis cluster',
    tags: ['#redis', '#rate-limiting'],
    severity: 'Critical',
    status: 'Open',
    aiStatus: 'Pending',
    language: 'TypeScript',
    component: 'Rate Limiter',
    loggedDate: '2026-08-12',
    updatedDate: '2026-08-12',
    filePath: 'src/services/rate_limiter.ts',
    lineNumber: 48,
    description: 'Redis cluster token bucket keys are missing the TTL expiration argument on pipeline MULTI/EXEC calls when cluster sharding triggers slot migration.',
    stackTrace: `Error: KeyExpirationMissing: TTL not propagated across Redis cluster slots
    at RedisCluster.multi (src/services/rate_limiter.ts:48:12)
    at RateLimiter.consume (src/services/rate_limiter.ts:62:7)`,
    fixSuggestion: {
      model: 'GPT-4o',
      confidence: 94,
      lines: 8,
      estTime: '12m',
      status: 'Ready',
      explanation: 'Add explicit EXPIRE in atomic Lua script instead of split pipelined commands.',
      diffSnippet: `@@ -48,7 +48,11 @@
- await redis.incr(key);
- await redis.expire(key, 60);
+ const luaScript = \`
+   local current = redis.call('incr', KEYS[1])
+   if tonumber(current) == 1 then
+     redis.call('expire', KEYS[1], ARGV[1])
+   end
+   return current
+ \`;
+ return await redis.eval(luaScript, 1, key, 60);`
    }
  },
  {
    id: 'bug-2',
    code: 'BUG-002',
    title: 'Race condition in WebSocket reconnection exponential backoff',
    tags: ['#websocket', '#concurrency'],
    severity: 'High',
    status: 'Open',
    aiStatus: 'Pending',
    language: 'JavaScript',
    component: 'WebSocket Client',
    loggedDate: '2026-08-11',
    updatedDate: '2026-08-11',
    filePath: 'src/services/websocket.js',
    lineNumber: 114,
    description: 'Simultaneous disconnect events trigger multiple concurrent backoff timeouts, leading to connection storms.',
    fixSuggestion: {
      model: 'GPT-4o',
      confidence: 91,
      lines: 6,
      estTime: '15m',
      status: 'Ready',
      explanation: 'Clear existing reconnection timeout handle before instantiating new retry cycle.',
      diffSnippet: `@@ -114,4 +114,8 @@
+ if (this.reconnectTimer) {
+   clearTimeout(this.reconnectTimer);
+   this.reconnectTimer = null;
+ }
  this.reconnectTimer = setTimeout(() => this.connect(), backoffMs);`
    }
  },
  {
    id: 'bug-3',
    code: 'BUG-001',
    title: 'Null pointer exception in user auth middleware on invalid JWT sub',
    tags: ['#auth', '#middleware'],
    severity: 'Critical',
    status: 'AI Suggested',
    aiStatus: 'Ready',
    language: 'TypeScript',
    component: 'Auth Middleware',
    loggedDate: '2026-08-10',
    updatedDate: '2026-08-12',
    filePath: 'src/app/auth.py',
    lineNumber: 76,
    description: 'When payload lacks the "sub" claim or payload is decoded as null from corrupt headers, accessing payload.sub throws unhandled TypeError.',
    stackTrace: `AttributeError: 'NoneType' object has no attribute 'get' at auth.py:76
    at authenticate_user (app/routers/auth.py:76:18)
    at async dispatch (fastapi/routing.py:241:12)`,
    fixSuggestion: {
      model: 'GPT-4o',
      confidence: 94,
      lines: 8,
      estTime: '12m',
      status: 'Ready',
      explanation: 'Add null guard before accessing \`sub\` and return HTTP 401 Unauthorized securely.',
      diffSnippet: `@@ -76,6 +76,10 @@
- sub = payload.get("sub")
- user = await get_user_by_id(sub)
+ if not payload or not isinstance(payload, dict):
+     raise HTTPException(status_code=401, detail="Invalid token payload")
+ sub = payload.get("sub")
+ if not sub:
+     raise HTTPException(status_code=401, detail="Missing user identifier in token")
+ user = await get_user_by_id(sub)`
    }
  },
  {
    id: 'bug-4',
    code: 'BUG-003',
    title: 'Memory leak in image processing pipeline buffer reallocation',
    tags: ['#memory', '#sharp'],
    severity: 'High',
    status: 'In Review',
    aiStatus: 'Ready',
    language: 'Node.js',
    component: 'Image Processor',
    loggedDate: '2026-08-09',
    updatedDate: '2026-08-12',
    filePath: 'src/services/image_processor.js',
    lineNumber: 89,
    description: 'Sharp image processing instances were not being explicitly destroyed after streaming write completes, leaking native V8 buffers.',
    fixSuggestion: {
      model: 'GPT-4o',
      confidence: 91,
      lines: 6,
      estTime: '15m',
      status: 'Ready',
      explanation: 'Explicitly destroy Sharp pipeline instance in finally block and release buffer pools.',
      diffSnippet: `@@ -89,5 +89,9 @@
  try {
    await pipeline.toFile(outputPath);
+ } finally {
+   pipeline.destroy();
+   pipeline = null;
  }`
    }
  },
  {
    id: 'bug-5',
    code: 'BUG-004',
    title: 'Incorrect pagination offset on filtered CTE aggregation query',
    tags: ['#sql', '#pagination'],
    severity: 'Medium',
    status: 'AI Suggested',
    aiStatus: 'Ready',
    language: 'PostgreSQL',
    component: 'Query Builder',
    loggedDate: '2026-08-08',
    updatedDate: '2026-08-11',
    filePath: 'src/services/query_builder.sql',
    lineNumber: 34,
    description: 'LIMIT/OFFSET clauses were applied inside the CTE instead of outer query projection when status filter was active.',
    fixSuggestion: {
      model: 'Claude 3.5 Sonnet',
      confidence: 97,
      lines: 11,
      estTime: '20m',
      status: 'Ready',
      explanation: 'Apply WHERE clause in a CTE before applying pagination on window-ranked results.',
      diffSnippet: `@@ -34,8 +34,13 @@
- WITH filtered AS (
-   SELECT * FROM items LIMIT $1 OFFSET $2
- )
+ WITH filtered AS (
+   SELECT *, COUNT(*) OVER() as full_count 
+   FROM items 
+   WHERE status = $3
+ )
+ SELECT * FROM filtered ORDER BY created_at DESC LIMIT $1 OFFSET $2;`
    }
  },
  {
    id: 'bug-6',
    code: 'BUG-005',
    title: 'CSS animation jank on iOS Safari 17 hardware accelerated transforms',
    tags: ['#css', '#safari'],
    severity: 'Low',
    status: 'Fixed',
    aiStatus: 'Applied',
    language: 'CSS',
    component: 'UI Components',
    loggedDate: '2026-08-07',
    updatedDate: '2026-08-10',
    filePath: 'src/styles/components.css',
    lineNumber: 102,
    description: 'Backface visibility and translate3d triggering compositing layer thrashing on WebKit.',
    fixSuggestion: {
      model: 'GPT-4o',
      confidence: 82,
      lines: 4,
      estTime: '8m',
      status: 'Applied',
      explanation: 'Replace will-change: transform with transform: translateZ(0) to stabilize render layers.',
      diffSnippet: `@@ -102,3 +102,4 @@
- will-change: transform;
+ transform: translate3d(0, 0, 0);
+ -webkit-backface-visibility: hidden;`
    }
  },
  {
    id: 'bug-7',
    code: 'BUG-007',
    title: 'Type mismatch in GraphQL resolver return type for nested edges',
    tags: ['#graphql', '#typescript'],
    severity: 'Medium',
    status: 'Applying Fix',
    aiStatus: 'Applied',
    language: 'TypeScript',
    component: 'GraphQL API',
    loggedDate: '2026-08-06',
    updatedDate: '2026-08-12',
    filePath: 'src/app/schema.resolvers.ts',
    lineNumber: 142,
    description: 'Connection edge resolvers returned raw DB model instead of formatted Relay Node type.',
    fixSuggestion: {
      model: 'Claude 3.5 Sonnet',
      confidence: 96,
      lines: 12,
      estTime: '10m',
      status: 'Applied',
      explanation: 'Create a mapper function from UserDB entity to GraphQL UserEdge format.',
      diffSnippet: `@@ -142,4 +142,9 @@
- return edges.map(e => ({ node: e }));
+ return edges.map(e => ({
+   cursor: Buffer.from(e.id).toString('base64'),
+   node: toUserNode(e)
+ }));`
    }
  },
  {
    id: 'bug-8',
    code: 'BUG-008',
    title: 'Docker container fails to start on ARM64 architecture build',
    tags: ['#docker', '#arm64'],
    severity: 'Medium',
    status: 'AI Suggested',
    aiStatus: 'Ready',
    language: 'Docker',
    component: 'Infrastructure',
    loggedDate: '2026-08-05',
    updatedDate: '2026-08-11',
    filePath: 'Dockerfile',
    lineNumber: 1,
    description: 'Base image lacked multi-arch precompiled wheels for grpcio on Apple Silicon and Graviton2.',
    fixSuggestion: {
      model: 'GPT-4o',
      confidence: 99,
      lines: 3,
      estTime: '5m',
      status: 'Ready',
      explanation: 'Add --platform linux/amd64 flag to FROM directive or use universal builder image.',
      diffSnippet: `@@ -1,2 +1,2 @@
- FROM python:3.11-slim
+ FROM --platform=linux/amd64 python:3.11-slim`
    }
  },
  {
    id: 'bug-9',
    code: 'BUG-009',
    title: 'Missing CORS headers on preflight OPTIONS response for api-gateway',
    tags: ['#cors', '#http'],
    severity: 'High',
    status: 'Fixed',
    aiStatus: 'Applied',
    language: 'Node.js',
    component: 'HTTP Server',
    loggedDate: '2026-08-04',
    updatedDate: '2026-08-09',
    filePath: 'src/app/server.ts',
    lineNumber: 22,
    description: 'CORS middleware registered after route handlers causing OPTIONS preflight requests to return 404.',
    fixSuggestion: {
      model: 'GPT-4o',
      confidence: 98,
      lines: 5,
      estTime: '7m',
      status: 'Applied',
      explanation: 'Move CORS middleware before route declarations and add preflight wildcard responder.',
      diffSnippet: `@@ -22,0 +22,4 @@
+ app.use(cors({ origin: true, credentials: true }));
+ app.options('*', cors());`
    }
  },
  {
    id: 'bug-10',
    code: 'BUG-010',
    title: 'Stale closure in React useCallback dependency on form validation',
    tags: ['#react', '#hooks'],
    severity: 'Medium',
    status: 'Closed',
    aiStatus: 'Applied',
    language: 'React',
    component: 'Form Components',
    loggedDate: '2026-08-03',
    updatedDate: '2026-08-08',
    filePath: 'src/components/Form.tsx',
    lineNumber: 54,
    description: 'useCallback closure cached previous state values resulting in skipped field validation.',
    fixSuggestion: {
      model: 'Claude 3.5 Sonnet',
      confidence: 93,
      lines: 2,
      estTime: '3m',
      status: 'Applied',
      explanation: 'Add formData to the useCallback dependency list or use functional setState pattern.',
      diffSnippet: `@@ -54,2 +54,2 @@
- }, []);
+ }, [formData, validateForm]);`
    }
  }
];

export const initialFixHistory: AIFixHistoryItem[] = [
  {
    id: 'fix-1',
    bugId: 'BUG-001',
    bugTitle: 'Null pointer exception in user auth m...',
    patchSummary: 'Add null guard before accessing `sub`...',
    date: '2026-08-12',
    model: 'GPT-4o',
    confidence: 94,
    status: 'Ready',
    lines: 8,
    estTime: '12m',
    fullDiff: `@@ -76,6 +76,10 @@
- sub = payload.get("sub")
- user = await get_user_by_id(sub)
+ if not payload or not isinstance(payload, dict):
+     raise HTTPException(status_code=401, detail="Invalid token payload")
+ sub = payload.get("sub")
+ if not sub:
+     raise HTTPException(status_code=401, detail="Missing user identifier in token")
+ user = await get_user_by_id(sub)`
  },
  {
    id: 'fix-2',
    bugId: 'BUG-003',
    bugTitle: 'Memory leak in image processing pi...',
    patchSummary: 'Explicitly destroy Sharp pipeline after...',
    date: '2026-08-12',
    model: 'GPT-4o',
    confidence: 91,
    status: 'Ready',
    lines: 6,
    estTime: '15m',
    fullDiff: `@@ -89,5 +89,9 @@
  try {
    await pipeline.toFile(outputPath);
+ } finally {
+   pipeline.destroy();
+   pipeline = null;
  }`
  },
  {
    id: 'fix-3',
    bugId: 'BUG-001',
    bugTitle: 'Null pointer exception in user auth m...',
    patchSummary: 'Wrap jwt.verify in try/catch and handl...',
    date: '2026-08-11',
    model: 'Claude 3.5 Sonnet',
    confidence: 88,
    status: 'Superseded',
    lines: 14,
    estTime: '18m',
    fullDiff: `@@ -70,8 +70,14 @@
- payload = jwt.decode(token, SECRET_KEY)
+ try:
+     payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
+ except JWTError as err:
+     logger.error(f"JWT decode failure: {err}")
+     return None`
  },
  {
    id: 'fix-4',
    bugId: 'BUG-004',
    bugTitle: 'Incorrect pagination offset on filtere...',
    patchSummary: 'Apply WHERE clause in a CTE before ...',
    date: '2026-08-11',
    model: 'Claude 3.5 Sonnet',
    confidence: 97,
    status: 'Ready',
    lines: 11,
    estTime: '20m',
    fullDiff: `@@ -34,8 +34,13 @@
- WITH filtered AS (
-   SELECT * FROM items LIMIT $1 OFFSET $2
- )
+ WITH filtered AS (
+   SELECT *, COUNT(*) OVER() as full_count 
+   FROM items 
+   WHERE status = $3
+ )
+ SELECT * FROM filtered ORDER BY created_at DESC LIMIT $1 OFFSET $2;`
  },
  {
    id: 'fix-5',
    bugId: 'BUG-007',
    bugTitle: 'Type mismatch in GraphQL resolver r...',
    patchSummary: 'Create a mapper function from UserD...',
    date: '2026-08-11',
    model: 'Claude 3.5 Sonnet',
    confidence: 96,
    status: 'Applied',
    lines: 12,
    estTime: '10m',
    fullDiff: `@@ -142,4 +142,9 @@
- return edges.map(e => ({ node: e }));
+ return edges.map(e => ({
+   cursor: Buffer.from(e.id).toString('base64'),
+   node: toUserNode(e)
+ }));`
  },
  {
    id: 'fix-6',
    bugId: 'BUG-008',
    bugTitle: 'Docker container fails to start on AR...',
    patchSummary: 'Add --platform linux/amd64 flag to F...',
    date: '2026-08-11',
    model: 'GPT-4o',
    confidence: 99,
    status: 'Ready',
    lines: 3,
    estTime: '5m',
    fullDiff: `@@ -1,2 +1,2 @@
- FROM python:3.11-slim
+ FROM --platform=linux/amd64 python:3.11-slim`
  },
  {
    id: 'fix-7',
    bugId: 'BUG-005',
    bugTitle: 'CSS animation jank on iOS Safari 17',
    patchSummary: 'Replace will-change: transform with t...',
    date: '2026-08-09',
    model: 'GPT-4o',
    confidence: 82,
    status: 'Applied',
    lines: 4,
    estTime: '8m',
    fullDiff: `@@ -102,3 +102,4 @@
- will-change: transform;
+ transform: translate3d(0, 0, 0);
+ -webkit-backface-visibility: hidden;`
  },
  {
    id: 'fix-8',
    bugId: 'BUG-009',
    bugTitle: 'Missing CORS headers on preflight ...',
    patchSummary: 'Move CORS middleware before route ...',
    date: '2026-08-07',
    model: 'GPT-4o',
    confidence: 98,
    status: 'Applied',
    lines: 5,
    estTime: '7m',
    fullDiff: `@@ -22,0 +22,4 @@
+ app.use(cors({ origin: true, credentials: true }));
+ app.options('*', cors());`
  },
  {
    id: 'fix-9',
    bugId: 'BUG-010',
    bugTitle: 'Stale closure in React useCallback d...',
    patchSummary: 'Add formData to the useCallback dep...',
    date: '2026-08-06',
    model: 'Claude 3.5 Sonnet',
    confidence: 93,
    status: 'Applied',
    lines: 2,
    estTime: '3m',
    fullDiff: `@@ -54,2 +54,2 @@
- }, []);
+ }, [formData, validateForm]);`
  }
];

// Placeholder shown before any real analysis run exists (see DashboardView,
// which overwrites this the moment the backend returns real phase data).
// Every phase starts 'pending' with no fabricated durations, subtasks, or
// findings -- a prior version of this file hardcoded all 10 phases as
// 'completed' with invented numbers (fake file counts, fake test results,
// a fake BUG-001 diff), which made the dashboard look like a finished,
// successful run before the user had even uploaded a project.
export const pipelinePhases: PipelinePhase[] = [
  {
    id: 1,
    name: 'Project Input',
    description: 'ZIP upload, Git repo, context docs (txt/md/pdf) & zero-trust security validation',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 2,
    name: 'Project Setup',
    description: 'Extract directory, detect language, framework, dependencies, entry point & verify context',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 3,
    name: 'Static Analysis',
    description: 'Zero-AI deterministic AST linters (flake8, ruff, mypy, bandit) & pip-audit dependency vulnerability scan',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 4,
    name: 'Error & Evidence Collection',
    description: 'Merge compiler logs, static analysis findings, stack traces & loop iteration state',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 5,
    name: 'AI Root Cause Analysis',
    description: 'Deep reasoning LLM investigates root cause, contract breach & blast radius',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 6,
    name: 'AI Patch Generation',
    description: 'Synthesize minimal unified diff patch',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 7,
    name: 'Isolated Environment',
    description: 'Create isolated Docker sandbox container & configure database sidecar (Postgres/MySQL) network + env vars for Phase 8',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 8,
    name: 'Install → Build → Run & Test',
    description: 'Execute install, build, run the app server, run tests & fire Preview Checkpoint',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 9,
    name: 'Regression Check',
    description: 'Execute full test suite, integration harness & contract verification',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  },
  {
    id: 10,
    name: 'Validation & Iteration',
    description: 'Evaluate pass/fail result; branch to Final Report or Manual/Automatic Retry Loop',
    duration: '',
    status: 'pending',
    subtasks: [],
    subprocesses: []
  }
];

export const initialFixAttempts: FixAttempt[] = [
  {
    id: 'att-1',
    bugId: 'BUG-001',
    analysisRunId: 'run-005',
    attemptNumber: 1,
    mode: 'automatic',
    triggerNote: null,
    triggerFileEdit: false,
    diffSnippet: `@@ -76,3 +76,5 @@
- sub = payload.get("sub")
+ if not payload:
+     raise HTTPException(status_code=401, detail="Invalid token")
+ sub = payload.get("sub")`,
    previousAttemptId: null,
    resultStatus: 'fail',
    errorFingerprint: 'fp:e9a2f1c8',
    rawErrorOutput: 'tests/test_auth.py:76: AttributeError: payload is not a dict instance',
    createdAt: '10:31:58',
    linesAdded: 3,
    linesRemoved: 1
  },
  {
    id: 'att-2',
    bugId: 'BUG-001',
    analysisRunId: 'run-005',
    attemptNumber: 2,
    mode: 'manual',
    triggerNote: 'Add isinstance(payload, dict) guard and return standard 401 Unauthorized before accessing sub.',
    triggerFileEdit: false,
    diffSnippet: `@@ -76,3 +76,7 @@
- sub = payload.get("sub")
- user = await get_user_by_id(sub)
+ if not payload or not isinstance(payload, dict):
+     raise HTTPException(status_code=401, detail="Invalid token payload")
+ sub = payload.get("sub")
+ user = await get_user_by_id(sub)`,
    previousAttemptId: 'att-1',
    resultStatus: 'pass',
    errorFingerprint: null,
    rawErrorOutput: null,
    createdAt: '10:32:08',
    linesAdded: 4,
    linesRemoved: 2
  }
];

export const initialPreviewCheckpoint: PreviewCheckpoint = {
  id: 'ckpt-001',
  analysisRunId: 'run-005',
  previewSessionId: 'sess-8000',
  status: 'awaiting_decision',
  promptMessages: [
    {
      id: 'msg-1',
      role: 'assistant',
      text: 'Phase 8 (Install → Build → Run & Test) completed successfully. All 14 core unit test suites passed. The FastAPI daemon is listening on port 8000 with active port forwarding. Would you like to preview the application before running the full Phase 9 regression suite?',
      createdAt: '10:32:04'
    }
  ],
  fileEditsDetected: [
    {
      filePath: 'src/app/routers/auth.py',
      diffSnippet: `@@ -76,3 +76,7 @@
- sub = payload.get("sub")
+ if not payload or not isinstance(payload, dict):
+     raise HTTPException(status_code=401, detail="Invalid token payload")
+ sub = payload.get("sub")`,
      detectedAt: '10:32:05'
    }
  ],
  createdAt: '10:32:04',
  resumedAt: null
};

export const initialLogs: LogLine[] = [
  { id: '1', timestamp: '10:31:04', level: 'INFO', category: 'setup', message: 'Project archive extracted to /workspace/api-gateway' },
  { id: '2', timestamp: '10:31:04', level: 'PASS', category: 'setup', message: 'Tech stack detected: Python 3.11, FastAPI 0.104.1, SQLAlchemy 2.0' },
  { id: '3', timestamp: '10:31:05', level: 'INFO', category: 'setup', message: 'Reading requirements.txt — 47 packages found' },
  { id: '4', timestamp: '10:31:06', level: 'INFO', category: 'docker', message: 'Pulling image python:3.11-slim...' },
  { id: '5', timestamp: '10:31:18', level: 'PASS', category: 'docker', message: 'Container created: bugfixai-run-005 (2 CPU, 4096MB)' },
  { id: '6', timestamp: '10:31:19', level: 'INFO', category: 'install', message: 'pip install -r requirements.txt --no-cache-dir' },
  { id: '7', timestamp: '10:31:44', level: 'PASS', category: 'install', message: '47 packages installed in 25.3s' },
  { id: '8', timestamp: '10:31:45', level: 'INFO', category: 'lint', message: 'Running flake8 on 23 source files...' },
  { id: '9', timestamp: '10:31:47', level: 'WARN', category: 'lint', message: 'app/routers/auth.py:42: F841 local variable \'token_claims\' is assigned to but never used' },
  { id: '10', timestamp: '10:31:48', level: 'WARN', category: 'lint', message: 'app/services/rate_limiter.py:18: E501 line too long (88 > 79 characters)' },
  { id: '11', timestamp: '10:31:49', level: 'PASS', category: 'lint', message: 'Lint completed with 2 non-fatal warnings' },
  { id: '12', timestamp: '10:31:50', level: 'INFO', category: 'test', message: 'pytest -v --tb=short tests/' },
  { id: '13', timestamp: '10:31:52', level: 'PASS', category: 'test', message: 'tests/test_health.py::test_health_endpoint PASSED [ 3%]' },
  { id: '14', timestamp: '10:31:54', level: 'PASS', category: 'test', message: 'tests/test_db.py::test_db_connection PASSED [ 6%]' },
  { id: '15', timestamp: '10:31:57', level: 'ERROR', category: 'test', message: 'tests/test_auth.py::test_jwt_empty_sub FAILED [ 9%]' },
  { id: '16', timestamp: '10:31:58', level: 'ERROR', category: 'test', message: 'AttributeError: \'NoneType\' object has no attribute \'get\' at auth.py:76' },
  { id: '17', timestamp: '10:32:01', level: 'ERROR', category: 'test', message: 'tests/test_rate_limit.py::test_cluster_reset FAILED [ 12%]' },
  { id: '18', timestamp: '10:32:03', level: 'INFO', category: 'ai-agent', message: 'Capturing failed stack frames and source ast context...' },
  { id: '19', timestamp: '10:32:05', level: 'INFO', category: 'ai-agent', message: 'Queuing root cause analysis prompt for Gemini / GPT-4o...' },
  { id: '20', timestamp: '10:32:08', level: 'INFO', category: 'ai-agent', message: 'Synthesizing automated patch candidate with 94% confidence score...' }
];

export const workspaceFiles: WorkspaceFile[] = [
  {
    name: 'src',
    path: 'src',
    type: 'folder',
    children: [
      {
        name: 'app',
        path: 'src/app',
        type: 'folder',
        children: [
          {
            name: 'auth.py',
            path: 'src/app/auth.py',
            type: 'file',
            language: 'python',
            hasBug: true,
            bugId: 'BUG-001',
            content: `"""
Authentication middleware and token verification
"""
from fastapi import Request, HTTPException
import jwt
import os

SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-1234")

async def authenticate_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = auth_header.split(" ")[1]
    
    # Bug location: payload can be None or sub missing
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    
    # ❌ BUG-001: Null pointer when payload is malformed
    sub = payload.get("sub")
    
    user = await get_user_by_id(sub)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    return user
`
          },
          {
            name: 'main.py',
            path: 'src/app/main.py',
            type: 'file',
            language: 'python',
            content: `from fastapi import FastAPI
from app.routers import auth_router, data_router

app = FastAPI(title="api-gateway", version="1.0.0")

app.include_router(auth_router.router, prefix="/api/v1/auth")
app.include_router(data_router.router, prefix="/api/v1/data")

@app.get("/healthz")
async def health():
    return {"status": "healthy", "service": "api-gateway"}
`
          }
        ]
      },
      {
        name: 'services',
        path: 'src/services',
        type: 'folder',
        children: [
          {
            name: 'rate_limiter.ts',
            path: 'src/services/rate_limiter.ts',
            type: 'file',
            language: 'typescript',
            hasBug: true,
            bugId: 'BUG-006',
            content: `import { Redis } from 'ioredis';

export class RateLimiter {
  private redis: Redis;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  async checkLimit(userId: string, limit: number = 100): Promise<boolean> {
    const key = \`rate_limit:\${userId}:\${Math.floor(Date.now() / 60000)}\`;
    
    // ❌ BUG-006: Redis Cluster MULTI doesn't expire across slots
    await this.redis.incr(key);
    await this.redis.expire(key, 60);
    
    const count = parseInt((await this.redis.get(key)) || '0', 10);
    return count <= limit;
  }
}
`
          },
          {
            name: 'image_processor.js',
            path: 'src/services/image_processor.js',
            type: 'file',
            language: 'javascript',
            hasBug: true,
            bugId: 'BUG-003',
            content: `const sharp = require('sharp');

async function processUserAvatar(inputBuffer, outputPath) {
  let pipeline = sharp(inputBuffer)
    .resize(256, 256)
    .webp({ quality: 80 });

  // ❌ BUG-003: Pipeline native buffer not released on error
  try {
    await pipeline.toFile(outputPath);
  } catch (err) {
    console.error('Sharp transformation error', err);
    throw err;
  }
}

module.exports = { processUserAvatar };
`
          }
        ]
      },
      {
        name: 'tests',
        path: 'src/tests',
        type: 'folder',
        children: [
          {
            name: 'test_auth.py',
            path: 'src/tests/test_auth.py',
            type: 'file',
            language: 'python',
            content: `import pytest
from app.auth import authenticate_user

@pytest.mark.asyncio
async def test_jwt_empty_sub():
    # Will reproduce BUG-001
    bad_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M"
    # Should catch gracefully instead of 500 error
`
          }
        ]
      }
    ]
  },
  {
    name: 'requirements.txt',
    path: 'requirements.txt',
    type: 'file',
    language: 'plaintext',
    content: `fastapi==0.104.1
uvicorn==0.24.0
sqlalchemy==2.0.23
alembic==1.12.1
pydantic==2.5.0
httpx==0.25.2
python-jose==3.3.0
passlib==1.7.4
celery==5.3.4
pytest==7.4.3
pytest-asyncio==0.21.1
`
  },
  {
    name: 'Dockerfile',
    path: 'Dockerfile',
    type: 'file',
    language: 'dockerfile',
    hasBug: true,
    bugId: 'BUG-008',
    content: `FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ /app/src/

EXPOSE 8000
CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`
  },
  {
    name: 'README.md',
    path: 'README.md',
    type: 'file',
    language: 'markdown',
    content: `# api-gateway

High performance microservice gateway with JWT authentication and Redis rate limiting.

### Run tests:
\`\`\`bash
pytest -v tests/
\`\`\`
`
  }
];
