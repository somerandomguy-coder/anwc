import React, { useState, useMemo } from 'react';
import type { Finding, Snapshot } from '@anwc/protocol';
import {
  createReport,
  queryFindingDetail,
  queryReportSummary,
  type AgentFindingDetail,
  type AgentSummary,
  type Report
} from '@anwc/report';
import {
  type AnyFinding,
  extractFindings,
  filterFindings,
  type FindingFilterType
} from './drawer-utils.js';
import { FindingCard } from './FindingCard.js';

export interface FindingDrawerProps {
  report?: Report | null;
  snapshot?: Snapshot | null;
  findings?: AnyFinding[];
  selectedFindingId: string | null;
  onSelectFinding: (id: string) => void;
  defaultExpanded?: boolean;
  defaultTab?: 'findings' | 'agent-json';
  defaultFilter?: FindingFilterType;
  className?: string;
  style?: React.CSSProperties;
}

export function FindingDrawer({
  report,
  snapshot,
  findings: directFindings,
  selectedFindingId,
  onSelectFinding,
  defaultExpanded = true,
  defaultTab = 'findings',
  defaultFilter = 'all',
  className = '',
  style
}: FindingDrawerProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'findings' | 'agent-json'>(defaultTab);
  const [activeFilter, setActiveFilter] = useState<FindingFilterType>(defaultFilter);
  const [agentJsonSubTab, setAgentJsonSubTab] = useState<'summary' | 'detail'>('summary');
  const [copied, setCopied] = useState(false);

  // Extract all findings from direct prop, report, or snapshot
  const allFindings = useMemo<AnyFinding[]>(() => {
    if (directFindings && directFindings.length > 0) {
      return directFindings;
    }
    if (report) {
      return extractFindings(report);
    }
    if (snapshot) {
      return extractFindings(snapshot);
    }
    return [];
  }, [directFindings, report, snapshot]);

  // Filter findings according to active filter chip
  const filteredFindings = useMemo(() => {
    return filterFindings(allFindings, activeFilter);
  }, [allFindings, activeFilter]);

  // Compute counts for filter chips
  const filterCounts = useMemo(() => {
    return {
      all: allFindings.length,
      critical: filterFindings(allFindings, 'critical').length,
      pointer: filterFindings(allFindings, 'pointer').length,
      clipped: filterFindings(allFindings, 'clipped').length,
      actionable: filterFindings(allFindings, 'actionable').length
    };
  }, [allFindings]);

  // Ensure effective report for agent queries
  const effectiveReport = useMemo(() => {
    if (report) return report;
    if (snapshot) return createReport(snapshot);
    return null;
  }, [report, snapshot]);

  // Agent summary JSON payload
  const agentSummary = useMemo<AgentSummary | null>(() => {
    if (!effectiveReport) return null;
    try {
      return queryReportSummary(effectiveReport);
    } catch {
      return null;
    }
  }, [effectiveReport]);

  // Agent finding detail JSON payload for selected finding
  const agentFindingDetail = useMemo<AgentFindingDetail | null>(() => {
    if (!effectiveReport || !selectedFindingId) return null;
    try {
      return queryFindingDetail(effectiveReport, selectedFindingId);
    } catch {
      return null;
    }
  }, [effectiveReport, selectedFindingId]);

  // Active JSON payload text to display / copy
  const activeJsonText = useMemo(() => {
    if (agentJsonSubTab === 'summary') {
      return agentSummary ? JSON.stringify(agentSummary, null, 2) : '{}';
    }
    return agentFindingDetail
      ? JSON.stringify(agentFindingDetail, null, 2)
      : JSON.stringify({ message: 'Select a finding to inspect its AgentFindingDetail payload.' }, null, 2);
  }, [agentJsonSubTab, agentSummary, agentFindingDetail]);

  const handleCopyJson = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeJsonText);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filterChips: { id: FindingFilterType; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: filterCounts.all },
    { id: 'critical', label: 'Critical', count: filterCounts.critical },
    { id: 'pointer', label: 'Pointer Blocked', count: filterCounts.pointer },
    { id: 'clipped', label: 'Clipped', count: filterCounts.clipped },
    { id: 'actionable', label: 'Actionable', count: filterCounts.actionable }
  ];

  return (
    <aside
      aria-label="Finding Drawer"
      className={`border-t border-gray-800 bg-gray-950/95 backdrop-blur-md flex flex-col transition-all duration-200 select-none ${
        isExpanded ? 'h-72 max-h-80' : 'h-11'
      } ${className}`}
      style={style}
    >
      {/* Top Header Bar / Collapsible Toggle Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/80 bg-gray-900/60 shrink-0">
        <div className="flex items-center gap-3">
          {/* Drawer collapse / expand button */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? 'Collapse finding drawer' : 'Expand finding drawer'}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white px-2 py-1 rounded bg-gray-800/80 hover:bg-gray-700/80 transition-colors"
          >
            <span>{isExpanded ? '▼' : '▲'}</span>
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          </button>

          {/* Primary Tab Switcher */}
          <div className="flex items-center rounded-lg bg-gray-800/80 p-0.5 border border-gray-700/50">
            <button
              type="button"
              onClick={() => {
                setActiveTab('findings');
                if (!isExpanded) setIsExpanded(true);
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'findings'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Diagnostic Findings ({allFindings.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('agent-json');
                if (!isExpanded) setIsExpanded(true);
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'agent-json'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Agent Payload (0.1 JSON)
            </button>
          </div>
        </div>

        {/* Quick summary counts in header */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {filterCounts.critical > 0 && (
            <span className="text-red-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              {filterCounts.critical} critical
            </span>
          )}
          {filterCounts.actionable > 0 && (
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              {filterCounts.actionable} actionable
            </span>
          )}
        </div>
      </div>

      {/* Main Drawer Body (visible when expanded) */}
      {isExpanded && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* TAB 1: DIAGNOSTIC FINDINGS */}
          {activeTab === 'findings' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Filter Chips Bar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/60 bg-gray-900/30 overflow-x-auto shrink-0">
                <span className="text-xs text-gray-400 font-medium mr-1">Filter:</span>
                {filterChips.map((chip) => {
                  const isActive = activeFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setActiveFilter(chip.id)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5 shrink-0 ${
                        isActive
                          ? 'bg-blue-600/20 text-blue-300 border-blue-500 shadow-sm'
                          : 'bg-gray-800/60 text-gray-400 border-gray-700/60 hover:text-gray-200 hover:bg-gray-750'
                      }`}
                    >
                      <span>{chip.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isActive ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {chip.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Finding Cards List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {filteredFindings.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm font-medium">No findings match the active filter.</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {allFindings.length === 0
                        ? 'Capture settled with zero detected defects.'
                        : `Switch filter or choose "All" to inspect ${allFindings.length} findings.`}
                    </p>
                  </div>
                ) : (
                  filteredFindings.map((finding) => (
                    <FindingCard
                      key={finding.findingId}
                      finding={finding}
                      selected={finding.findingId === selectedFindingId}
                      onSelectFinding={onSelectFinding}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AGENT PAYLOAD (0.1 JSON) INSPECTOR */}
          {activeTab === 'agent-json' && (
            <div className="flex-1 flex flex-col min-h-0 bg-gray-950">
              {/* Agent Sub-tabs & Copy Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/40 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAgentJsonSubTab('summary')}
                    className={`text-xs font-mono font-medium px-2.5 py-1 rounded border transition-colors ${
                      agentJsonSubTab === 'summary'
                        ? 'bg-blue-900/30 text-blue-400 border-blue-600'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                    }`}
                  >
                    Agent Summary (0.1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentJsonSubTab('detail')}
                    className={`text-xs font-mono font-medium px-2.5 py-1 rounded border transition-colors ${
                      agentJsonSubTab === 'detail'
                        ? 'bg-blue-900/30 text-blue-400 border-blue-600'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                    }`}
                  >
                    Agent Finding Detail {selectedFindingId ? `(${selectedFindingId})` : ''}
                  </button>
                </div>

                {/* Copy JSON Button */}
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="flex items-center gap-1.5 text-xs font-mono bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded font-medium transition-colors shadow-sm"
                >
                  <span>📋</span>
                  <span>{copied ? '✓ Copied!' : 'Copy JSON'}</span>
                </button>
              </div>

              {/* JSON Pre block */}
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-emerald-400/90 leading-relaxed bg-black/60 selection:bg-blue-500/30">
                <pre tabIndex={0} className="whitespace-pre-wrap break-all">
                  <code>{activeJsonText}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
