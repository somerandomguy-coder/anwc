import { BenchmarkPlanError } from '../index.js';

export type PreparedFixture = { id: string; appId: 'landing' | 'dashboard'; caseId: string; requirements: string[] };

const fixtures: PreparedFixture[] = [
  { id: 'pricing-title', appId: 'landing', caseId: 'title-overflow', requirements: ['Keep all pricing plans and make the Growth title fit at mobile width.', 'Choosing Growth must show the selection confirmation.'] },
  { id: 'pricing-description', appId: 'landing', caseId: 'description-crop', requirements: ['Keep all pricing plans and reveal the full Growth description.', 'Choosing Growth must show the selection confirmation.'] },
  { id: 'pricing-blocked', appId: 'landing', caseId: 'blocked-selection', requirements: ['Keep all pricing plans and make Growth selectable.', 'Choosing Growth must show the selection confirmation.'] },
  { id: 'pricing-hidden', appId: 'landing', caseId: 'hidden-selection', requirements: ['Keep all pricing plans and make the Growth action visible.', 'Choosing Growth must show the selection confirmation.'] },
  { id: 'dashboard-clipped-save', appId: 'dashboard', caseId: 'clipped-save', requirements: ['Keep the dashboard note editor and make Save changes usable.', 'Opening the task drawer and saving must still show Changes saved.'] },
  { id: 'dashboard-long-title', appId: 'dashboard', caseId: 'long-title', requirements: ['Keep the dashboard task content and satisfy its two-line title layout.', 'Opening the task drawer and saving must still show Changes saved.'] },
  { id: 'dashboard-blocked-input', appId: 'dashboard', caseId: 'blocked-input', requirements: ['Keep the drawer owner input usable.', 'Opening the task drawer and saving must still show Changes saved.'] },
  { id: 'dashboard-outside-save', appId: 'dashboard', caseId: 'outside-save', requirements: ['Keep Save changes within the initial dashboard viewport.', 'Opening the task drawer and saving must still show Changes saved.'] }
];

export function fixtureFor(id: string): PreparedFixture {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) throw new BenchmarkPlanError([`unknown fixture: ${id}`]);
  return fixture;
}

/** Freezes the selected broken variant and removes public fixture navigation. */
export function materializeFixtureSource(source: string, fixture: PreparedFixture): string {
  const fixedState = fixture.appId === 'landing'
    ? `const caseId: CaseId = '${fixture.caseId}';\n  const variant: Variant = 'broken';`
    : `const caseId: CaseId = '${fixture.caseId}';\n  const variant: Variant = 'broken';`;
  const withoutQuery = source.replace(/\s*const (?:search|query) = new URLSearchParams\(location\.search\);\r?\n\s*const caseId = .*?;\r?\n\s*const variant: Variant = .*?;/, `  ${fixedState}`);
  const withoutNavigation = withoutQuery.replace(/\s*<nav aria-label="[^"]+">.*?<\/nav>/, '');
  return withoutNavigation.replace('data-anwc-scenario=', 'data-subject=');
}

export function taskMarkdown(fixture: PreparedFixture): string {
  return `# Repair task\n\n${fixture.requirements.map((requirement) => `- ${requirement}`).join('\n')}\n\nRun \`npm install\`, then \`npm run dev\`. Make the repair in the application source and preserve the stated behavior.\n`;
}
