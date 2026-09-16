import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './styles.css';

const caseIds = ['clipped-save', 'long-title', 'blocked-input', 'outside-save'] as const;
type CaseId = typeof caseIds[number];
type Variant = 'broken' | 'healthy';

function App() {
  const query = new URLSearchParams(location.search);
  const caseId = (caseIds.find((item) => item === query.get('case')) ?? 'clipped-save') as CaseId;
  const variant: Variant = query.get('variant') === 'healthy' ? 'healthy' : 'broken';
  const broken = variant === 'broken';
  const [tab, setTab] = useState<'overview' | 'tasks'>('overview');
  const [drawer, setDrawer] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState('');
  const current = broken && caseId;
  const save = <button className={current === 'outside-save' ? 'outside-save' : ''} data-anwc-expect="interactive" onClick={() => setSaved(true)}>Save changes</button>;
  return <main className="dashboard" data-anwc-scenario={`dashboard-${caseId}-${variant}`}>
    <header><div><p className="eyebrow">Atlas workspace</p><h1>Project delivery</h1></div><button onClick={() => setDrawer(true)}>Open task drawer</button></header>
    <nav aria-label="Dashboard tabs"><button onClick={() => setTab('overview')} aria-pressed={tab === 'overview'}>Overview</button><button onClick={() => setTab('tasks')} aria-pressed={tab === 'tasks'}>Tasks</button>{caseIds.map((id) => <a href={`/?case=${id}&variant=${variant}`}>{id}</a>)}<a href={`/?case=${caseId}&variant=${broken ? 'healthy' : 'broken'}`}>View {broken ? 'healthy' : 'broken'}</a></nav>
    <section className="content"><section className="board"><h2>{tab === 'overview' ? 'This week' : 'Task list'}</h2><article><p className={current === 'long-title' ? 'long-title' : ''}>Coordinate research, content, engineering, and customer review before release</p><small>Due Friday</small></article><div className="table" aria-label="Activity table"><p>Activity</p><p>Design review</p><p>Research summary</p><p>Release checklist</p><p>Customer notes</p><p>Decision log</p></div></section><aside className={current === 'clipped-save' ? 'save-clip' : ''}><h2>Project notes</h2><label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>{save}</aside></section>
    {drawer && <div className="drawer-backdrop"><section className="drawer" role="dialog" aria-label="Task drawer"><button onClick={() => setDrawer(false)}>Close drawer</button><h2>Release task</h2><label>Owner<input aria-label="Owner" defaultValue="Mina" /></label>{current === 'blocked-input' && <div className="input-blocker">Review in progress</div>}<p>{save}</p></section></div>}
    <p role="status">{saved ? 'Changes saved' : 'Unsaved changes'}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
