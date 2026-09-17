import { BenchmarkPlanError } from '../index.js';

export type FixtureApp = 'shop' | 'landing' | 'dashboard';
export type FixtureState = 'broken' | 'healthy';
export type PreparedFixture = { id: string; appId: FixtureApp; caseId: string; requirements: string[]; route: string; setup: Array<Record<string, unknown>>; viewports: Array<{ width: number; height: number }> };
export type FixtureMatrixEntry = { fixtureId: string; appId: FixtureApp; state: FixtureState; route: string; viewport: { width: number; height: number } };

const standardViewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const shopRequirements = ['Preserve the store navigation, product catalogue, cart, and local checkout confirmation.', 'Keep the supplied page usable and readable at both declared viewports.'];
const landingRequirements = ['Preserve all pricing plan content and selection confirmation.', 'Keep the supplied page usable and readable at both declared viewports.'];
const dashboardRequirements = ['Preserve dashboard tabs, the task drawer, note editor, and saved-status feedback.', 'Keep the supplied page usable and readable at both declared viewports.'];

const fixtures: PreparedFixture[] = [
  ...['horizontal-overflow', 'ancestor-clip', 'nested-clip', 'line-budget', 'text-clipped', 'hidden-checkout', 'opacity-checkout', 'blocked-checkout', 'partial-checkout', 'outside-viewport'].map((caseId) => ({ id: `shop-${caseId}`, appId: 'shop' as const, caseId, requirements: shopRequirements, route: '/', setup: [], viewports: standardViewports })),
  { id: 'pricing-title', appId: 'landing', caseId: 'title-overflow', requirements: landingRequirements, route: '/', setup: [], viewports: standardViewports },
  { id: 'pricing-description', appId: 'landing', caseId: 'description-crop', requirements: landingRequirements, route: '/', setup: [], viewports: standardViewports },
  { id: 'pricing-blocked', appId: 'landing', caseId: 'blocked-selection', requirements: landingRequirements, route: '/', setup: [], viewports: standardViewports },
  { id: 'pricing-hidden', appId: 'landing', caseId: 'hidden-selection', requirements: landingRequirements, route: '/', setup: [], viewports: standardViewports },
  { id: 'dashboard-clipped-save', appId: 'dashboard', caseId: 'clipped-save', requirements: dashboardRequirements, route: '/', setup: [], viewports: standardViewports },
  { id: 'dashboard-long-title', appId: 'dashboard', caseId: 'long-title', requirements: dashboardRequirements, route: '/', setup: [], viewports: standardViewports },
  { id: 'dashboard-blocked-input', appId: 'dashboard', caseId: 'blocked-input', requirements: dashboardRequirements, route: '/', setup: [{ kind: 'click', role: 'button', name: 'Open task drawer' }], viewports: standardViewports },
  { id: 'dashboard-outside-save', appId: 'dashboard', caseId: 'outside-save', requirements: dashboardRequirements, route: '/', setup: [], viewports: standardViewports }
];

export function allFixtures(): readonly PreparedFixture[] { return fixtures; }
export function fixtureMatrix(): readonly FixtureMatrixEntry[] { return fixtures.flatMap((fixture) => fixture.viewports.flatMap((viewport) => (['broken', 'healthy'] as const).map((state) => ({ fixtureId: fixture.id, appId: fixture.appId, state, route: fixture.route, viewport })))); }
export function fixtureFor(id: string): PreparedFixture { const fixture = fixtures.find((candidate) => candidate.id === id); if (!fixture) throw new BenchmarkPlanError([`unknown fixture: ${id}`]); return fixture; }

