import React from 'react';
import type { FindingVerdictList } from '@anwc/report';
import { formatSourceReference } from './drawer-utils.js';

export interface ComparePanelProps {
  comparison: FindingVerdictList;
  /** Which capture the stage shows. */
  showing: 'before' | 'after';
  onShow: (which: 'before' | 'after') => void;
  onClear: () => void;
}

const VERDICT_LABEL = { verified: 'Verified', unverified: 'Not proven', contradicted: 'Contradicted' } as const;

/** Before/after verdicts for two captures of the same page. */
export function ComparePanel({ comparison, showing, onShow, onClear }: ComparePanelProps): React.JSX.Element {
  const { counts, verdicts, comparable, incompatibilities } = comparison;
  return (
    <section className="anwc-compare" data-testid="compare-panel" aria-label="Before and after">
      <div className="anwc-compare-head">
        <h2>Before and after</h2>
        <div className="anwc-segment" role="group" aria-label="Capture shown">
          <button type="button" aria-pressed={showing === 'before'} onClick={() => onShow('before')}>Before</button>
          <button type="button" aria-pressed={showing === 'after'} onClick={() => onShow('after')}>After</button>
        </div>
        <button type="button" className="anwc-btn anwc-btn-ghost" onClick={onClear}>Clear</button>
      </div>
      {!comparable && <p className="anwc-compare-note">These captures can’t be compared: {incompatibilities.join(' ')}</p>}
      {comparable && verdicts.length === 0 && (
        <p className="anwc-compare-note">Neither capture has a finding, so there is no repair to judge.</p>
      )}
      <ul>
        {verdicts.map((v) => (
          <li key={v.comparisonId} data-verdict={v.verdict}>
            <strong>{VERDICT_LABEL[v.verdict]}</strong>
            <span>
              {v.code} on {v.label || `<${v.tag}>`}
              {v.source && <code>{formatSourceReference(v.source)}</code>}
            </span>
            <span className="anwc-compare-why">
              {v.reason === 'behavior_not_checked'
                ? 'The finding is gone and the target is still there. Run anwc check with a declared click to prove it works.'
                : v.explanation}
            </span>
          </li>
        ))}
      </ul>
      <span className="anwc-sr-only" role="status">
        {counts.verified} verified, {counts.unverified} not proven, {counts.contradicted} contradicted
      </span>
    </section>
  );
}
