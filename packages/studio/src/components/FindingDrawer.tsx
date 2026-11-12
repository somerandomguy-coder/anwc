import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '@anwc/protocol';
import {
  createReport,
  queryFindingDetail,
  queryReportSummary,
  type AgentFindingDetail,
  type AgentSummary,
  type Report
} from '@anwc/report';
import { type AnyFinding, extractFindings } from './drawer-utils.js';
import { FindingCard } from './FindingCard.js';
import { RULE_CATEGORIES, countByCategory, nodeLookupFromSnapshot, type RuleCategory } from './encoding.js';
import { useFindingView, type FindingView } from './useFindingView.js';
import { nextTheme, useTheme } from './theme.js';

export interface FindingDrawerProps {
  report?: Report | null;
  snapshot?: Snapshot | null;
  findings?: AnyFinding[];
  selectedFindingId: string | null;
  onSelectFinding: (id: string) => void;
  /** Shared view state from useFindingView; when omitted the drawer keeps its own. */
  view?: FindingView;
  defaultExpanded?: boolean;
  defaultTab?: 'findings' | 'agent-json';
  /** Initial categories for a drawer that keeps its own view state. */
  defaultCategories?: RuleCategory[];
  defaultQuery?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function FindingDrawer({
  report,
  snapshot,
  findings: directFindings,
  selectedFindingId,
  onSelectFinding,
  view: sharedView,
  defaultExpanded = true,
  defaultTab = 'findings',
  defaultCategories,
  defaultQuery,
  className = '',
  style
}: FindingDrawerProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'findings' | 'agent-json'>(defaultTab);
  const [agentJsonSubTab, setAgentJsonSubTab] = useState<'summary' | 'detail'>('summary');
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useTheme();
  const listRef = useRef<HTMLDivElement | null>(null);

  const allFindings = useMemo<AnyFinding[]>(() => {
    if (directFindings && directFindings.length > 0) return directFindings;
    if (report) return extractFindings(report);
    if (snapshot) return extractFindings(snapshot);
    return [];
  }, [directFindings, report, snapshot]);

  const ownView = useFindingView({
    findings: allFindings,
    selectedFindingId,
    onSelectFinding,
    initialCategories: defaultCategories,
    initialQuery: defaultQuery
  });
  const view = sharedView ?? ownView;

  const categoryCounts = useMemo(() => countByCategory(allFindings), [allFindings]);
  const criticalCount = allFindings.filter((f) => f.severity === 'error').length;
  const actionableCount = allFindings.filter((f) => !f.acknowledged && (f.severity === 'error' || f.severity === 'warning')).length;
  const nodeLookup = useMemo(() => nodeLookupFromSnapshot(snapshot), [snapshot]);
  const filtersActive = view.query.trim() !== '' || view.isolatedFindingId !== null ||
    RULE_CATEGORIES.some((c) => !view.categories.has(c.id));

  // Keep the selected card in view when j/k or the x-ray changes the selection.
  useEffect(() => {
    if (!selectedFindingId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-finding-id="${CSS.escape(selectedFindingId)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedFindingId]);

  const effectiveReport = useMemo(() => {
    if (report) return report;
    if (snapshot) return createReport(snapshot);
    return null;
  }, [report, snapshot]);

  const agentSummary = useMemo<AgentSummary | null>(() => {
    if (!effectiveReport) return null;
    try {
      return queryReportSummary(effectiveReport);
    } catch {
      return null;
    }
  }, [effectiveReport]);

  const agentFindingDetail = useMemo<AgentFindingDetail | null>(() => {
    if (!effectiveReport || !selectedFindingId) return null;
    try {
      return queryFindingDetail(effectiveReport, selectedFindingId);
    } catch {
      return null;
    }
  }, [effectiveReport, selectedFindingId]);

  const activeJsonText = useMemo(() => {
    if (agentJsonSubTab === 'summary') return agentSummary ? JSON.stringify(agentSummary, null, 2) : '{}';
    return agentFindingDetail
      ? JSON.stringify(agentFindingDetail, null, 2)
      : JSON.stringify({ message: 'Select a finding to inspect its AgentFindingDetail payload.' }, null, 2);
  }, [agentJsonSubTab, agentSummary, agentFindingDetail]);

  const handleCopyJson = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeJsonText);
      }
    } catch {
      // Clipboard can be unavailable; still acknowledge the click.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside
      aria-label="Finding Drawer"
      className={`anwc-drawer ${className}`.trim()}
      data-expanded={isExpanded ? 'true' : 'false'}
      style={style}
    >
      <div className="anwc-drawer-bar">
        <div className="anwc-row">
          <button
            type="button"
            className="anwc-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? 'Collapse finding drawer' : 'Expand finding drawer'}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
          <div className="anwc-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'findings'}
              className={`anwc-tab ${activeTab === 'findings' ? 'is-active' : ''}`}
              onClick={() => {
                setActiveTab('findings');
                if (!isExpanded) setIsExpanded(true);
              }}
            >
              Diagnostic Findings ({allFindings.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'agent-json'}
              className={`anwc-tab ${activeTab === 'agent-json' ? 'is-active' : ''}`}
              onClick={() => {
                setActiveTab('agent-json');
                if (!isExpanded) setIsExpanded(true);
              }}
            >
              Agent Payload (0.1 JSON)
            </button>
          </div>
        </div>
        <div className="anwc-row anwc-mono">
          {criticalCount > 0 && <span className="anwc-count anwc-count-error">{criticalCount} critical</span>}
          {actionableCount > 0 && <span className="anwc-count anwc-count-warn">{actionableCount} actionable</span>}
          <button
            type="button"
            className="anwc-btn anwc-btn-ghost"
            data-testid="theme-toggle"
            title="Switch colour theme (auto follows the system)"
            onClick={() => setTheme(nextTheme(theme))}
          >
            Theme: {theme}
          </button>
        </div>
      </div>

      {isExpanded && activeTab === 'findings' && (
        <div className="anwc-drawer-body">
          <div className="anwc-filter-bar" role="group" aria-label="Filter findings">
            <fieldset className="anwc-cats">
              <legend className="anwc-sr-only">Rule categories</legend>
              {RULE_CATEGORIES.map((c) => {
                const count = categoryCounts[c.id];
                return (
                  <label key={c.id} className={`anwc-cat ${count === 0 ? 'is-empty' : ''}`} data-category={c.id}>
                    <input
                      type="checkbox"
                      checked={view.categories.has(c.id)}
                      onChange={() => view.toggleCategory(c.id)}
                      disabled={count === 0}
                    />
                    <span>{c.label}</span>
                    <span className="anwc-cat-count">{count}</span>
                  </label>
                );
              })}
            </fieldset>
            <input
              ref={view.filterInputRef}
              type="search"
              className="anwc-filter-input"
              data-testid="finding-filter"
              placeholder="Filter findings (press /)"
              aria-label="Filter findings by code, message or source"
              value={view.query}
              onChange={(e) => view.setQuery(e.target.value)}
            />
            <button type="button" className="anwc-btn" data-testid="show-all" onClick={view.showAll} disabled={!filtersActive}>
              Show all
            </button>
            <span className="anwc-keys" aria-hidden="true">
              <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>/</kbd> filter · <kbd>Esc</kbd> clear
            </span>
          </div>

          <div className="anwc-card-list" ref={listRef} data-testid="finding-list">
            {view.visibleFindings.length === 0 ? (
              <div className="anwc-empty">
                <p>No findings match the active filter.</p>
                <p className="anwc-muted">
                  {allFindings.length === 0
                    ? 'Capture settled with zero detected defects.'
                    : `Use "Show all" to inspect all ${allFindings.length} findings.`}
                </p>
              </div>
            ) : (
              view.visibleFindings.map((finding) => (
                <FindingCard
                  key={finding.findingId}
                  finding={finding}
                  number={view.numbering.get(finding.findingId)}
                  selected={finding.findingId === selectedFindingId}
                  hovered={finding.findingId === view.hoveredFindingId}
                  isolated={finding.findingId === view.isolatedFindingId}
                  onSelectFinding={view.activateFinding}
                  onHover={view.setHoveredFindingId}
                  nodeLookup={nodeLookup}
                />
              ))
            )}
          </div>
        </div>
      )}

      {isExpanded && activeTab === 'agent-json' && (
        <div className="anwc-drawer-body">
          <div className="anwc-filter-bar">
            <div className="anwc-row">
              <button
                type="button"
                className={`anwc-tab ${agentJsonSubTab === 'summary' ? 'is-active' : ''}`}
                onClick={() => setAgentJsonSubTab('summary')}
              >
                Agent Summary (0.1)
              </button>
              <button
                type="button"
                className={`anwc-tab ${agentJsonSubTab === 'detail' ? 'is-active' : ''}`}
                onClick={() => setAgentJsonSubTab('detail')}
              >
                Agent Finding Detail {selectedFindingId ? `(${selectedFindingId})` : ''}
              </button>
            </div>
            <button type="button" className="anwc-btn" onClick={handleCopyJson}>
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <div className="anwc-json">
            <pre tabIndex={0}>
              <code>{activeJsonText}</code>
            </pre>
          </div>
        </div>
      )}
    </aside>
  );
}
