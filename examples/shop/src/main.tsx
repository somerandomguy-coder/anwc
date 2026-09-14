import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HmrProbe } from './HmrProbe.js';
import { scenarioFromSearch, type ScenarioId } from './scenarios.js';
import './styles.css';

type Product = { id: string; name: string; price: string; tint: string };

const products: Product[] = [
  { id: 'cloud', name: 'Cloud runner', price: '$84', tint: 'peach' },
  { id: 'moss', name: 'Moss everyday tote', price: '$62', tint: 'mint' },
  { id: 'ink', name: 'Ink insulated bottle', price: '$28', tint: 'lilac' }
];

function CheckoutObstacle({ kind }: { kind: 'blocked' | 'partial' }) {
  return <div className={`obstacle-fixture ${kind}`}><button data-anwc-key={`${kind}-checkout`} data-anwc-expect="interactive">Checkout now</button><div className="cookie-obstacle" aria-label={kind === 'blocked' ? 'Cookie notice blocking checkout' : 'Cookie notice partially blocking checkout'}>Cookie choices</div></div>;
}

function DefectPanel({ scenario }: { scenario: ScenarioId }) {
  if (scenario === 'clean') return null;
  const show = (id: ScenarioId) => scenario === id || scenario === 'combined';
  return <section className="defect-panel" aria-label="Scenario fixture">
    {show('horizontal-overflow') && <div className="overflow-fixture" data-anwc-key="overflow-rail" data-anwc-expect="visible"><span>Limited drop</span><span>North star collection</span><span>Members-only colourway</span><span>Ships this Friday</span></div>}
    {show('ancestor-clip') && <div className="clip-fixture"><button className="clip-action" data-anwc-key="clipped-action" data-anwc-expect="interactive">Start a clipped checkout</button></div>}
    {show('line-budget') && <article className="line-fixture"><p>Featured item</p><h2 data-anwc-key="line-budget-title" data-anwc-max-lines="2">A deliberately long product title that cannot fit in the compact card</h2></article>}
    {show('hidden-checkout') && <button className="hidden-checkout" data-anwc-key="hidden-checkout" data-anwc-expect="interactive">Checkout</button>}
    {show('blocked-checkout') && <CheckoutObstacle kind="blocked" />}
    {show('partial-checkout') && <CheckoutObstacle kind="partial" />}
  </section>;
}

function App() {
  const [cart, setCart] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const scenario = scenarioFromSearch(window.location.search);
  const add = (product: Product) => setCart((items) => [...items, product.name]);
  return (
    <main className="shop-shell" data-anwc-scenario={scenario}>
      <nav className="site-nav" aria-label="Store navigation"><a href="#catalog">Sonder goods</a><div><a href="#catalog">Shop</a><a href="#story">Our story</a><button onClick={() => setModalOpen(true)}>Details</button></div></nav>
      <DefectPanel scenario={scenario} />
      <section className="hero" id="story"><p>Small things, considered</p><h1>Useful objects for unhurried days.</h1><a className="primary-link" href="#catalog">Browse the collection</a></section>
      <section className="catalog" id="catalog" aria-label="Product catalog"><div className="section-heading"><p>New arrivals</p><h2>Everyday favourites</h2></div><div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}><div className={`product-image ${product.tint}`} aria-hidden="true" /><h3>{product.name}</h3><p>{product.price}</p><button onClick={() => add(product)}>Add to cart</button></article>)}</div></section>
      <aside className="cart" aria-live="polite"><div><p>Your cart</p><strong>{cart.length} item{cart.length === 1 ? '' : 's'}</strong></div><button disabled={cart.length === 0} onClick={() => setModalOpen(true)}>Review cart</button></aside>
      <footer><p>Made locally, packed carefully.</p><HmrProbe /></footer>
      {modalOpen && <div className="modal-backdrop" role="presentation"><section className="product-modal" role="dialog" aria-modal="true" aria-label="Cart details"><button className="close" onClick={() => setModalOpen(false)} aria-label="Close details">×</button><h2>{cart.length ? 'Cart updated' : 'A thoughtful cart'}</h2><p>{cart.length ? `${cart[cart.length - 1]} is waiting in your cart.` : 'Add an item to see it here.'}</p></section></div>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
