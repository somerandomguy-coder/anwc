import { lazy, StrictMode, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureVariantFromSearch, scenarioFromSearch, scenarioIds, type FixtureVariant, type ScenarioId } from './scenarios.js';
import './styles.css';

type Product = { id: string; name: string; price: string; tint: string };
type Modal = { kind: 'cart' | 'checkout'; title: string; message: string } | null;

const HmrProbe = lazy(async () => ({ default: (await import('./HmrProbe.js')).HmrProbe }));

const products: Product[] = [
  { id: 'cloud', name: 'Cloud runner', price: '$84', tint: 'peach' },
  { id: 'moss', name: 'Moss everyday tote', price: '$62', tint: 'mint' },
  { id: 'ink', name: 'Ink insulated bottle', price: '$28', tint: 'lilac' }
];

const cartStorageKey = 'anwc-shop-cart-v1';
const productIds = new Set(products.map((product) => product.id));

function loadCart(): string[] {
  try {
    const stored = sessionStorage.getItem(cartStorageKey);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length > 99 || parsed.some((id) => typeof id !== 'string' || !productIds.has(id))) {
      sessionStorage.removeItem(cartStorageKey);
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function saveCart(cart: string[]): void {
  try {
    sessionStorage.setItem(cartStorageKey, JSON.stringify(cart));
  } catch {
    // The demo continues if browser storage is unavailable.
  }
}

function CheckoutObstacle({ kind, onCheckout }: { kind: 'blocked' | 'partial'; onCheckout: () => void }) {
  return <div className={`obstacle-fixture ${kind}`}><button data-anwc-key={`${kind}-checkout`} data-anwc-expect="interactive" onClick={onCheckout}>Checkout now</button><div className="cookie-obstacle" aria-label={kind === 'blocked' ? 'Cookie notice blocking checkout' : 'Cookie notice partially blocking checkout'}>Cookie choices</div></div>;
}

function DefectPanel({ scenario, variant, onCheckout }: { scenario: ScenarioId; variant: FixtureVariant; onCheckout: () => void }) {
  if (scenario === 'clean') return null;
  const show = (id: ScenarioId) => scenario === id || scenario === 'combined';
  return <section className={`defect-panel fixture-variant-${variant}`} aria-label="Scenario fixture">
    {show('horizontal-overflow') && <div className="overflow-fixture" data-anwc-key="overflow-rail" data-anwc-expect="visible"><span>Limited drop</span><span>North star collection</span><span>Members-only colourway</span><span>Ships this Friday</span></div>}
    {show('ancestor-clip') && <div className="clip-fixture"><button className="clip-action" data-anwc-key="clipped-action" data-anwc-expect="interactive" onClick={onCheckout}>Start a clipped checkout</button></div>}
    {show('nested-clip') && <div className="nested-clip"><div className="nested-clip-inner"><button className="nested-clip-action" data-anwc-key="nested-clipped-action" data-anwc-expect="interactive" onClick={onCheckout}>Nested clipped checkout action</button></div></div>}
    {show('line-budget') && <article className="line-fixture"><p>Featured item</p><h2 data-anwc-key="line-budget-title" data-anwc-max-lines="2">A deliberately long product title that cannot fit in the compact card</h2></article>}
    {show('text-clipped') && <article className="text-clip-fixture"><p>Preview card</p><h2 data-anwc-key="text-clipped-title">A detailed product description that extends below a deliberately cropped preview card</h2></article>}
    {show('hidden-checkout') && <button className="hidden-checkout" data-anwc-key="hidden-checkout" data-anwc-expect="interactive" onClick={onCheckout}>Checkout</button>}
    {show('opacity-checkout') && <button className="opacity-checkout" data-anwc-key="opacity-checkout" data-anwc-expect="interactive" onClick={onCheckout}>Opacity-hidden checkout</button>}
    {show('blocked-checkout') && <CheckoutObstacle kind="blocked" onCheckout={onCheckout} />}
    {show('partial-checkout') && <CheckoutObstacle kind="partial" onCheckout={onCheckout} />}
    {show('outside-viewport') && <button className="outside-viewport" data-anwc-key="outside-viewport-checkout" data-anwc-expect="interactive" onClick={onCheckout}>Checkout below the initial viewport</button>}
  </section>;
}

function Navigation({ onDetails }: { onDetails: () => void }) {
  return <nav className="site-nav" aria-label="Store navigation"><a className="brand" href="/"><span className="brand-mark" aria-hidden="true">S</span>Sonder goods</a><div><a href="/catalog">Shop</a><a href="/checkout">Checkout</a><a href="/account">Account</a><a href="/lab">Fixture lab</a><button onClick={onDetails}>Details</button></div></nav>;
}

function StorePage({ page, cart, add, onDetails }: { page: 'home' | 'catalog' | 'checkout' | 'account'; cart: string[]; add: (product: Product) => void; onDetails: () => void }) {
  const title = page === 'catalog' ? 'Everyday goods, made to last.' : page === 'checkout' ? 'Your quiet corner of the cart.' : page === 'account' ? 'Orders and details, in one place.' : 'Useful objects for unhurried days.';
  return <>
    <section className={`hero ${page === 'home' ? '' : 'subpage-hero'}`} id="story"><p>{page === 'home' ? 'Small things, considered' : page === 'catalog' ? 'The collection' : page === 'checkout' ? 'Checkout preview' : 'Your account'}</p><h1>{title}</h1>{page === 'home' && <a className="primary-link" href="/catalog">Browse the collection</a>}{page === 'checkout' && <p className="page-copy">Your cart is held in this browser session. Add a product from the catalogue, then review it here.</p>}{page === 'account' && <p className="page-copy">This local account page gives agents another normal route to inspect while preserving a small, deterministic fixture.</p>}</section>
    {(page === 'home' || page === 'catalog') && <section className="catalog" id="catalog" aria-label="Product catalog"><div className="section-heading"><p>New arrivals</p><h2>Everyday favourites</h2></div><div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}><div className={`product-image ${product.tint}`} aria-hidden="true" /><h3>{product.name}</h3><p>{product.price}</p><button onClick={() => add(product)}>Add to cart</button></article>)}</div></section>}
    <aside className="cart" aria-live="polite"><div><p>Your cart</p><strong>{cart.length} item{cart.length === 1 ? '' : 's'}</strong></div><button disabled={cart.length === 0} onClick={onDetails}>Review cart</button></aside>
  </>;
}

