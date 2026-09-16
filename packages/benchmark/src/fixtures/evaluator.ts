import { evaluatorSidecarSchema, fixtureCaseSchema, type FixtureCase } from './index.js';
import type { PreparedFixture } from './registry.js';

export type EvaluatorFixture = { fixture: FixtureCase; repairChecks: ReturnType<typeof evaluatorSidecarSchema.parse>['repairChecks'] };

const landingBase = (id: string, requirements: string[]): FixtureCase => fixtureCaseSchema.parse({
  schemaVersion: '0.2', id, appId: 'landing', route: '/', requirements,
  viewports: [{ width: 390, height: 844 }, { width: 1440, height: 900 }], setup: [],
  requiredContent: ['Northstar plans', 'Growth'], requiredActions: [{ role: 'button', name: 'Choose Growth' }]
});

const dashboardBase = (id: string, requirements: string[], setup: FixtureCase['setup'] = []): FixtureCase => fixtureCaseSchema.parse({
  schemaVersion: '0.2', id, appId: 'dashboard', route: '/', requirements,
  viewports: [{ width: 390, height: 844 }, { width: 1440, height: 900 }], setup,
  requiredContent: ['Atlas workspace', 'Project delivery'], requiredActions: [{ role: 'button', name: 'Save changes' }]
});

const shopBase = (id: string, requirements: string[]): FixtureCase => fixtureCaseSchema.parse({
  schemaVersion: '0.2', id, appId: 'shop', route: '/', requirements,
  viewports: [{ width: 390, height: 844 }, { width: 1440, height: 900 }], setup: [],
  requiredContent: ['Sonder goods', 'Everyday favourites'], requiredActions: [{ role: 'button', name: 'Review cart' }]
});

const shopAction = (id: string, point?: { x: number; y: number }) => ({
  id: 'checkout-confirms', required: true, kind: 'action-changes-ui' as const, role: 'button', name: 'Checkout now', statusSelector: '[role=status]', expectedText: 'Checkout confirmed', ...(point ? { point } : {})
});

