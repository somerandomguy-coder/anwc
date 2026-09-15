export const scenarioIds = [
  'clean', 'horizontal-overflow', 'ancestor-clip', 'nested-clip', 'line-budget', 'text-clipped',
  'hidden-checkout', 'opacity-checkout', 'blocked-checkout', 'partial-checkout', 'outside-viewport', 'combined'
] as const;
export type ScenarioId = typeof scenarioIds[number];

export function scenarioFromSearch(search: string): ScenarioId {
  const params = new URLSearchParams(search);
  const requested = params.get('case') ?? params.get('scenario');
  return scenarioIds.includes(requested as ScenarioId) ? requested as ScenarioId : 'clean';
}