function materializePublicApp(source: string, fixture: PreparedFixture, state: FixtureState): string {
  const withoutTypes = source.replace(/const caseIds = \[.*?\] as const;\r?\ntype CaseId = typeof caseIds\[number\];\r?\ntype Variant = 'broken' \| 'healthy';\r?\n/, '');
  const frozenState = withoutTypes.replace(/\s*const (?:search|query) = new URLSearchParams\(location\.search\);\r?\n\s*const caseId = .*?;\r?\n\s*const variant: Variant = .*?;\r?\n\s*const broken = variant === 'broken';/, `\n  const broken = ${state === 'broken'};`);
  const selected = (caseId: string): string => String(state === 'broken' && caseId === fixture.caseId);
  return frozenState.replace(/\s*<span data-fixture-navigation>.*?<\/span>/, '').replace(/caseId === '([^']+)'/g, (_match, caseId: string) => selected(caseId)).replace(/current === '([^']+)'/g, (_match, caseId: string) => selected(caseId)).replace(/\s*const current = broken && caseId;/, '').replace(/data-anwc-scenario=(?:\{`[^`]+`\}|"[^"]*")/, 'data-subject="prepared"');
}

function shopDefect(caseId: string, state: FixtureState): { markup: string; styles: string } {
  const action = '<button data-anwc-key="subject-checkout" data-anwc-expect="interactive" className="checkout-action" onClick={checkout}>Checkout now</button>';
  const defects: Record<string, { markup: string; styles: string }> = {
    'horizontal-overflow': { markup: '<section className="subject-rail"><div data-anwc-key="subject-rail" data-anwc-expect="visible" className="subject-rail-track"><span>Limited drop</span><span>North star collection</span><span>Members-only colourway</span></div></section>', styles: '.subject-rail{overflow:hidden;border:1px solid #b56b55}.subject-rail-track{display:flex;width:52rem;gap:2rem}.subject-rail-track span{width:16rem;flex:none}' },
    'ancestor-clip': { markup: `<section className="subject-frame">${action}</section>`, styles: '.subject-frame{width:12rem;overflow:hidden}.checkout-action{width:28rem}' },
    'nested-clip': { markup: `<section className="subject-frame"><div className="subject-inner">${action}</div></section>`, styles: '.subject-frame{width:15rem;overflow:hidden}.subject-inner{width:11rem;overflow:hidden}.checkout-action{width:28rem}' },
    'line-budget': { markup: '<section className="subject-card"><h2 data-anwc-key="subject-title" data-anwc-max-lines="2">A deliberately long product title that cannot fit in the compact card</h2></section>', styles: '.subject-card{width:12rem}.subject-card h2{font-size:1.1rem}' },
    'text-clipped': { markup: '<section className="subject-card"><h2 data-anwc-key="subject-title" data-anwc-expect="visible">A detailed product description that extends below a deliberately cropped preview card</h2></section>', styles: '.subject-card{width:14rem;height:4.8rem;overflow:hidden}.subject-card h2{line-height:1.3}' },
    'hidden-checkout': { markup: action, styles: '.checkout-action{display:none}' },
    'opacity-checkout': { markup: action, styles: '.checkout-action{opacity:0}' },
    'blocked-checkout': { markup: `<section className="subject-obstacle">${action}<div className="notice">Cookie choices</div></section>`, styles: '.subject-obstacle{position:relative;width:16rem;height:4rem}.subject-obstacle .checkout-action{width:100%;height:100%}.notice{position:absolute;inset:0;background:#24302d;color:white;display:grid;place-items:center}' },
    'partial-checkout': { markup: `<section className="subject-obstacle">${action}<div className="notice">Cookie choices</div></section>`, styles: '.subject-obstacle{position:relative;width:16rem;height:4rem}.subject-obstacle .checkout-action{width:100%;height:100%}.notice{position:absolute;inset:0 auto 0 0;width:55%;background:#24302d;color:white;display:grid;place-items:center}' },
    'outside-viewport': { markup: action, styles: '.checkout-action{margin-top:120vh}' }
  };
  const defect = defects[caseId]; if (!defect) throw new BenchmarkPlanError([`unsupported shop fixture: ${caseId}`]); return defect;
}

function shopHealthy(caseId: string): { markup: string; styles: string } {
  const action = '<button data-anwc-key="subject-checkout" data-anwc-expect="interactive" className="checkout-action" onClick={checkout}>Checkout now</button>';
  const states: Record<string, { markup: string; styles: string }> = {
    'horizontal-overflow': { markup: '<section className="subject-rail"><div data-anwc-key="subject-rail" data-anwc-expect="visible" className="subject-rail-track"><span>Limited drop</span><span>North star collection</span><span>Members-only colourway</span></div></section>', styles: '.subject-rail-track{display:flex;flex-wrap:wrap;gap:.75rem}.subject-rail-track span{flex:1 1 12rem}' },
    'ancestor-clip': { markup: `<section className="subject-frame">${action}</section>`, styles: '.checkout-action{width:100%}' },
    'nested-clip': { markup: `<section className="subject-frame"><div className="subject-inner">${action}</div></section>`, styles: '.subject-inner{width:100%}.checkout-action{width:100%}' },
    'line-budget': { markup: '<section className="subject-card"><h2 data-anwc-key="subject-title" data-anwc-max-lines="2">A deliberately long product title that cannot fit in the compact card</h2></section>', styles: '.subject-card{width:100%}.subject-card h2{font-size:.85rem;line-height:1.2}' },
    'text-clipped': { markup: '<section className="subject-card"><h2 data-anwc-key="subject-title" data-anwc-expect="visible">A detailed product description that extends below a deliberately cropped preview card</h2></section>', styles: '.subject-card{width:100%;height:auto}.subject-card h2{line-height:1.3}' },
    'hidden-checkout': { markup: action, styles: '' }, 'opacity-checkout': { markup: action, styles: '' },
    'blocked-checkout': { markup: `<section className="subject-obstacle">${action}<div className="notice">Cookie choices</div></section>`, styles: '.subject-obstacle{width:16rem}.notice{position:static;margin-top:.5rem;background:#24302d;color:white;padding:.75rem}' },
    'partial-checkout': { markup: `<section className="subject-obstacle">${action}<div className="notice">Cookie choices</div></section>`, styles: '.subject-obstacle{width:16rem}.notice{position:static;margin-top:.5rem;background:#24302d;color:white;padding:.75rem}' },
    'outside-viewport': { markup: action, styles: '' }
  };
  const healthy = states[caseId]; if (!healthy) throw new BenchmarkPlanError([`unsupported shop fixture: ${caseId}`]); return healthy;
}

function materializeShopSource(fixture: PreparedFixture, state: FixtureState): string {
  const defect = state === 'broken' ? shopDefect(fixture.caseId, state) : shopHealthy(fixture.caseId);
  return `import { createRoot } from 'react-dom/client';\nimport { useState } from 'react';\nimport './styles.css';\n\ntype Product = { id: string; name: string; price: string };\nconst products: Product[] = [{ id: 'cloud', name: 'Cloud runner', price: '$84' }, { id: 'moss', name: 'Moss everyday tote', price: '$62' }, { id: 'ink', name: 'Ink insulated bottle', price: '$28' }];\nfunction App() {\n  const [cart, setCart] = useState<string[]>([]); const [confirmed, setConfirmed] = useState(false);\n  const checkout = () => setConfirmed(true);\n  return <main className="shop-shell" data-subject="prepared"><nav aria-label="Store navigation"><a href="/">Sonder goods</a><span><a href="/catalog">Shop</a><a href="/checkout">Checkout</a><a href="/account">Account</a></span></nav><section className="hero"><p>Small things, considered</p><h1>Useful objects for unhurried days.</h1></section><section className="subject-area">${defect.markup}</section><section className="catalog" aria-label="Product catalog"><h2>Everyday favourites</h2><div className="product-grid">{products.map((product) => <article key={product.id}><div className="product-image" /><h3>{product.name}</h3><p>{product.price}</p><button onClick={() => setCart((items) => [...items, product.id])}>Add to cart</button></article>)}</div></section><aside className="cart" aria-live="polite"><strong>{cart.length} item{cart.length === 1 ? '' : 's'}</strong><button onClick={checkout}>Review cart</button></aside><p role="status">{confirmed ? 'Checkout confirmed' : 'Checkout pending'}</p></main>;\n}\ncreateRoot(document.getElementById('root')!).render(<App />);\n`;
}

function materializeShopStyles(fixture: PreparedFixture, state: FixtureState): string {
  const defect = state === 'broken' ? shopDefect(fixture.caseId, state) : shopHealthy(fixture.caseId);
  return `:root{font-family:ui-sans-serif,system-ui;color:#21302a;background:#f7f5ef}*{box-sizing:border-box}body{margin:0}button,a{font:inherit}.shop-shell{width:min(70rem,calc(100% - 2rem));margin:auto}.shop-shell nav,.cart{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:1rem 0}.shop-shell nav a{color:inherit;margin-right:1rem}.hero{padding:2rem 0}.hero h1{font-family:Georgia,serif;font-size:clamp(2.8rem,7vw,5.8rem);font-weight:500}.product-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.product-grid article{background:white;border-radius:1rem;padding:1rem}.product-image{height:7rem;border-radius:.7rem;background:#b9ddca}.product-grid button,.checkout-action{border:0;border-radius:999px;background:#27493e;color:white;padding:.75rem 1rem}.cart{background:#dfe9d7;border-radius:1rem;margin:2rem 0;padding:1rem}.subject-area{margin:2rem 0}.subject-card,.subject-frame,.subject-obstacle,.subject-rail{border-radius:.7rem;padding:1rem;background:white}.notice{border-radius:.7rem}.subject-rail-track{padding:1rem}.subject-rail-track span{display:block}.subject-card h2{margin:0}@media(max-width:640px){.product-grid{grid-template-columns:1fr}}\n${defect.styles}\n`;
}

/** Freezes one app state. Public preview switching is never copied to an agent subject. */
export function materializeFixtureSource(source: string, fixture: PreparedFixture, state: FixtureState = 'broken'): string { return fixture.appId === 'shop' ? materializeShopSource(fixture, state) : materializePublicApp(source, fixture, state); }
export function materializeFixtureStyles(source: string, fixture: PreparedFixture, state: FixtureState = 'broken'): string { if (fixture.appId === 'shop') return materializeShopStyles(fixture, state); const classByCase: Record<string, string> = fixture.appId === 'landing' ? { 'title-overflow': 'title-overflow', 'description-crop': 'description-crop', 'blocked-selection': 'selection-blocker', 'hidden-selection': 'hidden-selection' } : { 'clipped-save': 'save-clip', 'long-title': 'long-title', 'blocked-input': 'input-blocker', 'outside-save': 'outside-save' }; return Object.entries(classByCase).filter(([caseId]) => state === 'healthy' || caseId !== fixture.caseId).reduce((materialized, [, className]) => materialized.replace(new RegExp(`\\.${className}\\s*\\{[^}]*\\}`, 'g'), ''), source); }

export function taskMarkdown(fixture: PreparedFixture): string {
  const setup = fixture.setup.length === 0
    ? 'No interaction is required before the initial viewport checks.'
    : fixture.setup.map((step) => step.kind === 'click' ? `Before the stated interaction, click the ${String(step.name)} ${String(step.role)}.` : `Apply the recorded ${String(step.kind)} setup step before the stated interaction.`).join(' ');
  return `# Repair task\n\n${fixture.requirements.map((requirement) => `- ${requirement}`).join('\n')}\n\n## Evaluation environment\n\n- Viewports: ${fixture.viewports.map((item) => `${item.width}×${item.height}`).join(', ')}\n- Start URL: http://127.0.0.1:PORT${fixture.route}\n- Setup: ${setup}\n- Editable paths: examples/${fixture.appId}/src/**\n- Install: npm ci\n- Develop: npm run dev\n- Build: npm run build\n\nMake the repair in the editable application source while preserving the stated behavior.\n`;
}
