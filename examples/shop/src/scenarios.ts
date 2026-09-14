export const scenarioIds = ['clean', 'horizontal-overflow', 'ancestor-clip', 'line-budget', 'hidden-checkout', 'blocked-checkout', 'partial-checkout', 'combined'] as const;
export type ScenarioId = typeof scenarioIds[number];

export function scenarioFromSearch(search: string): ScenarioId {
  const requested = new URLSearchParams(search).get('scenario');
  return scenarioIds.includes(requested as ScenarioId) ? requested as ScenarioId : 'clean';
}
