import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Bot, Check, ChevronRight, Heart, LoaderCircle, Minus, Plus,
  LogOut, PackageCheck, Search, ShieldCheck, Shirt, ShoppingBag, SlidersHorizontal,
  Sparkles, Store, Trash2, UserRound, X
} from 'lucide-react';
import { quoteCart } from './api/cart.js';
import { createCheckout } from './api/checkout.js';
import { getProductId } from './api/client.js';
import {
  cancelOrder as cancelOrderRequest,
  getOrder,
  listOrders,
  retryOrderPayment,
  verifyOrderPayment
} from './api/orders.js';
import { getCachedProducts, getProduct, listProducts } from './api/products.js';
import {
  createAdminCoupon,
  createAdminProduct,
  getAdminDashboard,
  listAdminCoupons,
  listAdminOrders,
  listAdminProducts,
  updateAdminCoupon,
  updateAdminInventory,
  updateAdminOrderStatus,
  updateAdminProduct
} from './api/admin.js';
import { products as demoProducts } from './data/products.js';
import AppHeader from './components/AppHeader.jsx';
import AiDiscovery from './components/AiDiscovery.jsx';
import BottomNavigation from './components/BottomNavigation.jsx';
import ProductCard from './components/ProductCard.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useCart } from './context/CartContext.jsx';
import { useNetworkStatus } from './context/NetworkStatusContext.jsx';
import './styles.css';

const categories = ['All', 'Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes'];
const money = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH')}`;

