import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Bot, Check, ChevronRight, Heart, LoaderCircle,
  LogOut, PackageCheck, Search, ShieldCheck, Shirt, ShoppingBag, SlidersHorizontal,
  Sparkles, Store, UserRound, X
} from 'lucide-react';
import { apiRequest, getCachedProducts, getProductId, signOutSupabase } from './api.js';
import { products as demoProducts } from './data/products.js';
import AppHeader from './components/AppHeader.jsx';
import AiDiscovery from './components/AiDiscovery.jsx';
import BottomNavigation from './components/BottomNavigation.jsx';
import ProductCard from './components/ProductCard.jsx';
import './styles.css';

const categories = ['All', 'Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes'];
const money = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH')}`;

function storedUser() {
  try {
    return JSON.parse(localStorage.getItem('rj-user') || 'null');
  } catch {
    return null;
  }
}

function storedFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem('rj-favorites') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('Home');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [demoCatalogActive, setDemoCatalogActive] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [favorites, setFavorites] = useState(storedFavorites);
  const [token, setToken] = useState(() => localStorage.getItem('rj-token'));
  const [user, setUser] = useState(storedUser);
  const [cartItems, setCartItems] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [orders, setOrders] = useState([]);
  const [cachedCatalogActive, setCachedCatalogActive] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  const navigateTo = (screen) => {
    if (screen === activeTab) return;
    window.history.pushState({ screen }, '', `#${screen.toLowerCase()}`);
    setActiveTab(screen);
  };

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (category !== 'All') params.set('category', category);
    params.set('limit', '50');
    return params.toString();
  }, [category, search]);

  useEffect(() => {
    let active = true;
    if (demoCatalogActive) {
      setLoadingProducts(false);
      return () => { active = false; };
    }
    setLoadingProducts(true);
    apiRequest(`/products?${query}`)
      .then((result) => {
        if (!active) return;
        setApiAvailable(true);
        if (result.length === 0 && !search.trim() && category === 'All') {
          setProducts(demoProducts);
          setDemoCatalogActive(true);
          setFallbackMessage('The database has no seeded products yet. Showing sample pieces; run npm run seed to load the live catalog.');
          return;
        }
        setProducts(result);
      })
      .catch((error) => {
        if (active) {
          const cachedProducts = getCachedProducts();
          setApiAvailable(false);
          setProducts(cachedProducts.length ? cachedProducts : demoProducts);
          setDemoCatalogActive(true);
          setCachedCatalogActive(cachedProducts.length > 0);
          setFallbackMessage(cachedProducts.length
            ? 'Offline mode · Showing your previously saved catalog. Availability and checkout need a connection.'
            : 'The shop API is unavailable. Showing sample pieces for browsing; purchases need the backend.');
          setNotice(error.message);
        }
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });
    return () => { active = false; };
  }, [query, demoCatalogActive, search, category]);

  const displayedProducts = useMemo(() => {
    if (!demoCatalogActive) return products;
    const text = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      const matchesSearch = !text || product.name.toLowerCase().includes(text) || product.category.toLowerCase().includes(text);
      return matchesCategory && matchesSearch;
    });
  }, [category, demoCatalogActive, products, search]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'return') {
      setNotice('You returned from checkout. Payment is confirmed only after Maya verification; check Orders for the current status.');
    } else if (params.get('payment') === 'failure') {
      setNotice('Maya could not complete the payment. Check Orders for the current status or try checkout again.');
    } else if (params.get('payment') === 'cancel') {
      setNotice('Checkout was cancelled. Your order remains unpaid; you can retry or cancel it from Orders.');
    }
  }, []);

  useEffect(() => {
    const updateOnlineStatus = () => setNetworkOnline(navigator.onLine);
    const handleBackNavigation = () => {
      setActiveTab(window.history.state?.screen || 'Home');
      setSelectedProduct(null);
    };
    window.history.replaceState({ screen: activeTab }, '', `${window.location.pathname}${window.location.search}`);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    window.addEventListener('popstate', handleBackNavigation);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('popstate', handleBackNavigation);
    };
  }, []);

  useEffect(() => {
    if (!selectedProduct) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedProduct(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedProduct]);

  useEffect(() => {
    localStorage.setItem('rj-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setCartItems([]);
      return;
    }
    apiRequest('/auth/me', { token })
      .then((currentUser) => {
        setUser(currentUser);
        localStorage.setItem('rj-user', JSON.stringify(currentUser));
      })
      .catch(() => clearSession());
    apiRequest('/cart', { token })
      .then((cart) => setCartItems(cart.items))
      .catch((error) => setNotice(error.message));
  // Session is validated whenever the bearer token changes.
  }, [token]);

  useEffect(() => {
    if (activeTab !== 'Bag' || !token) return;
    apiRequest('/cart', { token }).then((cart) => setCartItems(cart.items)).catch((error) => setNotice(error.message));
  }, [activeTab, token]);

  useEffect(() => {
    if (activeTab !== 'Orders' || !token) return;
    apiRequest('/orders', { token }).then(setOrders).catch((error) => setNotice(error.message));
  }, [activeTab, token]);

  async function clearSession() {
    try {
      await signOutSupabase();
    } catch (error) {
      setNotice(error.message);
    }
    localStorage.removeItem('rj-token');
    localStorage.removeItem('rj-user');
    setToken(null);
    setUser(null);
    setCartItems([]);
  }

  function saveSession(session) {
    localStorage.setItem('rj-token', session.token);
    localStorage.setItem('rj-user', JSON.stringify(session.user));
    setToken(session.token);
    setUser(session.user);
    navigateTo('Home');
    setNotice(`Welcome, ${session.user.name}.`);
  }

  function retryCatalog() {
    setDemoCatalogActive(false);
    setCachedCatalogActive(false);
    setApiAvailable(true);
    setFallbackMessage('');
    setLoadingProducts(true);
  }

  async function addToCart(product) {
    if (!apiAvailable || demoCatalogActive) {
      setNotice('Sample catalog pieces are for browsing only. Connect the shop API to purchase.');
      return;
    }
    if (!token) {
      setSelectedProduct(null);
      navigateTo('Account');
      setNotice('Sign in to save a piece to your bag.');
      return;
    }
    try {
      const cart = await apiRequest('/cart/items', {
        token,
        method: 'POST',
        body: JSON.stringify({ productId: getProductId(product) })
      });
      setCartItems(cart.items);
      setSelectedProduct(null);
      navigateTo('Bag');
      setNotice('Added to your bag.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function removeFromCart(product) {
    try {
      const cart = await apiRequest(`/cart/items/${getProductId(product)}`, { token, method: 'DELETE' });
      setCartItems(cart.items ?? []);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function submitAiRequest(event) {
    event.preventDefault();
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setAiResult(null);
    try {
      setAiResult(await apiRequest('/ai/discover', { method: 'POST', body: JSON.stringify({ prompt: aiPrompt }) }));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setAiBusy(false);
    }
  }

  async function cancelOrder(orderId) {
    try {
      await apiRequest(`/orders/${orderId}/cancel`, { token, method: 'POST' });
      setOrders((current) => current.map((order) => order._id === orderId ? { ...order, status: 'cancelled' } : order));
      const cart = await apiRequest('/cart', { token });
      setCartItems(cart.items);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function verifyOrder(orderId) {
    try {
      const result = await apiRequest(`/orders/${orderId}/verify-payment`, { token, method: 'POST' });
      setOrders((current) => current.map((order) => order._id === orderId ? result.order : order));
      setNotice(result.paid ? 'Payment verified. Your order is paid.' : result.mismatch ? 'Payment amount or currency needs administrator review.' : 'Payment is not confirmed yet. Try again shortly.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  const cartTotal = cartItems.reduce((sum, item) => sum + (item.lineTotal ?? item.product.price), 0);

  function renderProducts(list) {
    if (loadingProducts) return <div className="loading-state"><LoaderCircle className="spin" /> Finding available pieces…</div>;
    if (!list.length) return <div className="empty-state"><Shirt size={38} /><h3>No pieces found</h3><p>Try a different search or category.</p></div>;
    return (
      <div className="product-grid">
        {list.map((product) => {
          const id = getProductId(product);
          const liked = favorites.includes(id);
          const availability = cachedCatalogActive
            ? 'Saved for offline'
            : demoCatalogActive ? 'Sample piece' : product.stock > 0 ? 'One available' : 'Sold';
          return <ProductCard
            key={id}
            product={product}
            liked={liked}
            availability={availability}
            onOpen={setSelectedProduct}
            onToggleFavorite={(item) => setFavorites((current) => {
              const productId = getProductId(item);
              return current.includes(productId)
                ? current.filter((value) => value !== productId)
                : [...current, productId];
            })}
          />;
        })}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader
        activeTab={activeTab}
        user={user}
        onHome={() => navigateTo('Home')}
        onBack={() => window.history.back()}
        onAccount={() => navigateTo('Account')}
      />

      {notice && <div className="notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}

      {!networkOnline && <div className="connection-banner" role="status"><span className="connection-dot" /> Offline · Showing saved content where available</div>}

      <main key={activeTab} className="screen-transition">
        {activeTab === 'Home' && (
          <section className="page">
            <div className="hero home-welcome">
              <div>
                <span className="eyebrow">CURATED FOR YOU</span>
                <h1>Good finds.<br /><em>Second stories.</em></h1>
                <button className="hero-cta" type="button" onClick={() => navigateTo('Shop')}>Explore the drop <ArrowRight size={17} /></button>
              </div>
              <div className="hero-badge"><Sparkles size={18} /><span>One of a kind<br />by nature</span></div>
            </div>

            <div className="search-row">
              <label className="search-box"><Search size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pieces" aria-label="Search pieces" /></label>
              <button className="filter-button" type="button" aria-label="Show filters" onClick={() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><SlidersHorizontal size={20} /></button>
            </div>

            <div className="category-row" id="categories" aria-label="Product categories">
              {categories.map((item) => <button key={item} className={category === item ? 'category active' : 'category'} type="button" onClick={() => setCategory(item)}>{item}</button>)}
            </div>

            {demoCatalogActive && <div className="offline-banner" role="status"><p>{fallbackMessage}</p><button type="button" onClick={retryCatalog}>Retry connection</button></div>}
            <div className="section-heading"><h2>{category === 'All' ? 'Fresh finds' : category}</h2><button className="section-action" type="button" onClick={() => navigateTo('Shop')}>See all</button></div>
            {renderProducts(displayedProducts)}

            <AiDiscovery
              prompt={aiPrompt}
              onPromptChange={setAiPrompt}
              onSubmit={submitAiRequest}
              busy={aiBusy}
              available={apiAvailable && !demoCatalogActive}
              result={aiResult}
              onOpenProduct={setSelectedProduct}
            />
          </section>
        )}

        {activeTab === 'Shop' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Shop the drop</h1><span>{displayedProducts.length} pieces</span></div>
            <label className="search-box shop-search"><Search size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pieces" aria-label="Search pieces" /></label>
            <div className="category-row">{categories.map((item) => <button key={item} className={category === item ? 'category active' : 'category'} type="button" onClick={() => setCategory(item)}>{item}</button>)}</div>
            {demoCatalogActive && <div className="offline-banner" role="status"><p>{fallbackMessage}</p><button type="button" onClick={retryCatalog}>Retry connection</button></div>}
            {renderProducts(displayedProducts)}
          </section>
        )}

        {activeTab === 'Bag' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Your bag</h1><span>{cartItems.length} {cartItems.length === 1 ? 'piece' : 'pieces'}</span></div>
            {!token ? <SignInPrompt onSignIn={() => navigateTo('Account')} /> : cartItems.length ? (
              <CheckoutPanel items={cartItems} subtotal={cartTotal} token={token} busy={busy} setBusy={setBusy} onRemove={removeFromCart} onNotice={setNotice} />
            ) : <div className="empty-state"><ShoppingBag size={38} /><h3>Your bag is empty</h3><p>Each piece is one-of-a-kind. Find yours before it is gone.</p><button type="button" onClick={() => navigateTo('Shop')}>Browse the drop</button></div>}
          </section>
        )}

        {activeTab === 'Orders' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Your orders</h1><span>{orders.length} total</span></div>
            {!token ? <SignInPrompt onSignIn={() => navigateTo('Account')} /> : orders.length ? (
              <div className="orders-list">{orders.map((order) => (
                <article className="order-card" key={order._id}>
                  <div className="order-title"><div><span>Order</span><strong>#{order._id.slice(-7).toUpperCase()}</strong></div><span className={`status-pill status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span></div>
                  <p>{order.items.map((item) => item.name).join(', ')}</p>
                  <div className="order-foot"><span>{new Date(order.createdAt).toLocaleDateString()}</span><strong>{money(order.total)}</strong></div>
                  {order.status === 'pending_payment' && <button className="text-button" type="button" onClick={() => verifyOrder(order._id)}>Check payment status</button>}
                  {order.status === 'pending_payment' && <button className="text-button" type="button" onClick={() => cancelOrder(order._id)}>Cancel unpaid order</button>}
                </article>
              ))}</div>
            ) : <div className="empty-state"><PackageCheck size={38} /><h3>No orders yet</h3><p>Your paid orders and their progress will appear here.</p><button type="button" onClick={() => navigateTo('Shop')}>Start browsing</button></div>}
          </section>
        )}

        {activeTab === 'Saved' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Saved pieces</h1><span>{favorites.length} saved</span></div>
            {favorites.length
              ? renderProducts(displayedProducts.filter((product) => favorites.includes(getProductId(product))))
              : <div className="empty-state"><Heart size={38} /><h3>Your shortlist is empty</h3><p>Tap the heart on a piece to keep it close.</p><button type="button" onClick={() => navigateTo('Shop')}>Find a piece</button></div>}
          </section>
        )}

        {activeTab === 'Account' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Account</h1></div>
            {user ? (
              <>
                <div className="account-card">
                  <div className="account-avatar"><UserRound size={28} /></div>
                  <h2>{user.name}</h2><p>{user.email}</p>
                  <span className="role-pill">{user.role === 'admin' ? <ShieldCheck size={14} /> : <Check size={14} />}{user.role}</span>
                  <button className="secondary-button" type="button" onClick={clearSession}><LogOut size={17} /> Sign out</button>
                </div>
                <button className="account-row" type="button" onClick={() => navigateTo('Orders')}><span><PackageCheck size={18} /> Orders</span><ChevronRight size={18} /></button>
                {user.role === 'admin' && <button className="account-row" type="button" onClick={() => navigateTo('Admin')}><span><ShieldCheck size={18} /> Store admin</span><ChevronRight size={18} /></button>}
                <button className="account-row" type="button" onClick={() => navigateTo('Saved')}><span><Heart size={18} /> Saved pieces</span><strong>{favorites.length}</strong></button>
              </>
            ) : <AuthPanel onSession={saveSession} onError={setNotice} />}
          </section>
        )}

        {activeTab === 'Admin' && user?.role === 'admin' && <AdminPanel token={token} onNotice={setNotice} />}
      </main>

      <BottomNavigation
        activeTab={activeTab}
        cartCount={cartItems.length}
        savedCount={favorites.length}
        onNavigate={navigateTo}
      />

      {selectedProduct && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedProduct(null)}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-label={selectedProduct.name} onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close" onClick={() => setSelectedProduct(null)}><X size={20} /></button>
            <img src={selectedProduct.image} alt={selectedProduct.name} />
            <div className="modal-content">
              <span className="modal-category">{selectedProduct.category} · {demoCatalogActive ? 'Sample piece' : selectedProduct.stock > 0 ? 'One available' : 'Sold'}</span>
              <h2>{selectedProduct.name}</h2><div className="modal-price"><strong>{money(selectedProduct.price)}</strong></div>
              <p>{selectedProduct.description}</p>
              <div className="detail-row"><span>Size<strong>{selectedProduct.size}</strong></span><span>Condition<strong>{selectedProduct.condition}</strong></span></div>
              <button className="primary-button" type="button" disabled={!selectedProduct.stock || !apiAvailable || demoCatalogActive} onClick={() => addToCart(selectedProduct)}>{demoCatalogActive ? 'Browse-only sample' : selectedProduct.stock ? 'Add to bag' : 'Sold'} <ShoppingBag size={18} /></button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SignInPrompt({ onSignIn }) {
  return <div className="empty-state"><UserRound size={38} /><h3>Sign in to continue</h3><p>Your cart and orders are saved securely to your account.</p><button type="button" onClick={onSignIn}>Go to account</button></div>;
}

function AuthPanel({ onSession, onError }) {
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const session = await apiRequest(`/auth/${registering ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(form)
      });
      onSession(session);
    } catch (error) {
      onError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="account-avatar"><UserRound size={27} /></div>
      <h2>{registering ? 'Create your account' : 'Welcome back'}</h2>
      <p>Sign in to save unique finds and keep track of your orders.</p>
      <form className="stack-form" onSubmit={submit}>
        {registering && <label>Your name<input required minLength="2" maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>}
        <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Password<input required type="password" minLength={registering ? 8 : 1} autoComplete={registering ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : registering ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>
      </form>
      <button className="text-button" type="button" onClick={() => setRegistering((current) => !current)}>{registering ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
    </div>
  );
}

function CheckoutPanel({ items, subtotal, token, busy, setBusy, onRemove, onNotice }) {
  const [couponCode, setCouponCode] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [address, setAddress] = useState({ recipient: '', phone: '', address: '', city: '', postalCode: '' });
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setQuote(null);
    setQuoteError('');
    setQuoteLoading(true);
    const timer = setTimeout(() => {
      apiRequest('/checkout/quote', {
        token,
        method: 'POST',
        body: JSON.stringify({ couponCode: couponCode.trim() || undefined })
      }).then((result) => {
        if (active) setQuote(result);
      }).catch((error) => {
        if (active) setQuoteError(error.message);
      }).finally(() => {
        if (active) setQuoteLoading(false);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [couponCode, subtotal, token]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await apiRequest('/checkout', {
        token,
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          couponCode: couponCode.trim() || undefined,
          shippingAddress: address
        })
      });
      if (!result.checkoutUrl) throw new Error('Checkout was created without a payment link. Contact the store administrator.');
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      onNotice(error.message);
      if (['PAYMENT_UNAVAILABLE', 'PAYMENT_PROVIDER_ERROR'].includes(error.code)) {
        setIdempotencyKey(crypto.randomUUID());
      }
      setBusy(false);
    }
  }

  return (
    <div className="checkout-layout">
      <div className="cart-list">
        {items.map(({ product, lineTotal }) => (
          <article className="cart-item" key={getProductId(product)}>
            <img src={product.image} alt={product.name} />
            <div><h3>{product.name}</h3><p>{product.size} · {product.condition} · One available</p><strong>{money(lineTotal ?? product.price)}</strong></div>
            <button type="button" aria-label={`Remove ${product.name}`} onClick={() => onRemove(product)}><X size={18} /></button>
          </article>
        ))}
        {quote ? (
          <div className="checkout-summary">
            <div className="cart-total"><span>Server-calculated subtotal</span><strong>{money(quote.subtotal)}</strong></div>
            {quote.discount > 0 && <div className="cart-total discount-row"><span>Coupon discount</span><strong>−{money(quote.discount)}</strong></div>}
            <div className="cart-total"><span>Shipping</span><strong>{quote.shippingFee === 0 ? 'Free' : money(quote.shippingFee)}</strong></div>
            <div className="cart-total final-total"><span>Total</span><strong>{money(quote.total)}</strong></div>
          </div>
        ) : <p className={quoteError ? 'quote-error' : 'checkout-note'}>{quoteError || (quoteLoading ? 'Calculating your total securely…' : `Subtotal ${money(subtotal)}; enter a valid coupon to see final pricing.`)}</p>}
      </div>
      <form className="checkout-form" onSubmit={submit}>
        <h2>Shipping details</h2>
        <label>Recipient<input required maxLength="100" value={address.recipient} onChange={(event) => setAddress({ ...address, recipient: event.target.value })} /></label>
        <label>Phone<input required maxLength="30" type="tel" value={address.phone} onChange={(event) => setAddress({ ...address, phone: event.target.value })} /></label>
        <label>Street address<input required maxLength="300" value={address.address} onChange={(event) => setAddress({ ...address, address: event.target.value })} /></label>
        <div className="field-pair"><label>City<input required maxLength="100" value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} /></label><label>Postal code<input required maxLength="16" value={address.postalCode} onChange={(event) => setAddress({ ...address, postalCode: event.target.value })} /></label></div>
        <label>Coupon code<input value={couponCode} maxLength="40" onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Optional" /></label>
        <button className="primary-button" type="submit" disabled={busy || quoteLoading || !quote || Boolean(quoteError)}>{busy ? 'Creating secure checkout…' : 'Continue to payment'} <ArrowRight size={17} /></button>
        <small>Secure checkout hosted by Maya. Your order is confirmed only after verified payment.</small>
      </form>
    </div>
  );
}

function AdminPanel({ token, onNotice }) {
  const [dashboard, setDashboard] = useState(null);
  const [adminOrders, setAdminOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [adminProducts, setAdminProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', category: 'Tops', price: '', image: '', size: 'M', condition: 'Very good', tag: '', stock: '1' });
  const [couponForm, setCouponForm] = useState({ code: '', type: 'percentage', value: '', minimumSpend: '0', usageLimit: '100', perCustomerLimit: '1' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiRequest('/admin/dashboard', { token }),
      apiRequest('/admin/orders', { token }),
      apiRequest('/admin/coupons', { token }),
      apiRequest('/admin/products', { token })
    ]).then(([summary, orderList, couponList, productList]) => {
      setDashboard(summary);
      setAdminOrders(orderList);
      setCoupons(couponList);
      setAdminProducts(productList);
    }).catch((error) => onNotice(error.message));
  }, [token, onNotice]);

  async function addProduct(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const product = await apiRequest('/admin/products', {
        token,
        method: 'POST',
        body: JSON.stringify({ ...form, price: Number(form.price), stock: Number(form.stock) })
      });
      setAdminProducts((current) => [product, ...current]);
      onNotice('Product added to the catalog.');
      setForm({ name: '', description: '', category: 'Tops', price: '', image: '', size: 'M', condition: 'Very good', tag: '', stock: '1' });
    } catch (error) {
      onNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function addCoupon(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const coupon = await apiRequest('/admin/coupons', {
        token,
        method: 'POST',
        body: JSON.stringify({
          ...couponForm,
          value: Number(couponForm.value),
          minimumSpend: Number(couponForm.minimumSpend),
          usageLimit: couponForm.usageLimit ? Number(couponForm.usageLimit) : null,
          perCustomerLimit: Number(couponForm.perCustomerLimit),
          expiresAt: null,
          active: true
        })
      });
      setCoupons((current) => [coupon, ...current]);
      setCouponForm({ code: '', type: 'percentage', value: '', minimumSpend: '0', usageLimit: '100', perCustomerLimit: '1' });
      onNotice('Coupon created.');
    } catch (error) {
      onNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCoupon(coupon) {
    try {
      const updated = await apiRequest(`/admin/coupons/${coupon._id}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ active: !coupon.active })
      });
      setCoupons((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function toggleProduct(product) {
    try {
      const updated = await apiRequest(`/admin/products/${product._id}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ active: !product.active })
      });
      setAdminProducts((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function adjustStock(product) {
    try {
      const movement = await apiRequest(`/admin/products/${product._id}/stock`, {
        token,
        method: 'POST',
        body: JSON.stringify({ change: product.stock === 0 ? 1 : -1, reason: product.stock === 0 ? 'Restocked by store admin' : 'Marked unavailable by store admin' })
      });
      setAdminProducts((current) => current.map((item) => item._id === movement.product ? { ...item, stock: movement.newStock } : item));
      setDashboard((current) => current ? { ...current, lowStock: current.lowStock.map((item) => item._id === movement.product ? { ...item, stock: movement.newStock } : item) } : current);
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function advanceOrder(order) {
    const nextStatus = { paid: 'processing', processing: 'shipped', shipped: 'delivered' }[order.status];
    if (!nextStatus) return;
    try {
      const updated = await apiRequest(`/admin/orders/${order._id}/status`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      setAdminOrders((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (error) {
      onNotice(error.message);
    }
  }

  return (
    <section className="page alternate-page admin-page">
      <div className="section-heading page-title"><h1>Store admin</h1><span><ShieldCheck size={15} /> Protected</span></div>
      <div className="stats-grid">
        <div className="stat-card"><span>Paid orders</span><strong>{dashboard?.paidOrders ?? '—'}</strong></div>
        <div className="stat-card"><span>Gross sales</span><strong>{dashboard ? money(dashboard.grossSales) : '—'}</strong></div>
        <div className="stat-card"><span>Pending payment</span><strong>{dashboard?.pendingOrders ?? '—'}</strong></div>
      </div>
      <div className="admin-content-grid">
        <section className="admin-card"><h2><Store size={18} /> Add a one-of-a-kind piece</h2>
          <form className="stack-form" onSubmit={addProduct}>
            <label>Name<input required minLength="2" maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Description<textarea required minLength="5" maxLength="2000" rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <div className="field-pair"><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label><label>Size<input required value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} /></label></div>
            <div className="field-pair"><label>Price (PHP)<input required type="number" min="0" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label><label>Stock<input required type="number" min="0" max="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label></div>
            <label>Image URL<input required type="url" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /></label>
            <label>Condition<select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}>{['Like new', 'Very good', 'Good', 'Fair'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add product'} <ArrowRight size={17} /></button>
          </form>
        </section>
        <section className="admin-card"><h2><PackageCheck size={18} /> Low stock</h2>
          {dashboard?.lowStock?.length ? <ul className="low-stock-list">{dashboard.lowStock.map((product) => <li key={product._id}><span>{product.name}<small>{product.category}</small></span><strong>{product.stock} left</strong></li>)}</ul> : <p className="muted-copy">{dashboard ? 'No low-stock pieces.' : 'Loading inventory…'}</p>}
        </section>
        <section className="admin-card"><h2><Store size={18} /> Catalog management</h2>
          <ul className="low-stock-list catalog-admin-list">{adminProducts.map((product) => <li key={product._id}><span>{product.name}<small>{product.category} · {money(product.price)} · {product.stock ? 'in stock' : 'sold'}</small></span><span className="admin-product-actions"><button className="text-button" type="button" onClick={() => adjustStock(product)}>{product.stock ? 'Mark sold' : 'Restock'}</button><button className="text-button" type="button" onClick={() => toggleProduct(product)}>{product.active ? 'Deactivate' : 'Reactivate'}</button></span></li>)}</ul>
        </section>
        <section className="admin-card"><h2><Check size={18} /> Coupons</h2>
          <form className="stack-form" onSubmit={addCoupon}>
            <label>Code<input required minLength="3" maxLength="40" value={couponForm.code} onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })} /></label>
            <div className="field-pair"><label>Type<select value={couponForm.type} onChange={(event) => setCouponForm({ ...couponForm, type: event.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed PHP</option></select></label><label>Value<input required type="number" min="0" max={couponForm.type === 'percentage' ? '100' : undefined} value={couponForm.value} onChange={(event) => setCouponForm({ ...couponForm, value: event.target.value })} /></label></div>
            <div className="field-pair"><label>Minimum spend<input required type="number" min="0" value={couponForm.minimumSpend} onChange={(event) => setCouponForm({ ...couponForm, minimumSpend: event.target.value })} /></label><label>Total uses<input type="number" min="1" value={couponForm.usageLimit} onChange={(event) => setCouponForm({ ...couponForm, usageLimit: event.target.value })} /></label></div>
            <label>Uses per customer<input required type="number" min="1" value={couponForm.perCustomerLimit} onChange={(event) => setCouponForm({ ...couponForm, perCustomerLimit: event.target.value })} /></label>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create coupon'} <ArrowRight size={17} /></button>
          </form>
          <ul className="low-stock-list coupon-list">{coupons.map((coupon) => <li key={coupon._id}><span><strong>{coupon.code}</strong><small>{coupon.type === 'percentage' ? `${coupon.value}% off` : `${money(coupon.value)} off`} · {coupon.usageCount ?? 0} used</small></span><button className="text-button" type="button" onClick={() => toggleCoupon(coupon)}>{coupon.active ? 'Disable' : 'Enable'}</button></li>)}</ul>
        </section>
        <section className="admin-card"><h2><PackageCheck size={18} /> Recent orders</h2>
          {adminOrders.length ? <ul className="low-stock-list">{adminOrders.slice(0, 8).map((order) => <li key={order._id}><span>#{order._id.slice(-7).toUpperCase()} · {order.user?.name || 'Customer'}<small>{money(order.total)} · <span className={`status-pill status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span></small></span>{({ paid: 'processing', processing: 'shipped', shipped: 'delivered' })[order.status] && <button className="text-button" type="button" onClick={() => advanceOrder(order)}>Mark {({ paid: 'processing', processing: 'shipped', shipped: 'delivered' })[order.status]}</button>}</li>)}</ul> : <p className="muted-copy">{dashboard ? 'No orders to show yet.' : 'Loading orders…'}</p>}
        </section>
      </div>
    </section>
  );
}
