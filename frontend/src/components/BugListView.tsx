import React, { useState } from 'react';
import { 
  Bug as BugIcon, 
  Clock, 
  Zap, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Filter, 
  Plus, 
  Code2, 
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Bug, SeverityLevel, BugStatus } from '../types';

interface BugListViewProps {
  bugs: Bug[];
  onOpenNewBugModal: () => void;
  onSelectBugForDiff: (bug: Bug) => void;
  onNavigateToWorkspaceWithBug: (bug: Bug) => void;
}

export const BugListView: React.FC<BugListViewProps> = ({
  bugs,
  onOpenNewBugModal,
  onSelectBugForDiff,
  onNavigateToWorkspaceWithBug
}) => {

    const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter] = useState<string>('ALL');
  const [statusFilter] = useState<string>('ALL');
  const [selectedBugIds, setSelectedBugIds] = useState<string[]>([]);
  const [, setCurrentPage] = useState(1);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const filteredBugs = bugs.filter(bug => {
    const matchesSearch = 
      bug.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bug.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bug.component.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bug.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      bug.language.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity = severityFilter === 'ALL' || bug.severity === severityFilter;
    const matchesStatus = statusFilter === 'ALL' || bug.status === statusFilter;

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const openCount = bugs.filter(b => b.status === 'Open').length;
  const aiSuggestedCount = bugs.filter(b => b.aiStatus === 'Ready').length;
  const fixedCount = bugs.filter(b => b.status === 'Fixed').length;
  const criticalCount = bugs.filter(b => b.severity === 'Critical').length;

  const toggleSelectAll = () => {
    if (selectedBugIds.length === filteredBugs.length) {
      setSelectedBugIds([]);
    } else {
      setSelectedBugIds(filteredBugs.map(b => b.id));
    }
  };

  const toggleSelectBug = (id: string) => {
    setSelectedBugIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const getSeverityBadge = (severity: SeverityLevel) => {
    switch (severity) {
      case 'Critical':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'High':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'Medium':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'Low':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
    }
  };

  const getStatusBadge = (status: BugStatus) => {
    switch (status) {
      case 'Open':
        return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
      case 'AI Suggested':
        return 'bg-indigo-600/20 text-indigo-200 border-indigo-500/40';
      case 'In Review':
        return 'bg-blue-500/10 text-blue-300 border-blue-500/30';
      case 'Applying Fix':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'Fixed':
        return 'bg-green-500/10 text-green-300 border-green-500/30';
      case 'Closed':
        return 'bg-gray-800 text-gray-400 border-gray-700';
    }
  };

  return (
    <div id="bug-list-view" className="flex-1 overflow-y-auto bg-[#0B0E14] p-6 lg:p-8 space-y-6 text-[#E2E8F0]">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-md">
            <BugIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              Bug List & Defect Triage
            </h1>
            <p className="text-xs text-gray-400">
              All logged repository bugs — automated AST fixes available for 4 issues.
            </p>
          </div>
        </div>

        <button
          id="log-new-bug-btn"
          onClick={onOpenNewBugModal}
          className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Log New Bug</span>
        </button>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-9 h-9 rounded bg-[#161B22] border border-[#30363D] flex items-center justify-center text-indigo-400 shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-bold text-white">{openCount}</div>
            <div className="text-[11px] text-gray-400">Open Bugs</div>
          </div>
        </div>

        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-9 h-9 rounded bg-indigo-950/40 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-bold text-indigo-300">{aiSuggestedCount}</div>
            <div className="text-[11px] text-gray-400">AI Suggested</div>
          </div>
        </div>

        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-9 h-9 rounded bg-green-950/40 border border-green-500/30 flex items-center justify-center text-green-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-bold text-green-400">{fixedCount}</div>
            <div className="text-[11px] text-gray-400">Fixed This Week</div>
          </div>
        </div>

        <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-9 h-9 rounded bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-bold text-red-400">{criticalCount}</div>
            <div className="text-[11px] text-gray-400">Critical</div>
          </div>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search bugs, IDs, components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#161B22] border border-[#30363D] text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-xs font-medium text-gray-300 transition-colors"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-400 font-mono">
          {filteredBugs.length} bugs total
        </div>
      </div>

      {/* Bug Table */}
      <div className="rounded-lg bg-[#0D1117] border border-[#30363D] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#30363D] bg-[#161B22] text-gray-400 font-semibold uppercase text-[10px] tracking-wider">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedBugIds.length === filteredBugs.length && filteredBugs.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded bg-[#0D1117] border-[#30363D] text-indigo-600 focus:ring-0"
                  />
                </th>
                <th className="py-3 px-3">ID</th>
                <th className="py-3 px-3 min-w-[260px]">TITLE</th>
                <th className="py-3 px-3">SEVERITY</th>
                <th className="py-3 px-3">STATUS</th>
                <th className="py-3 px-3">AI STATUS</th>
                <th className="py-3 px-3">LANGUAGE</th>
                <th className="py-3 px-3">COMPONENT</th>
                <th className="py-3 px-3">UPDATED</th>
                <th className="py-3 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#21262D]">
              {filteredBugs.map((bug) => {
                const isSelected = selectedBugIds.includes(bug.id);

                return (
                  <tr 
                    key={bug.id}
                    className={`hover:bg-[#161B22] transition-colors ${
                      isSelected ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectBug(bug.id)}
                        className="rounded bg-[#0D1117] border-[#30363D] text-indigo-600 focus:ring-0"
                      />
                    </td>

                    <td className="py-3 px-3 font-mono text-gray-300 whitespace-nowrap">
                      {bug.code}
                    </td>

                    <td className="py-3 px-3">
                      <div 
                        className="font-medium text-gray-100 hover:text-indigo-400 cursor-pointer transition-colors"
                        onClick={() => onSelectBugForDiff(bug)}
                      >
                        {bug.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {bug.tags.map((tag, idx) => (
                          <span key={idx} className="text-[10px] font-mono text-gray-500">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getSeverityBadge(bug.severity)}`}>
                        {bug.severity}
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadge(bug.status)}`}>
                        {bug.status}
                      </span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {bug.aiStatus === 'Ready' && (
                        <span 
                          onClick={() => onSelectBugForDiff(bug)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 cursor-pointer transition-colors"
                        >
                          <Zap className="w-2.5 h-2.5" />
                          <span>Ready</span>
                        </span>
                      )}
                      {bug.aiStatus === 'Applied' && (
                        <span className="inline-flex items-center gap-1 text-green-400 font-semibold text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span>Applied</span>
                        </span>
                      )}
                      {bug.aiStatus === 'Pending' && (
                        <span className="inline-flex items-center gap-1 text-gray-500 text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-gray-300 font-mono text-xs whitespace-nowrap">
                      {bug.language}
                    </td>

                    <td className="py-3 px-3 text-gray-400 text-xs whitespace-nowrap">
                      {bug.component}
                    </td>

                    <td className="py-3 px-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                      {bug.updatedDate}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onSelectBugForDiff(bug)}
                          className="p-1 rounded bg-[#161B22] hover:bg-indigo-600 hover:text-white text-gray-400 border border-[#30363D] transition-colors"
                          title="Inspect AI Fix / Diff"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onNavigateToWorkspaceWithBug(bug)}
                          className="p-1 rounded bg-[#161B22] hover:bg-indigo-600 hover:text-white text-gray-400 border border-[#30363D] transition-colors"
                          title="Open in Workspace IDE"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#30363D] flex items-center justify-between text-xs text-gray-400">
          <div>Showing 1–10 of {bugs.length} Rows</div>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} className="p-1 text-gray-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
            <button className="w-6 h-6 rounded bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">1</button>
            <button className="w-6 h-6 rounded text-gray-400 hover:bg-[#161B22] flex items-center justify-center text-xs">2</button>
            <button onClick={() => setCurrentPage(2)} className="p-1 text-gray-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

    </div>
  );
};