function screenFromPath(pathname, search = '', hash = '') {
  if (pathname === '/') {
    const paymentStatus = new URLSearchParams(search).get('payment');
    if (['return', 'failure', 'cancel'].includes(paymentStatus)) return 'Payment';
    const legacyScreen = hash.slice(1).toLowerCase();
    const legacyScreens = { home: 'Home', shop: 'Shop', bag: 'Bag', orders: 'Orders', saved: 'Saved', account: 'Account', admin: 'Admin' };
    if (legacyScreens[legacyScreen]) return legacyScreens[legacyScreen];
  }
  if (pathname === '/') return 'Home';
  if (pathname === '/products' || /^\/products\/[^/]+$/.test(pathname)) return 'Shop';
  if (pathname === '/cart') return 'Bag';
  if (pathname === '/checkout') return 'Checkout';
  if (pathname === '/orders' || /^\/orders\/[^/]+$/.test(pathname)) return 'Orders';
  if (pathname === '/saved') return 'Saved';
  if (pathname === '/login' || pathname === '/register' || pathname === '/account') return 'Account';
  if (pathname === '/ai-assistant') return 'AI discovery';
  if (['/payment/success', '/payment/failure', '/payment/cancelled'].includes(pathname)) return 'Payment';
  if (pathname.startsWith('/admin')) return 'Admin';
  return 'Not found';
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
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

function productSizes(product) {
  if (Array.isArray(product?.sizes) && product.sizes.length) return product.sizes;
  if (product?.size_stock && typeof product.size_stock === 'object' && !Array.isArray(product.size_stock)) {
    const stockedSizes = Object.keys(product.size_stock);
    if (stockedSizes.length) return stockedSizes;
  }
  if (typeof product?.size === 'string' && product.size.includes(',')) {
    return product.size.split(',').map((size) => size.trim()).filter(Boolean);
  }
  return [product?.size || 'One size'];
}

function productSizeStock(product, size) {
  const sizeStock = product?.size_stock;
  if (sizeStock && typeof sizeStock === 'object' && !Array.isArray(sizeStock)) {
    return Math.max(0, Number(sizeStock[size]) || 0);
  }
  return Math.max(0, Number(product?.stock) || 0);
}

function defaultSizeInventory(category = 'Tops') {
  const sizesByCategory = {
    Tops: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    Outerwear: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    Bottoms: ['26', '28', '30', '32', '34', '36'],
    Shoes: ['36', '37', '38', '39', '40', '41', '42', '43', '44'],
    Accessories: ['One size']
  };
  const stockValues = category === 'Accessories' ? ['20'] : ['4', '6', '8', '7', '5', '4'];
  return (sizesByCategory[category] || sizesByCategory.Tops).map((size, index) => ({
    size,
    stock: stockValues[index % stockValues.length]
  }));
}

function parseSizeInventory(rows) {
  const sizes = rows.map((row) => row.size.trim());
  const stockValues = rows.map((row) => row.stock.trim());
  if (!sizes.length || sizes.length > 30 || new Set(sizes).size !== sizes.length) {
    throw new Error('Enter 1–30 unique sizes.');
  }
  if (sizes.some((size) => !size) || stockValues.some((value) => !/^\d+$/.test(value) || Number(value) > 9999)) {
    throw new Error('Enter a size and a stock quantity from 0 to 9999 for every row.');
  }
  const sizeStock = Object.fromEntries(rows.map((row) => [row.size.trim(), Number(row.stock)]));
  const stock = Object.values(sizeStock).reduce((total, quantity) => total + quantity, 0);
  if (stock > 9999) throw new Error('Combined stock cannot exceed 9999.');
  return { sizes, sizeStock, stock };
}

function SizeInventoryEditor({ rows, onChange }) {
  return (
    <div className="size-inventory-editor">
      <strong>Stock by size</strong>
      {rows.map((row, index) => (
        <div className="size-inventory-row" key={`size-row-${index}`}>
          <label>Size
            <input required maxLength="30" value={row.size} onChange={(event) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, size: event.target.value } : item))} />
          </label>
          <label>Stock
            <input required type="number" min="0" max="9999" step="1" value={row.stock} onChange={(event) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, stock: event.target.value } : item))} />
          </label>
          <button className="remove-size-button" type="button" aria-label={`Remove size row ${index + 1}`} onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} disabled={rows.length === 1}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button className="text-button add-size-button" type="button" onClick={() => onChange([...rows, { size: '', stock: '0' }])} disabled={rows.length >= 30}>
        <Plus size={15} /> Add size
      </button>
      <small>Enter the quantity available for each size. Set stock to 0 to hide it from customers as sold out.</small>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = screenFromPath(location.pathname, location.search, location.hash);
  const paymentParameters = new URLSearchParams(location.search);
  const paymentOrderId = paymentParameters.get('order');
  const paymentCancelled = location.pathname.endsWith('/cancelled') || paymentParameters.get('payment') === 'cancel';
  const paymentFailed = location.pathname.endsWith('/failure') || paymentParameters.get('payment') === 'failure';
  const { token, user, login, register, logout, authError, loading: authLoading } = useAuth();
  const {
    items: cartItems, count: cartCount, subtotal: cartTotal, loading: cartLoading,
    refreshCart, addItem, setQuantity, removeItem
  } = useCart();
  const { online: networkOnline } = useNetworkStatus();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [demoCatalogActive, setDemoCatalogActive] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [favorites, setFavorites] = useState(storedFavorites);
  const [cartItemBusy, setCartItemBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersForToken, setOrdersForToken] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [paymentRetryBusy, setPaymentRetryBusy] = useState(false);
  const [cachedCatalogActive, setCachedCatalogActive] = useState(false);
  const [productReturnPath, setProductReturnPath] = useState('/products');
  const navigateTo = (screen) => navigate(({
    Home: '/',
    Shop: '/products',
    Bag: '/cart',
    Checkout: '/checkout',
    Orders: '/orders',
    Saved: '/saved',
    Account: '/account',
    Admin: '/admin',
    'AI discovery': '/ai-assistant'
  })[screen] || '/');
  const productRouteId = location.pathname.match(/^\/products\/([^/]+)$/)?.[1] || null;
  const orderRouteId = location.pathname.match(/^\/orders\/([^/]+)$/)?.[1] || null;

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (productRouteId) {
      setLoadingProducts(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    if (demoCatalogActive) {
      setLoadingProducts(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    if (!networkOnline) {
      const cachedProducts = getCachedProducts();
      setApiAvailable(false);
      setProducts(cachedProducts.length ? cachedProducts : demoProducts);
      setDemoCatalogActive(true);
      setCachedCatalogActive(cachedProducts.length > 0);
      setFallbackMessage(cachedProducts.length
        ? 'Offline mode · Showing your previously saved catalog. Availability and checkout need a connection.'
        : 'No saved catalog is available offline. Sample pieces are for browsing only.');
      setLoadingProducts(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    setLoadingProducts(true);
    listProducts({
      search: searchQuery || undefined,
      category: category === 'All' ? undefined : category,
      limit: 50
    }, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        setApiAvailable(true);
        if (result.length === 0 && !searchQuery && category === 'All') {
          setProducts(demoProducts);
          setDemoCatalogActive(true);
          setFallbackMessage('The database has no seeded products yet. Showing sample pieces; run npm run seed to load the live catalog.');
          return;
        }
        setProducts(result);
      })
      .catch((error) => {
        if (error.name === 'AbortError' || !active) return;
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
    return () => {
      active = false;
      controller.abort();
    };
  }, [demoCatalogActive, networkOnline, productRouteId, searchQuery, category]);

  const displayedProducts = useMemo(() => {
    if (!demoCatalogActive) return products;
    const text = searchQuery.toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      const matchesSearch = !text || product.name.toLowerCase().includes(text) || product.category.toLowerCase().includes(text);
      return matchesCategory && matchesSearch;
    });
  }, [category, demoCatalogActive, products, searchQuery]);

  useEffect(() => {
    if (!productRouteId) {
      setSelectedProduct(null);
      return undefined;
    }
    const productId = decodePathSegment(productRouteId);
    if (!productId) {
      navigate('/products', { replace: true });
      return undefined;
    }
    const existing = [...products, ...getCachedProducts(), ...demoProducts]
      .find((item) => String(getProductId(item)) === productId);
    if (existing) {
      setSelectedProduct(existing);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    getProduct(productId, { signal: controller.signal })
      .then((product) => {
        if (active) setSelectedProduct(product);
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') {
          setSelectedProduct(null);
          setNotice(error.message);
          navigate('/products', { replace: true });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [navigate, productRouteId, products]);

  useEffect(() => {
    if (!selectedProduct) return undefined;
    const sizes = productSizes(selectedProduct);
    setSelectedSize(sizes.includes(selectedProduct.size) ? selectedProduct.size : sizes[0]);
    setSelectedQuantity(1);
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') navigate(productReturnPath);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [navigate, productReturnPath, selectedProduct]);

  useEffect(() => {
    localStorage.setItem('rj-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (!token || activeTab !== 'Orders' || orderRouteId) return undefined;
    const controller = new AbortController();
    let active = true;
    setOrdersLoading(true);
    listOrders(token, { signal: controller.signal })
      .then((result) => {
        if (active) {
          setOrders(result);
          setOrdersForToken(token);
        }
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') setNotice(error.message);
      })
      .finally(() => {
        if (active) setOrdersLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeTab, orderRouteId, token]);

  useEffect(() => {
    if (!token || !orderRouteId) {
      setSelectedOrder(null);
      setOrderLoading(false);
      return undefined;
    }
    const orderId = decodePathSegment(orderRouteId);
    if (!orderId) {
      setOrderLoading(false);
      navigate('/orders', { replace: true });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setOrderLoading(true);
    getOrder(token, orderId, controller.signal)
      .then((order) => {
        if (active) setSelectedOrder(order);
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') {
          setSelectedOrder(null);
          setNotice(error.message);
        }
      })
      .finally(() => {
        if (active) setOrderLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [location.pathname, navigate, orderRouteId, token]);

  useEffect(() => {
    if (authError) setNotice(authError);
  }, [authError]);

  function retryCatalog() {
    setDemoCatalogActive(false);
    setCachedCatalogActive(false);
    setApiAvailable(true);
    setFallbackMessage('');
    setLoadingProducts(true);
  }

  function openProduct(product) {
    setProductReturnPath(location.pathname.startsWith('/products') ? '/products' : location.pathname);
    setSelectedProduct(product);
    navigate(`/products/${encodeURIComponent(getProductId(product))}`);
  }

  function closeProduct() {
    setSelectedProduct(null);
    navigate(productReturnPath);
  }

  async function addToCart(product) {
    if (!apiAvailable || demoCatalogActive) {
      setNotice('Sample catalog pieces are for browsing only. Connect the shop API to purchase.');
      return;
    }
    if (!networkOnline) {
      setNotice('Connect to the internet before adding items to your bag.');
      return;
    }
    if (!token) {
      closeProduct();
      navigate('/login', { state: { from: location.pathname } });
      setNotice('Sign in to save a piece to your bag.');
      return;
    }
    try {
      await addItem(product, selectedSize, selectedQuantity);
      setSelectedProduct(null);
      navigateTo('Bag');
      setNotice('Added to your bag.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function removeFromCart(product) {
    setCartItemBusy(true);
    try {
      await removeItem(product);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setCartItemBusy(false);
    }
  }

  async function updateCartQuantity(item, quantity) {
    setCartItemBusy(true);
    try {
      await setQuantity(item, quantity);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setCartItemBusy(false);
    }
  }

  async function cancelOrder(orderId) {
    try {
      const updated = await cancelOrderRequest(token, orderId);
      setOrders((current) => current.map((order) => order._id === orderId ? updated : order));
      setSelectedOrder((current) => current?._id === orderId ? updated : current);
      await refreshCart();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function verifyOrder(orderId) {
    try {
      const result = await verifyOrderPayment(token, orderId);
      setOrders((current) => current.map((order) => order._id === orderId ? result.order : order));
      setSelectedOrder((current) => current?._id === orderId ? result.order : current);
      if (result.paid) await refreshCart();
      setNotice(result.paid ? 'Payment verified. Your order is paid.' : result.mismatch ? 'Payment amount or currency needs administrator review.' : 'Payment is not confirmed yet. Try again shortly.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function resumePayment(orderId) {
    setPaymentRetryBusy(true);
    try {
      const result = await retryOrderPayment(token, orderId);
      if (!result.checkoutUrl) throw new Error('Maya did not return a payment link. Please retry in a few seconds.');
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setPaymentRetryBusy(false);
    }
  }

  async function signOut() {
    try {
      await logout();
      navigate('/');
      setNotice('You have been signed out.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  function toggleFavorite(product) {
    const productId = getProductId(product);
    setFavorites((current) => current.includes(productId)
      ? current.filter((value) => value !== productId)
      : [...current, productId]);
  }

  const selectedSizeStock = selectedProduct ? productSizeStock(selectedProduct, selectedSize) : 0;
  const visibleOrders = token && ordersForToken === token ? orders : [];

  if (activeTab === 'Not found') {
    return <NotFoundPage onHome={() => navigate('/')} />;
  }

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
            : demoCatalogActive ? 'Sample piece' : product.stock > 0 ? `${product.stock} in stock` : 'Sold';
          return <ProductCard
            key={id}
            product={product}
            liked={liked}
            availability={availability}
            onOpen={openProduct}
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
      <Routes>
        <Route path="/" element={null} />
        <Route path="/products" element={null} />
        <Route path="/products/:productId" element={null} />
        <Route path="/ai-assistant" element={null} />
        <Route path="/cart" element={<RequireAuthentication><></></RequireAuthentication>} />
        <Route path="/checkout" element={<RequireAuthentication><></></RequireAuthentication>} />
        <Route path="/orders" element={<RequireAuthentication><></></RequireAuthentication>} />
        <Route path="/orders/:orderId" element={<RequireAuthentication><></></RequireAuthentication>} />
        <Route path="/saved" element={null} />
        <Route path="/account" element={null} />
        <Route path="/login" element={null} />
        <Route path="/register" element={null} />
        <Route path="/payment/success" element={null} />
        <Route path="/payment/failure" element={null} />
        <Route path="/payment/cancelled" element={null} />
        <Route path="/admin/*" element={<RequireAdministrator><></></RequireAdministrator>} />
      </Routes>

      <AppHeader
        activeTab={activeTab}
        user={user}
        onHome={() => navigateTo('Home')}
        onBack={() => navigate(-1)}
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

            {demoCatalogActive && <div className="offline-banner" role="status"><p>{fallbackMessage}</p><button type="button" onClick={retryCatalog} disabled={!networkOnline}>Retry connection</button></div>}
            <div className="section-heading"><h2>{category === 'All' ? 'Fresh finds' : category}</h2><button className="section-action" type="button" onClick={() => navigateTo('Shop')}>See all</button></div>
            {renderProducts(displayedProducts)}

            <AiDiscovery
              available={apiAvailable && networkOnline && !demoCatalogActive}
              favorites={favorites}
              onOpenProduct={openProduct}
              onToggleFavorite={toggleFavorite}
            />
          </section>
        )}

        {activeTab === 'Shop' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Shop the drop</h1><span>{displayedProducts.length} pieces</span></div>
            <label className="search-box shop-search"><Search size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pieces" aria-label="Search pieces" /></label>
            <div className="category-row">{categories.map((item) => <button key={item} className={category === item ? 'category active' : 'category'} type="button" onClick={() => setCategory(item)}>{item}</button>)}</div>
            {demoCatalogActive && <div className="offline-banner" role="status"><p>{fallbackMessage}</p><button type="button" onClick={retryCatalog} disabled={!networkOnline}>Retry connection</button></div>}
            {renderProducts(displayedProducts)}
            <AiDiscovery
              available={apiAvailable && networkOnline && !demoCatalogActive}
              favorites={favorites}
              onOpenProduct={openProduct}
              onToggleFavorite={toggleFavorite}
            />
          </section>
        )}

        {activeTab === 'AI discovery' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>AI style discovery</h1></div>
            <AiDiscovery
              available={apiAvailable && networkOnline}
              favorites={favorites}
              onOpenProduct={openProduct}
              onToggleFavorite={toggleFavorite}
            />
          </section>
        )}

        {activeTab === 'Bag' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Your bag</h1><span>{cartCount} {cartCount === 1 ? 'piece' : 'pieces'}</span></div>
            {authLoading || cartLoading ? <div className="loading-state"><LoaderCircle className="spin" /> Loading your bag…</div> : !token ? <SignInPrompt onSignIn={() => navigate('/login')} /> : cartItems.length ? (
              <CheckoutPanel items={cartItems} subtotal={cartTotal} token={token} busy={busy} setBusy={setBusy} cartItemBusy={cartItemBusy} onRemove={removeFromCart} onQuantityChange={updateCartQuantity} onNotice={setNotice} networkOnline={networkOnline} refreshCart={refreshCart} onContinue={() => navigate('/checkout')} />
            ) : <div className="empty-state"><ShoppingBag size={38} /><h3>Your bag is empty</h3><p>Each piece is one-of-a-kind. Find yours before it is gone.</p><button type="button" onClick={() => navigateTo('Shop')}>Browse the drop</button></div>}
          </section>
        )}

        {activeTab === 'Checkout' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Checkout</h1><span>{cartCount} {cartCount === 1 ? 'piece' : 'pieces'}</span></div>
            {authLoading || cartLoading ? <div className="loading-state"><LoaderCircle className="spin" /> Loading your checkout…</div> : !token ? <SignInPrompt onSignIn={() => navigate('/login', { state: { from: '/checkout' } })} /> : cartItems.length ? (
              <CheckoutPanel items={cartItems} subtotal={cartTotal} token={token} busy={busy} setBusy={setBusy} cartItemBusy={cartItemBusy} onRemove={removeFromCart} onQuantityChange={updateCartQuantity} onNotice={setNotice} networkOnline={networkOnline} refreshCart={refreshCart} checkoutMode />
            ) : <div className="empty-state"><ShoppingBag size={38} /><h3>Your bag is empty</h3><p>Add a piece before continuing to checkout.</p><button type="button" onClick={() => navigateTo('Shop')}>Browse the drop</button></div>}
          </section>
        )}

        {activeTab === 'Orders' && (
          <section className="page alternate-page">
            <div className="section-heading page-title"><h1>Your orders</h1><span>{visibleOrders.length} total</span></div>
            {authLoading ? <div className="loading-state"><LoaderCircle className="spin" /> Loading your orders…</div> : !token ? <SignInPrompt onSignIn={() => navigate('/login', { state: { from: '/orders' } })} /> : orderRouteId ? (
              orderLoading ? <div className="loading-state"><LoaderCircle className="spin" /> Loading order…</div>
                : selectedOrder ? <OrderDetail order={selectedOrder} online={networkOnline} retryingPayment={paymentRetryBusy} onBack={() => navigate('/orders')} onRetryPayment={() => resumePayment(selectedOrder._id)} onVerify={() => verifyOrder(selectedOrder._id)} onCancel={() => cancelOrder(selectedOrder._id)} />
                  : <div className="empty-state"><PackageCheck size={38} /><h3>Order unavailable</h3><p>We could not load that order.</p><button type="button" onClick={() => navigate('/orders')}>Back to orders</button></div>
            ) : ordersLoading ? <div className="loading-state"><LoaderCircle className="spin" /> Loading your orders…</div> : visibleOrders.length ? (
              <div className="orders-list">{visibleOrders.map((order) => (
                <article className="order-card" key={order._id}>
                  <div className="order-title"><div><span>Order</span><strong>#{order._id.slice(-7).toUpperCase()}</strong></div><span className={`status-pill status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span></div>
                  <p>{order.items.map((item) => item.name).join(', ')}</p>
                  <div className="order-foot"><span>{new Date(order.createdAt).toLocaleDateString()}</span><strong>{money(order.total)}</strong></div>
                  <button className="text-button" type="button" onClick={() => navigate(`/orders/${encodeURIComponent(order._id)}`)}>View order details</button>
                  {order.status === 'pending_payment' && <button className="text-button" type="button" onClick={() => resumePayment(order._id)} disabled={!networkOnline || paymentRetryBusy}>Continue to payment</button>}
                  {order.status === 'pending_payment' && order.paymentCheckoutId && <button className="text-button" type="button" onClick={() => verifyOrder(order._id)} disabled={!networkOnline}>Check payment status</button>}
                  {order.status === 'pending_payment' && <button className="text-button" type="button" onClick={() => cancelOrder(order._id)} disabled={!networkOnline}>Cancel unpaid order</button>}
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
                  <button className="secondary-button" type="button" onClick={signOut}><LogOut size={17} /> Sign out</button>
                </div>
                <button className="account-row" type="button" onClick={() => navigateTo('Orders')}><span><PackageCheck size={18} /> Orders</span><ChevronRight size={18} /></button>
                {user.role === 'admin' && <button className="account-row" type="button" onClick={() => navigateTo('Admin')}><span><ShieldCheck size={18} /> Store admin</span><ChevronRight size={18} /></button>}
                <button className="account-row" type="button" onClick={() => navigateTo('Saved')}><span><Heart size={18} /> Saved pieces</span><strong>{favorites.length}</strong></button>
              </>
            ) : authLoading ? <div className="loading-state"><LoaderCircle className="spin" /> Checking your account…</div> : <AuthPanel
              mode={location.pathname === '/register' ? 'register' : 'login'}
              login={login}
              register={register}
              onModeChange={(mode) => navigate(mode === 'register' ? '/register' : '/login')}
              onSuccess={(requiresEmailConfirmation) => {
                if (requiresEmailConfirmation) {
                  navigate('/login', { replace: true });
                  setNotice('Check your email to confirm your account, then sign in.');
                  return;
                }
                const destination = location.state?.from || '/';
                navigate(destination, { replace: true });
                setNotice('Welcome to RJ Thrift Hub.');
              }}
              onError={setNotice}
            />}
          </section>
        )}

        {activeTab === 'Admin' && (authLoading ? <div className="loading-state"><LoaderCircle className="spin" /> Checking administrator access…</div> : user?.role === 'admin' ? <AdminPanel token={token} onNotice={setNotice} /> : <SignInPrompt onSignIn={() => navigate('/login', { state: { from: '/admin' } })} />)}

        {activeTab === 'Payment' && (
          <section className="page alternate-page payment-status-page">
            <div className="empty-state">
              <PackageCheck size={38} />
              <h1>{paymentCancelled || paymentFailed ? 'Checkout not completed' : 'Payment verification in progress'}</h1>
              <p>{paymentCancelled || paymentFailed
                ? 'Your order has not been marked paid. You can review or retry it from your orders.'
                : 'Returning from Maya does not confirm payment. We will update your order after its payment is verified.'}</p>
              <button type="button" onClick={() => navigate(paymentOrderId ? `/orders/${encodeURIComponent(paymentOrderId)}` : '/orders')}>View order status</button>
            </div>
          </section>
        )}
      </main>

      <BottomNavigation
        activeTab={activeTab}
        cartCount={cartCount}
        savedCount={favorites.length}
        onNavigate={navigateTo}
      />

      {selectedProduct && productRouteId && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeProduct}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-label={selectedProduct.name} onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close" onClick={closeProduct}><X size={20} /></button>
            <img src={selectedProduct.image} alt={selectedProduct.name} />
            <div className="modal-content">
              <span className="modal-category">{selectedProduct.category} · {demoCatalogActive ? 'Sample piece' : selectedProduct.stock > 0 ? `${selectedProduct.stock} in stock` : 'Sold'}</span>
              <h2>{selectedProduct.name}</h2><div className="modal-price"><strong>{money(selectedProduct.price)}</strong></div>
              <p>{selectedProduct.description}</p>
              <div className="size-stock-row">
                <span>Choose size</span>
                <div className="size-options">
                  {productSizes(selectedProduct).map((size) => (
                    <button key={size} type="button" className={selectedSize === size ? 'size-option active' : 'size-option'} onClick={() => { setSelectedSize(size); setSelectedQuantity(1); }} disabled={productSizeStock(selectedProduct, size) < 1}>
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="detail-row">
                <span>Selected size stock<strong>{selectedSizeStock > 0 ? `${selectedSizeStock} available` : 'Sold out'}</strong></span>
                <span>Condition<strong>{selectedProduct.condition}</strong></span>
              </div>
              {!demoCatalogActive && selectedSizeStock > 0 && (
                <label className="quantity-row">Quantity
                  <input type="number" min="1" max={selectedSizeStock} value={selectedQuantity} onChange={(event) => setSelectedQuantity(Math.max(1, Math.min(selectedSizeStock, Number(event.target.value) || 1)))} />
                </label>
              )}
              <button className="primary-button" type="button" disabled={!selectedSizeStock || !apiAvailable || demoCatalogActive || selectedQuantity > selectedSizeStock} onClick={() => addToCart(selectedProduct)}>{demoCatalogActive ? 'Browse-only sample' : selectedSizeStock ? `Add ${selectedQuantity} to bag` : 'Sold out'} <ShoppingBag size={18} /></button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function OrderDetail({ order, online, retryingPayment, onBack, onRetryPayment, onVerify, onCancel }) {
  const shipping = order.shippingAddress || {};
  return (
    <article className="order-card order-detail-card">
      <button className="text-button" type="button" onClick={onBack}>Back to all orders</button>
      <div className="order-title">
        <div><span>Order</span><strong>#{order._id.slice(-7).toUpperCase()}</strong></div>
        <span className={`status-pill status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span>
      </div>
      <p>Placed {new Date(order.createdAt).toLocaleString()}</p>
      <div className="order-detail-items">
        {(order.items || []).map((item) => (
          <div className="order-detail-item" key={item._id}>
            <img src={item.image} alt="" />
            <span>{item.name}<small>Size {item.size} · Qty {item.quantity}</small></span>
            <strong>{money(Number(item.unitPrice) * Number(item.quantity))}</strong>
          </div>
        ))}
      </div>
      <div className="checkout-summary">
        <div className="cart-total"><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div>
        {Number(order.discount) > 0 && <div className="cart-total discount-row"><span>Discount</span><strong>−{money(order.discount)}</strong></div>}
        <div className="cart-total"><span>Shipping</span><strong>{money(order.shippingFee)}</strong></div>
        <div className="cart-total final-total"><span>Total</span><strong>{money(order.total)}</strong></div>
      </div>
      <section className="order-shipping">
        <h3>Shipping to</h3>
        <p>{shipping.recipient}<br />{shipping.address}<br />{shipping.city} {shipping.postalCode}<br />{shipping.phone}</p>
      </section>
      {order.status === 'pending_payment' && (
        <div className="order-detail-actions">
          <button className="secondary-button" type="button" onClick={onRetryPayment} disabled={!online || retryingPayment}>{retryingPayment ? 'Preparing payment…' : 'Continue to payment'}</button>
          {order.paymentCheckoutId && <button className="text-button" type="button" onClick={onVerify} disabled={!online}>Check payment status</button>}
          <button className="text-button" type="button" onClick={onCancel} disabled={!online}>Cancel unpaid order</button>
        </div>
      )}
    </article>
  );
}

function RequireAuthentication({ children }) {
  const { token, user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-state"><LoaderCircle className="spin" /> Checking your account…</div>;
  if (!token || !user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function RequireAdministrator({ children }) {
  const { token, user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-state"><LoaderCircle className="spin" /> Checking administrator access…</div>;
  if (!token || !user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role !== 'admin') return <Navigate to="/account" replace />;
  return children;
}

function NotFoundPage({ onHome }) {
  return (
    <main className="page not-found-page">
      <div className="empty-state">
        <Shirt size={38} />
        <h1>Page not found</h1>
        <p>That page may have moved. Browse the latest thrifted finds instead.</p>
        <button type="button" onClick={onHome}>Back to home</button>
      </div>
    </main>
  );
}

function SignInPrompt({ onSignIn }) {
  return <div className="empty-state"><UserRound size={38} /><h3>Sign in to continue</h3><p>Your cart and orders are saved securely to your account.</p><button type="button" onClick={onSignIn}>Go to account</button></div>;
}

function AuthPanel({ mode, login, register, onModeChange, onSuccess, onError }) {
  const registering = mode === 'register';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = registering
        ? await register({ name: form.name, email: form.email, password: form.password })
        : await login({ email: form.email, password: form.password });
      onSuccess(Boolean(result.requiresEmailConfirmation));
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
      <button className="text-button" type="button" onClick={() => onModeChange(registering ? 'login' : 'register')}>{registering ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
    </div>
  );
}

function CheckoutPanel({
  items, subtotal, token, busy, setBusy, cartItemBusy, onRemove,
  onQuantityChange, onNotice, networkOnline, refreshCart, checkoutMode = false, onContinue
}) {
  const [couponCode, setCouponCode] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [address, setAddress] = useState({ recipient: '', phone: '', address: '', city: '', postalCode: '' });
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(true);

  useEffect(() => {
    if (!checkoutMode) {
      setQuoteLoading(false);
      return undefined;
    }
    if (!networkOnline) {
      setQuoteError('Connect to the internet to calculate a secure checkout total.');
      setQuoteLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setQuote(null);
    setQuoteError('');
    setQuoteLoading(true);
    const timer = setTimeout(() => {
      quoteCart(token, couponCode.trim(), controller.signal).then((result) => {
        if (active) setQuote(result);
      }).catch((error) => {
        if (active && error.name !== 'AbortError') setQuoteError(error.message);
      }).finally(() => {
        if (active) setQuoteLoading(false);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [checkoutMode, couponCode, networkOnline, subtotal, token]);

  async function submit(event) {
    event.preventDefault();
    if (!networkOnline) {
      onNotice('Connect to the internet before starting checkout.');
      return;
    }
    setBusy(true);
    try {
      const currentCart = await refreshCart();
      if (!currentCart?.items?.length) {
        onNotice('Your bag is empty or has changed. Add an available piece before continuing.');
        setBusy(false);
        return;
      }
      const result = await createCheckout(token, {
          idempotencyKey,
          couponCode: couponCode.trim() || undefined,
          shippingAddress: address
      });
      if (!result.checkoutUrl) throw new Error('Checkout was created without a payment link. Contact the store administrator.');
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      if (error.code === 'CART_EMPTY') {
        try {
          await refreshCart();
          onNotice('Your bag changed while checkout was starting. Review it and try again.');
        } catch (refreshError) {
          onNotice(refreshError.message);
        }
      } else {
        onNotice(error.message);
      }
      if (['PAYMENT_UNAVAILABLE', 'PAYMENT_PROVIDER_ERROR'].includes(error.code)) {
        setIdempotencyKey(crypto.randomUUID());
      }
      setBusy(false);
    }
  }

  const totalSummary = quote ? (
    <div className="checkout-summary">
      <div className="cart-total"><span>Server-calculated subtotal</span><strong>{money(quote.subtotal)}</strong></div>
      {quote.discount > 0 && <div className="cart-total discount-row"><span>Coupon discount</span><strong>−{money(quote.discount)}</strong></div>}
      <div className="cart-total"><span>Shipping</span><strong>{quote.shippingFee === 0 ? 'Free' : money(quote.shippingFee)}</strong></div>
      <div className="cart-total final-total"><span>Total</span><strong>{money(quote.total)}</strong></div>
    </div>
  ) : checkoutMode ? (
    <p className={quoteError ? 'quote-error' : 'checkout-note'}>
      {quoteError || (quoteLoading ? 'Calculating your total securely…' : `Subtotal ${money(subtotal)}; enter a valid coupon to see final pricing.`)}
    </p>
  ) : (
    <div className="checkout-summary"><div className="cart-total final-total"><span>Subtotal</span><strong>{money(subtotal)}</strong></div></div>
  );

  return (
    <div className="checkout-layout">
      <div className="cart-list">
        {items.map((item) => {
          const { product, lineTotal, size } = item;
          const quantity = item.quantity || 1;
          const itemSize = size || product.size;
          const sizeStock = productSizeStock(product, itemSize);
          return (
            <article className="cart-item" key={`${getProductId(product)}-${itemSize}`}>
              <img src={product.image} alt={product.name} />
              <div className="cart-item-details">
                <div className="cart-item-heading">
                  <h3>{product.name}</h3>
                  <button className="cart-remove-button" type="button" aria-label={`Remove ${product.name} size ${itemSize} from bag`} onClick={() => onRemove({ product, size })} disabled={cartItemBusy || !networkOnline}><X size={18} /></button>
                </div>
                <p>{itemSize} · {product.condition}</p>
                <div className="cart-item-footer">
                  <div className="cart-quantity-control" aria-label={`Quantity for ${product.name} size ${itemSize}`}>
                    <button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => onQuantityChange(item, quantity - 1)} disabled={cartItemBusy || !networkOnline || quantity <= 1}><Minus size={16} /></button>
                    <span aria-live="polite">{quantity}</span>
                    <button type="button" aria-label={`Increase ${product.name} quantity`} onClick={() => onQuantityChange(item, quantity + 1)} disabled={cartItemBusy || !networkOnline || quantity >= sizeStock}><Plus size={16} /></button>
                  </div>
                  <strong>{money(lineTotal ?? product.price * quantity)}</strong>
                </div>
              </div>
            </article>
          );
        })}
        {totalSummary}
        {!checkoutMode && <button className="primary-button" type="button" onClick={onContinue} disabled={!networkOnline}>Continue to checkout <ArrowRight size={17} /></button>}
      </div>
      {checkoutMode && <form className="checkout-form" onSubmit={submit}>
        <h2>Shipping details</h2>
        <label>Recipient<input required maxLength="100" value={address.recipient} onChange={(event) => setAddress({ ...address, recipient: event.target.value })} /></label>
        <label>Phone<input required maxLength="30" type="tel" value={address.phone} onChange={(event) => setAddress({ ...address, phone: event.target.value })} /></label>
        <label>Street address<input required minLength="3" maxLength="300" value={address.address} onChange={(event) => setAddress({ ...address, address: event.target.value })} /></label>
        <div className="field-pair"><label>City<input required maxLength="100" value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} /></label><label>Postal code<input required maxLength="16" value={address.postalCode} onChange={(event) => setAddress({ ...address, postalCode: event.target.value })} /></label></div>
        <label>Coupon code<input value={couponCode} maxLength="40" onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Optional" /></label>
        <button className="primary-button" type="submit" disabled={busy || !networkOnline || quoteLoading || !quote || Boolean(quoteError)}>{busy ? 'Creating secure checkout…' : 'Continue to payment'} <ArrowRight size={17} /></button>
        <small>Secure checkout hosted by Maya. Your order is confirmed only after verified payment.</small>
      </form>}
    </div>
  );
}

function AdminPanel({ token, onNotice }) {
  const { online } = useNetworkStatus();
  const [dashboard, setDashboard] = useState(null);
  const [adminOrders, setAdminOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [adminProducts, setAdminProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', category: 'Tops', price: '', image: '', size: 'M', sizeInventory: defaultSizeInventory(), condition: 'Very good', tag: '' });
  const [editingProduct, setEditingProduct] = useState(null);
  const [inventoryForm, setInventoryForm] = useState({ price: '', sizeInventory: [] });
  const [couponForm, setCouponForm] = useState({ code: '', type: 'percentage', value: '', minimumSpend: '0', usageLimit: '100', perCustomerLimit: '1' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!online) return undefined;
    const controller = new AbortController();
    let active = true;
    Promise.all([
      getAdminDashboard(token, controller.signal),
      listAdminOrders(token, controller.signal),
      listAdminCoupons(token, controller.signal),
      listAdminProducts(token, controller.signal)
    ]).then(([summary, orderList, couponList, productList]) => {
      if (!active) return;
      setDashboard(summary);
      setAdminOrders(orderList);
      setCoupons(couponList);
      setAdminProducts(productList);
    }).catch((error) => {
      if (active && error.name !== 'AbortError') onNotice(error.message);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [online, token, onNotice]);

  async function addProduct(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const { sizes, sizeStock, stock } = parseSizeInventory(form.sizeInventory);
      const { sizeInventory, ...productFields } = form;
      const product = await createAdminProduct(token, {
          ...productFields,
          price: Number(form.price),
          stock,
          size: sizes.includes(form.size) ? form.size : sizes[0],
          sizes,
          size_stock: sizeStock
      });
      setAdminProducts((current) => [product, ...current]);
      onNotice('Product added to the catalog.');
      setForm({ name: '', description: '', category: 'Tops', price: '', image: '', size: 'M', sizeInventory: defaultSizeInventory(), condition: 'Very good', tag: '' });
    } catch (error) {
      onNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  function startInventoryEdit(product) {
    const sizes = productSizes(product);
    const sizeStock = product.size_stock || { [product.size]: product.stock };
    setEditingProduct(product);
    setInventoryForm({
      price: String(product.price),
      sizeInventory: sizes.map((size) => ({ size, stock: String(sizeStock[size] ?? 0) }))
    });
  }

  async function saveInventory(event) {
    event.preventDefault();
    if (!editingProduct) return;
    setSaving(true);
    try {
      const { sizes, sizeStock } = parseSizeInventory(inventoryForm.sizeInventory);
      const updated = await updateAdminInventory(token, editingProduct._id, {
        price: Number(inventoryForm.price), sizes, sizeStock
      });
      setAdminProducts((current) => current.map((item) => item._id === updated._id ? updated : item));
      setDashboard((current) => current ? {
        ...current,
        lowStock: current.lowStock.map((item) => item._id === updated._id ? { ...item, stock: updated.stock } : item)
      } : current);
      setEditingProduct(null);
      onNotice('Product price, sizes, and size stock updated.');
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
      const coupon = await createAdminCoupon(token, {
          ...couponForm,
          value: Number(couponForm.value),
          minimumSpend: Number(couponForm.minimumSpend),
          usageLimit: couponForm.usageLimit ? Number(couponForm.usageLimit) : null,
          perCustomerLimit: Number(couponForm.perCustomerLimit),
          expiresAt: null,
          active: true
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
      const updated = await updateAdminCoupon(token, coupon._id, { active: !coupon.active });
      setCoupons((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function toggleProduct(product) {
    try {
      const updated = await updateAdminProduct(token, product._id, { active: !product.active });
      setAdminProducts((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function advanceOrder(order) {
    const nextStatus = { paid: 'processing', processing: 'shipped', shipped: 'delivered' }[order.status];
    if (!nextStatus) return;
    try {
      const updated = await updateAdminOrderStatus(token, order._id, nextStatus);
      setAdminOrders((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (error) {
      onNotice(error.message);
    }
  }

  return (
    <section className="page alternate-page admin-page">
      <div className="section-heading page-title"><h1>Store admin</h1><span><ShieldCheck size={15} /> Protected</span></div>
      {!online && <div className="offline-banner" role="status"><p>Admin changes need an internet connection and are disabled while offline.</p></div>}
      <div className="stats-grid">
        <div className="stat-card"><span>Paid orders</span><strong>{dashboard?.paidOrders ?? '—'}</strong></div>
        <div className="stat-card"><span>Gross sales</span><strong>{dashboard ? money(dashboard.grossSales) : '—'}</strong></div>
        <div className="stat-card"><span>Pending payment</span><strong>{dashboard?.pendingOrders ?? '—'}</strong></div>
      </div>
      <div className="admin-content-grid">
        <section className="admin-card"><h2><Store size={18} /> Add a product</h2>
          <form className="stack-form" onSubmit={addProduct}>
            <label>Name<input required minLength="2" maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Description<textarea required minLength="5" maxLength="2000" rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, sizeInventory: defaultSizeInventory(event.target.value) })}>{categories.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
            <SizeInventoryEditor rows={form.sizeInventory} onChange={(sizeInventory) => setForm((current) => ({ ...current, sizeInventory }))} />
            <label>Price (PHP)<input required type="number" min="0" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
            <label>Image URL<input required type="url" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /></label>
            <label>Condition<select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}>{['Like new', 'Very good', 'Good', 'Fair'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : 'Add product'} <ArrowRight size={17} /></button>
          </form>
        </section>
        <section className="admin-card"><h2><PackageCheck size={18} /> Low stock</h2>
          {dashboard?.lowStock?.length ? <ul className="low-stock-list">{dashboard.lowStock.map((product) => <li key={product._id}><span>{product.name}<small>{product.category}</small></span><strong>{product.stock} left</strong></li>)}</ul> : <p className="muted-copy">{dashboard ? 'No low-stock pieces.' : 'Loading inventory…'}</p>}
        </section>
        <section className="admin-card"><h2><Store size={18} /> Catalog management</h2>
          {editingProduct && (
            <form className="stack-form inventory-editor" onSubmit={saveInventory}>
              <h3>Edit {editingProduct.name}</h3>
              <label>Price (PHP)<input required type="number" min="0" step="1" value={inventoryForm.price} onChange={(event) => setInventoryForm({ ...inventoryForm, price: event.target.value })} /></label>
              <SizeInventoryEditor rows={inventoryForm.sizeInventory} onChange={(sizeInventory) => setInventoryForm((current) => ({ ...current, sizeInventory }))} />
              <div className="inventory-edit-actions"><button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : 'Save product changes'}</button><button className="secondary-button" type="button" onClick={() => setEditingProduct(null)}>Cancel</button></div>
            </form>
          )}
          <ul className="low-stock-list catalog-admin-list">{adminProducts.map((product) => <li key={product._id}><span>{product.name}<small>{product.category} · {money(product.price)} · {product.stock} in stock</small></span><span className="admin-product-actions"><button className="text-button" type="button" onClick={() => startInventoryEdit(product)} disabled={!online}>Edit price / sizes / stock</button><button className="text-button" type="button" onClick={() => toggleProduct(product)} disabled={!online}>{product.active ? 'Deactivate' : 'Reactivate'}</button></span></li>)}</ul>
        </section>
        <section className="admin-card"><h2><Check size={18} /> Coupons</h2>
          <form className="stack-form" onSubmit={addCoupon}>
            <label>Code<input required minLength="3" maxLength="40" value={couponForm.code} onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })} /></label>
            <div className="field-pair"><label>Type<select value={couponForm.type} onChange={(event) => setCouponForm({ ...couponForm, type: event.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed PHP</option></select></label><label>Value<input required type="number" min="0" max={couponForm.type === 'percentage' ? '100' : undefined} value={couponForm.value} onChange={(event) => setCouponForm({ ...couponForm, value: event.target.value })} /></label></div>
            <div className="field-pair"><label>Minimum spend<input required type="number" min="0" value={couponForm.minimumSpend} onChange={(event) => setCouponForm({ ...couponForm, minimumSpend: event.target.value })} /></label><label>Total uses<input type="number" min="1" value={couponForm.usageLimit} onChange={(event) => setCouponForm({ ...couponForm, usageLimit: event.target.value })} /></label></div>
            <label>Uses per customer<input required type="number" min="1" value={couponForm.perCustomerLimit} onChange={(event) => setCouponForm({ ...couponForm, perCustomerLimit: event.target.value })} /></label>
            <button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : 'Create coupon'} <ArrowRight size={17} /></button>
          </form>
          <ul className="low-stock-list coupon-list">{coupons.map((coupon) => <li key={coupon._id}><span><strong>{coupon.code}</strong><small>{coupon.type === 'percentage' ? `${coupon.value}% off` : `${money(coupon.value)} off`} · {coupon.usageCount ?? 0} used</small></span><button className="text-button" type="button" onClick={() => toggleCoupon(coupon)} disabled={!online}>{coupon.active ? 'Disable' : 'Enable'}</button></li>)}</ul>
        </section>
        <section className="admin-card"><h2><PackageCheck size={18} /> Recent orders</h2>
          {adminOrders.length ? <ul className="low-stock-list">{adminOrders.slice(0, 8).map((order) => <li key={order._id}><span>#{order._id.slice(-7).toUpperCase()} · {order.user?.name || 'Customer'}<small>{money(order.total)} · <span className={`status-pill status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span></small></span>{({ paid: 'processing', processing: 'shipped', shipped: 'delivered' })[order.status] && <button className="text-button" type="button" onClick={() => advanceOrder(order)} disabled={!online}>Mark {({ paid: 'processing', processing: 'shipped', shipped: 'delivered' })[order.status]}</button>}</li>)}</ul> : <p className="muted-copy">{dashboard ? 'No orders to show yet.' : 'Loading orders…'}</p>}
        </section>
      </div>
    </section>
  );
}
