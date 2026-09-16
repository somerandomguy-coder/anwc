import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './styles.css';

const caseIds = ['title-overflow', 'description-crop', 'blocked-selection', 'hidden-selection'] as const;
type CaseId = typeof caseIds[number];
type Variant = 'broken' | 'healthy';
type Plan = { name: string; description: string };

const plans: Plan[] = [
  { name: 'Starter', description: 'A calm place to collect the work that matters each week.' },
  { name: 'Growth', description: 'Shared planning, reporting, and approvals for teams coordinating complex work.' },
  { name: 'Scale', description: 'Controls and support for organisations with several connected teams.' }
];

function App() {
  const search = new URLSearchParams(location.search);
  const caseId = (caseIds.find((value) => value === search.get('case')) ?? 'title-overflow') as CaseId;
  const variant: Variant = search.get('variant') === 'healthy' ? 'healthy' : 'broken';
  const broken = variant === 'broken';
  const [selected, setSelected] = useState<string | null>(null);

  return <main className="landing-shell" data-anwc-scenario={`pricing-${caseId}-${variant}`}>
    <header><p className="eyebrow">Northstar plans</p><h1>Pricing that grows with your team.</h1><p>Choose a plan, then see a local confirmation. Every case uses this same plan selector.</p></header>
    <nav aria-label="Pricing fixture cases"><span data-fixture-navigation>{caseIds.map((id) => <a key={id} href={`/?case=${id}&variant=${variant}`}>{id}</a>)}<a href={`/?case=${caseId}&variant=${broken ? 'healthy' : 'broken'}`}>View {broken ? 'healthy' : 'broken'}</a></span></nav>
    <section className="plans" aria-label="Pricing plans">{plans.map((plan, index) => {
      const affected = index === 1;
      const cropped = broken && affected && caseId === 'description-crop';
      const hidden = broken && affected && caseId === 'hidden-selection';
      return <article className={`plan ${cropped ? 'description-crop' : ''}`} key={plan.name}>
        <h2 className={broken && affected && caseId === 'title-overflow' ? 'title-overflow' : ''}>{affected ? 'Growth plan for ambitious cross-functional delivery teams' : plan.name}</h2>
        <p>{plan.description}</p>
        <button data-anwc-expect="interactive" className={hidden ? 'hidden-selection' : ''} onClick={() => setSelected(plan.name)}>Choose {plan.name}</button>
        {broken && affected && caseId === 'blocked-selection' && <div className="selection-blocker">Limited offer details</div>}
      </article>;
    })}</section>
    <p id="selection-status" role="status">{selected ? `${selected} plan selected` : 'No plan selected'}</p>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
