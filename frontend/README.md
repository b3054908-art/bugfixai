# BugFixer.ai — Frontend UI Template

A dark IDE-style UI for AI-powered automated bug detection, diagnostics, and patch synthesis.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Build production bundle:
```bash
npm run build
```

## Project Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── types.ts
    ├── data/
    │   └── mockData.ts
    └── components/
        ├── Sidebar.tsx
        ├── DashboardView.tsx
        ├── BugListView.tsx
        ├── AIFixHistoryView.tsx
        ├── WorkspaceView.tsx
        ├── AnalyticsView.tsx
        ├── DocsView.tsx
        ├── SettingsView.tsx
        ├── LogBugModal.tsx
        └── InspectFixModal.tsx
```

## Backend API Integration Guide

Replace mock handlers in `src/data/mockData.ts` and `src/App.tsx` with your own backend endpoints:
- `POST /api/analyze` — Trigger Docker AST sandbox analysis & run pytest
- `GET /api/bugs` — Fetch all detected bugs & stack traces
- `POST /api/patches/generate` — Generate unified AST diff via LLM
- `POST /api/patches/apply` — Apply patch to repository files
- `POST /api/chat` — Contextual AI code question answering