function FixtureLab({ scenario, variant, onDetails, onCheckout }: { scenario: ScenarioId; variant: FixtureVariant; onDetails: () => void; onCheckout: () => void }) {
  return <main className="shop-shell fixture-lab" data-anwc-scenario={scenario}>
    <Navigation onDetails={onDetails} />
    <section className="lab-intro"><p>Public ANWC fixture lab</p><h1>One visible defect at a time.</h1><p>Use these cases to learn the workflow. They are intentionally answer-bearing and are never suitable as blinded evaluation subjects.</p><p>Try the checkout action in each case. Once its layout issue is repaired, it opens a local confirmation.</p>{scenario !== 'clean' && scenario !== 'combined' && <p><a href={`/lab?case=${scenario}&variant=${variant === 'broken' ? 'healthy' : 'broken'}`}>View the {variant === 'broken' ? 'healthy' : 'broken'} counterpart</a></p>}</section>
    <nav className="lab-cases" aria-label="Fixture cases">{scenarioIds.filter((id) => id !== 'clean' && id !== 'combined').map((id) => <a key={id} className={scenario === id ? 'active' : ''} href={`/lab?case=${id}&variant=${variant}`}>{id}</a>)}</nav>
    <DefectPanel scenario={scenario} variant={variant} onCheckout={onCheckout} />
  </main>;
}

function ConfirmationModal({ modal, onClose }: { modal: Modal; onClose: () => void }) {
  if (!modal) return null;
  return <div className="modal-backdrop" role="presentation"><section className="product-modal" role="dialog" aria-modal="true" aria-label={modal.kind === 'cart' ? 'Cart details' : 'Checkout confirmation'}><button className="close" onClick={onClose} aria-label="Close details">×</button><h2>{modal.title}</h2><p>{modal.message}</p></section></div>;
}

function App() {
  const [cart, setCart] = useState(loadCart);
  const [modal, setModal] = useState<Modal>(null);
  const [showProbe, setShowProbe] = useState(false);
  const path = window.location.pathname;
  const search = new URLSearchParams(window.location.search);
  const requestedScenario = search.get('case') ?? search.get('scenario');
  const scenario = path === '/lab' && !requestedScenario ? 'blocked-checkout' : scenarioFromSearch(window.location.search);
  const variant = fixtureVariantFromSearch(window.location.search);
  const page: 'home' | 'catalog' | 'checkout' | 'account' = path === '/catalog' ? 'catalog' : path === '/checkout' ? 'checkout' : path === '/account' ? 'account' : 'home';
  const add = (product: Product) => setCart((items) => {
    const next = [...items, product.id];
    saveCart(next);
    return next;
  });
  const openDetails = () => {
    const latest = products.find((product) => product.id === cart[cart.length - 1]);
    setModal({ kind: 'cart', title: latest ? 'Cart updated' : 'A thoughtful cart', message: latest ? `${latest.name} is waiting in your cart.` : 'Add an item to see it here.' });
  };
  const confirmCheckout = () => setModal({ kind: 'checkout', title: 'Checkout confirmed', message: 'The checkout action reached its local confirmation.' });
  const content = path === '/lab'
    ? <FixtureLab scenario={scenario} variant={variant} onDetails={openDetails} onCheckout={confirmCheckout} />
    : <main className="shop-shell" data-anwc-scenario={scenario}><Navigation onDetails={openDetails} /><DefectPanel scenario={scenario} variant={variant} onCheckout={confirmCheckout} /><StorePage page={page} cart={cart} add={add} onDetails={openDetails} /><footer><p>Made locally, packed carefully.</p><button onClick={() => setShowProbe(true)}>Load source probe</button>{showProbe && <Suspense fallback={<p>Loading source probe</p>}><HmrProbe /></Suspense>}</footer></main>;
  return <>{content}<ConfirmationModal modal={modal} onClose={() => setModal(null)} /></>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
