import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { AnyFinding } from './drawer-utils.js';
import {
  ALL_CATEGORIES,
  applyFindingFilter,
  numberFindings,
  overlayFindingIds,
  stepFinding,
  studioKeyAction,
  type RuleCategory
} from './encoding.js';

/**
 * Shared view state for the x-ray overlay and the finding list: one filter,
 * one numbering, one isolation and one hover, so both panes always agree.
 */
export interface FindingView {
  numbering: Map<string, number>;
  categories: ReadonlySet<RuleCategory>;
  query: string;
  isolatedFindingId: string | null;
  hoveredFindingId: string | null;
  /** Findings passing the filter, in list order. */
  visibleFindings: AnyFinding[];
  visibleIds: string[];
  /** Findings the overlay draws (the isolated one, or all visible). */
  overlayIds: string[];
  filterInputRef: React.RefObject<HTMLInputElement | null>;
  toggleCategory: (category: RuleCategory) => void;
  setQuery: (query: string) => void;
  showAll: () => void;
  /** Select a finding and isolate its boxes (click on a card or a box). */
  activateFinding: (findingId: string) => void;
  setHoveredFindingId: (findingId: string | null) => void;
  clear: () => void;
  step: (delta: 1 | -1) => void;
}

/** Filter, isolation and hover state; selection itself lives with the caller. */
export interface FindingViewState {
  categories: ReadonlySet<RuleCategory>;
  query: string;
  isolatedFindingId: string | null;
  hoveredFindingId: string | null;
}

export type FindingViewAction =
  | { type: 'toggle-category'; category: RuleCategory }
  | { type: 'set-query'; query: string }
  | { type: 'show-all' }
  | { type: 'activate'; findingId: string }
  | { type: 'hover'; findingId: string | null }
  | { type: 'clear' }
  | { type: 'stepped'; findingId: string }
  | { type: 'reset-capture'; findingIds: ReadonlySet<string> };

/** Pure transitions for the shared view (exported for tests). */
export function findingViewReducer(state: FindingViewState, action: FindingViewAction): FindingViewState {
  switch (action.type) {
    case 'toggle-category': {
      const categories = new Set(state.categories);
      if (categories.has(action.category)) categories.delete(action.category);
      else categories.add(action.category);
      return { ...state, categories };
    }
    case 'set-query':
      return { ...state, query: action.query };
    case 'show-all':
      return { ...state, categories: new Set(ALL_CATEGORIES), query: '', isolatedFindingId: null };
    case 'activate':
      return { ...state, isolatedFindingId: action.findingId };
    case 'hover':
      return state.hoveredFindingId === action.findingId ? state : { ...state, hoveredFindingId: action.findingId };
    case 'clear':
      return { ...state, query: '', isolatedFindingId: null };
    case 'stepped':
      // Isolation follows the selection while it is on; otherwise it stays off.
      return state.isolatedFindingId ? { ...state, isolatedFindingId: action.findingId } : state;
    case 'reset-capture':
      return {
        ...state,
        isolatedFindingId: state.isolatedFindingId && action.findingIds.has(state.isolatedFindingId) ? state.isolatedFindingId : null,
        hoveredFindingId: null
      };
  }
}

export interface UseFindingViewOptions {
  findings: readonly AnyFinding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  initialCategories?: Iterable<RuleCategory>;
  initialQuery?: string;
  initialIsolatedFindingId?: string | null;
  initialHoveredFindingId?: string | null;
  /** Install the j/k, `/` and Esc listener on window. */
  keyboard?: boolean;
}

export function useFindingView({
  findings,
  selectedFindingId,
  onSelectFinding,
  initialCategories,
  initialQuery = '',
  initialIsolatedFindingId = null,
  initialHoveredFindingId = null,
  keyboard = false
}: UseFindingViewOptions): FindingView {
  const [state, dispatch] = useReducer(findingViewReducer, undefined, (): FindingViewState => ({
    categories: new Set(initialCategories ?? ALL_CATEGORIES),
    query: initialQuery,
    isolatedFindingId: initialIsolatedFindingId,
    hoveredFindingId: initialHoveredFindingId
  }));
  const { categories, query, isolatedFindingId, hoveredFindingId } = state;
  const filterInputRef = useRef<HTMLInputElement | null>(null);

  const numbering = useMemo(() => numberFindings(findings), [findings]);
  const visibleFindings = useMemo(() => applyFindingFilter(findings, { categories, query }), [findings, categories, query]);
  const visibleIds = useMemo(() => visibleFindings.map((f) => f.findingId), [visibleFindings]);
  const overlayIds = useMemo(() => overlayFindingIds(visibleIds, isolatedFindingId), [visibleIds, isolatedFindingId]);

  // A new capture invalidates isolation and hover.
  useEffect(() => {
    dispatch({ type: 'reset-capture', findingIds: new Set(numbering.keys()) });
  }, [numbering]);

  const toggleCategory = useCallback((category: RuleCategory) => dispatch({ type: 'toggle-category', category }), []);
  const setQuery = useCallback((q: string) => dispatch({ type: 'set-query', query: q }), []);
  const showAll = useCallback(() => dispatch({ type: 'show-all' }), []);
  const setHoveredFindingId = useCallback((findingId: string | null) => dispatch({ type: 'hover', findingId }), []);

  const activateFinding = useCallback((findingId: string) => {
    onSelectFinding(findingId);
    dispatch({ type: 'activate', findingId });
  }, [onSelectFinding]);

  const clear = useCallback(() => {
    dispatch({ type: 'clear' });
    filterInputRef.current?.blur();
  }, []);

  const step = useCallback((delta: 1 | -1) => {
    const next = stepFinding(visibleIds, selectedFindingId, delta);
    if (!next) return;
    onSelectFinding(next);
    dispatch({ type: 'stepped', findingId: next });
  }, [visibleIds, selectedFindingId, onSelectFinding]);

  useEffect(() => {
    if (!keyboard || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const action = studioKeyAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        targetTag: target?.tagName ?? null,
        targetEditable: target?.isContentEditable ?? false
      });
      if (!action) return;
      event.preventDefault();
      if (action === 'next') step(1);
      else if (action === 'prev') step(-1);
      else if (action === 'focus-filter') filterInputRef.current?.focus();
      else clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, step, clear]);

  return {
    numbering,
    categories,
    query,
    isolatedFindingId,
    hoveredFindingId,
    visibleFindings,
    visibleIds,
    overlayIds,
    filterInputRef,
    toggleCategory,
    setQuery,
    showAll,
    activateFinding,
    setHoveredFindingId,
    clear,
    step
  };
}
