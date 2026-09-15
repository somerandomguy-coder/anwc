export const scenarioIds = [
  'clean', 'horizontal-overflow', 'ancestor-clip', 'nested-clip', 'line-budget', 'text-clipped',
  'hidden-checkout', 'opacity-checkout', 'blocked-checkout', 'partial-checkout', 'outside-viewport', 'combined'
] as const;

export type ScenarioId = typeof scenarioIds[number];
export type FixtureVariant = 'broken' | 'healthy';
export type FixtureCase = {
  id: Exclude<ScenarioId, 'clean' | 'combined'>;
  targetKey: string;
  expectedCode: 'HORIZONTAL_OVERFLOW' | 'CLIPPED_BY_ANCESTOR' | 'TEXT_LINE_BUDGET_EXCEEDED' | 'TEXT_CLIPPED' | 'EXPECTED_VISIBLE_BUT_HIDDEN' | 'POINTER_BLOCKED_AT_SAMPLES' | 'POINTER_PARTIALLY_BLOCKED' | 'OUTSIDE_VIEWPORT';
  actionRequired: boolean;
};

export const developmentFixtureCases: readonly FixtureCase[] = [
  { id: 'horizontal-overflow', targetKey: 'overflow-rail', expectedCode: 'HORIZONTAL_OVERFLOW', actionRequired: false },
  { id: 'ancestor-clip', targetKey: 'clipped-action', expectedCode: 'CLIPPED_BY_ANCESTOR', actionRequired: true },
  { id: 'nested-clip', targetKey: 'nested-clipped-action', expectedCode: 'CLIPPED_BY_ANCESTOR', actionRequired: true },
  { id: 'line-budget', targetKey: 'line-budget-title', expectedCode: 'TEXT_LINE_BUDGET_EXCEEDED', actionRequired: false },
  { id: 'text-clipped', targetKey: 'text-clipped-title', expectedCode: 'TEXT_CLIPPED', actionRequired: false },
  { id: 'hidden-checkout', targetKey: 'hidden-checkout', expectedCode: 'EXPECTED_VISIBLE_BUT_HIDDEN', actionRequired: true },
  { id: 'opacity-checkout', targetKey: 'opacity-checkout', expectedCode: 'EXPECTED_VISIBLE_BUT_HIDDEN', actionRequired: true },
  { id: 'blocked-checkout', targetKey: 'blocked-checkout', expectedCode: 'POINTER_BLOCKED_AT_SAMPLES', actionRequired: true },
  { id: 'partial-checkout', targetKey: 'partial-checkout', expectedCode: 'POINTER_PARTIALLY_BLOCKED', actionRequired: true },
  { id: 'outside-viewport', targetKey: 'outside-viewport-checkout', expectedCode: 'OUTSIDE_VIEWPORT', actionRequired: true }
];

export function scenarioFromSearch(search: string): ScenarioId {
  const params = new URLSearchParams(search);
  const requested = params.get('case') ?? params.get('scenario');
  return scenarioIds.includes(requested as ScenarioId) ? requested as ScenarioId : 'clean';
}

export function fixtureVariantFromSearch(search: string): FixtureVariant {
  return new URLSearchParams(search).get('variant') === 'healthy' ? 'healthy' : 'broken';
}