const fixtures: Record<string, EvaluatorFixture> = {
  'shop-horizontal-overflow': { fixture: shopBase('shop-horizontal-overflow', ['Keep the supplied store layout within its content boundary.']), repairChecks: [
    { id: 'rail-fits-boundary', required: true, kind: 'width-within', target: '.subject-rail-track', container: '.subject-rail', tolerancePx: 1 }
  ] },
  'shop-ancestor-clip': { fixture: shopBase('shop-ancestor-clip', ['Keep checkout reachable and usable.']), repairChecks: [{ id: 'checkout-rendered', required: true, kind: 'action-rendered', role: 'button', name: 'Checkout now' }, shopAction('checkout-confirms')] },
  'shop-nested-clip': { fixture: shopBase('shop-nested-clip', ['Keep checkout reachable and usable.']), repairChecks: [{ id: 'checkout-rendered', required: true, kind: 'action-rendered', role: 'button', name: 'Checkout now' }, shopAction('checkout-confirms')] },
  'shop-line-budget': { fixture: shopBase('shop-line-budget', ['Keep the supplied product text within its two-line design.']), repairChecks: [{ id: 'subject-title-lines', required: true, kind: 'line-count', selector: '.subject-card h2', maxLines: 2 }] },
  'shop-text-clipped': { fixture: shopBase('shop-text-clipped', ['Keep the supplied product text readable inside its card.']), repairChecks: [{ id: 'subject-text-contained', required: true, kind: 'text-within', selector: '.subject-card h2', container: '.subject-card', tolerancePx: 1 }] },
  'shop-hidden-checkout': { fixture: shopBase('shop-hidden-checkout', ['Keep checkout reachable and usable.']), repairChecks: [{ id: 'checkout-rendered', required: true, kind: 'action-rendered', role: 'button', name: 'Checkout now' }, shopAction('checkout-confirms')] },
  'shop-opacity-checkout': { fixture: shopBase('shop-opacity-checkout', ['Keep checkout reachable and usable.']), repairChecks: [{ id: 'checkout-rendered', required: true, kind: 'action-rendered', role: 'button', name: 'Checkout now' }, shopAction('checkout-confirms')] },
  'shop-blocked-checkout': { fixture: shopBase('shop-blocked-checkout', ['Keep checkout reachable and usable.']), repairChecks: [shopAction('checkout-confirms')] },
  'shop-partial-checkout': { fixture: shopBase('shop-partial-checkout', ['Keep checkout reachable and usable.']), repairChecks: [shopAction('checkout-confirms', { x: 0.25, y: 0.5 })] },
  'shop-outside-viewport': { fixture: shopBase('shop-outside-viewport', ['Keep checkout available in the initial view.']), repairChecks: [{ id: 'checkout-in-viewport', required: true, kind: 'action-in-viewport', role: 'button', name: 'Checkout now' }, shopAction('checkout-confirms')] },
  'pricing-title': { fixture: landingBase('pricing-title', ['Keep pricing plan content visible at both viewports.']), repairChecks: [
    { id: 'growth-title-width', required: true, kind: 'width-within', target: '.plan:nth-child(2) h2', container: '.plan:nth-child(2)', tolerancePx: 1 },
    { id: 'growth-selects', required: true, kind: 'action-changes-ui', role: 'button', name: 'Choose Growth', statusSelector: '#selection-status', expectedText: 'Growth plan selected' }
  ] },
  'pricing-description': { fixture: landingBase('pricing-description', ['Keep the complete Growth description readable at both viewports.']), repairChecks: [
    { id: 'growth-description-contained', required: true, kind: 'text-within', selector: '.growth-description', container: '.growth-description', tolerancePx: 1 },
    { id: 'growth-selects', required: true, kind: 'action-changes-ui', role: 'button', name: 'Choose Growth', statusSelector: '#selection-status', expectedText: 'Growth plan selected' }
  ] },
  'pricing-blocked': { fixture: landingBase('pricing-blocked', ['Keep the Growth plan action usable at both viewports.']), repairChecks: [
    { id: 'growth-selects', required: true, kind: 'action-changes-ui', role: 'button', name: 'Choose Growth', statusSelector: '#selection-status', expectedText: 'Growth plan selected' }
  ] },
  'pricing-hidden': { fixture: landingBase('pricing-hidden', ['Keep the Growth plan action visible and usable at both viewports.']), repairChecks: [
    { id: 'growth-visible', required: true, kind: 'action-rendered', role: 'button', name: 'Choose Growth' },
    { id: 'growth-selects', required: true, kind: 'action-changes-ui', role: 'button', name: 'Choose Growth', statusSelector: '#selection-status', expectedText: 'Growth plan selected' }
  ] },
  'dashboard-clipped-save': { fixture: dashboardBase('dashboard-clipped-save', ['Keep Save changes visible and usable at both viewports.']), repairChecks: [
    { id: 'save-visible', required: true, kind: 'action-rendered', role: 'button', name: 'Save changes' },
    { id: 'save-updates-status', required: true, kind: 'action-changes-ui', role: 'button', name: 'Save changes', statusSelector: '[role=status]', expectedText: 'Changes saved' }
  ] },
  'dashboard-long-title': { fixture: dashboardBase('dashboard-long-title', ['Keep the release task title within two lines at both viewports.']), repairChecks: [
    { id: 'task-title-lines', required: true, kind: 'line-count', selector: '.board article p', maxLines: 2 },
    { id: 'save-updates-status', required: true, kind: 'action-changes-ui', role: 'button', name: 'Save changes', statusSelector: '[role=status]', expectedText: 'Changes saved' }
  ] },
  'dashboard-blocked-input': { fixture: dashboardBase('dashboard-blocked-input', ['Keep the drawer owner input usable at both viewports.'], [{ kind: 'click', role: 'button', name: 'Open task drawer', timeoutMs: 2_000 }]), repairChecks: [
    { id: 'owner-accepts-input', required: true, kind: 'input-accepts', role: 'textbox', name: 'Owner', value: 'Avery' },
    { id: 'drawer-save-updates-status', required: true, kind: 'action-changes-ui', scope: '[role="dialog"]', role: 'button', name: 'Save changes', statusSelector: '[role=status]', expectedText: 'Changes saved' }
  ] },
  'dashboard-outside-save': { fixture: dashboardBase('dashboard-outside-save', ['Keep Save changes inside the initial viewport at both viewports.']), repairChecks: [
    { id: 'save-in-viewport', required: true, kind: 'action-in-viewport', role: 'button', name: 'Save changes' },
    { id: 'save-updates-status', required: true, kind: 'action-changes-ui', role: 'button', name: 'Save changes', statusSelector: '[role=status]', expectedText: 'Changes saved' }
  ] }
};

/** Evaluator-only truth. This file is deliberately never copied into a subject. */
export function evaluatorFixtureFor(prepared: PreparedFixture): EvaluatorFixture {
  const fixture = fixtures[prepared.id];
  if (!fixture) throw new Error(`missing evaluator truth for fixture: ${prepared.id}`);
  return fixture;
}
