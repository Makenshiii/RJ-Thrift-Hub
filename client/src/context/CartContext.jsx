import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  addCartItem as addCartItemRequest,
  getCart as getCartRequest,
  removeCartItem as removeCartItemRequest,
  updateCartItem as updateCartItemRequest
} from '../api/cart.js';
import { getProductId } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { useNetworkStatus } from './NetworkStatusContext.jsx';

const CartContext = createContext(null);

function cacheKey(userId) {
  return `rj-offline-cart-v1-${userId}`;
}

function validCartSnapshot(value) {
  if (!value || !Array.isArray(value.items)) return null;
  const items = value.items.filter((item) =>
    item &&
    item.product &&
    typeof getProductId(item.product) === 'string' &&
    typeof item.product.name === 'string' &&
    Number.isFinite(Number(item.product.price)) &&
    typeof item.size === 'string' &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    item.quantity <= 9999
  );
  return { items };
}

function readCachedCart(userId) {
  try {
    return validCartSnapshot(JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null'));
  } catch {
    return null;
  }
}

function saveCachedCart(userId, items) {
  if (!userId) return;
  try {
    const safeItems = items.map(({ product, size, quantity }) => ({
      product: {
        id: getProductId(product),
        name: String(product.name || '').slice(0, 120),
        image: String(product.image || ''),
        price: Number(product.price),
        condition: String(product.condition || ''),
        size_stock: product.size_stock || {},
        stock: Number(product.stock || 0)
      },
      size: String(size || ''),
      quantity: Number(quantity)
    }));
    localStorage.setItem(cacheKey(userId), JSON.stringify({ items: safeItems }));
  } catch (error) {
    console.warn('RJ Thrift Hub could not save the cart for offline viewing.', error?.name || 'StorageError');
  }
}

function optimisticQuantity(items, productId, size, quantity) {
  return items.map((item) => {
    if (getProductId(item.product) !== productId || item.size !== size) return item;
    return {
      ...item,
      quantity,
      lineTotal: Number(item.product.price) * quantity
    };
  });
}

export function CartProvider({ children }) {
  const { token, user } = useAuth();
  const { online } = useNetworkStatus();
  const [items, setItems] = useState([]);
  const [itemsOwnerId, setItemsOwnerId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userId = user?.id ?? user?._id;
  const lastUserId = useRef(null);

  const applyCart = useCallback((cart) => {
    const nextItems = cart?.items || [];
    setItems(nextItems);
    setItemsOwnerId(userId || null);
    if (userId) saveCachedCart(userId, nextItems);
    setError('');
  }, [userId]);

  const refreshCart = useCallback(async (signal) => {
    if (!token || !online) return;
    const cart = await getCartRequest(token, signal);
    applyCart(cart);
    return cart;
  }, [applyCart, online, token]);

  useEffect(() => {
    if (userId) {
      if (lastUserId.current && lastUserId.current !== userId) {
        setItems([]);
        setItemsOwnerId(null);
      }
      lastUserId.current = userId;
    } else {
      if (lastUserId.current) {
        try {
          localStorage.removeItem(cacheKey(lastUserId.current));
        } catch {
          setError('The previous offline cart could not be removed from this browser.');
        }
      }
      lastUserId.current = null;
      setItems([]);
      setItemsOwnerId(null);
      return;
    }

    if (!token) return;
    const controller = new AbortController();
    let active = true;
    async function loadCart() {
      setLoading(true);
      const cached = readCachedCart(userId);
      if (cached && !online && active) {
        setItems(cached.items);
        setItemsOwnerId(userId);
      }
      if (!online) {
        setLoading(false);
        return;
      }
      try {
        const cart = await getCartRequest(token, controller.signal);
        if (active) applyCart(cart);
      } catch (loadError) {
        if (active && loadError.name !== 'AbortError') {
          if (cached) {
            setItems(cached.items);
            setItemsOwnerId(userId);
          }
          setError(loadError.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCart();
    return () => {
      active = false;
      controller.abort();
    };
  }, [applyCart, online, token, userId]);

  const addItem = useCallback(async (product, size, quantity = 1) => {
    if (!online) throw new Error('Adding items needs an internet connection.');
    if (!token) throw new Error('Sign in before adding items to your bag.');
    const previous = items;
    const id = getProductId(product);
    const existing = items.find((item) => getProductId(item.product) === id && item.size === size);
    const optimistic = existing
      ? items.map((item) => item === existing ? { ...item, quantity: item.quantity + quantity, lineTotal: product.price * (item.quantity + quantity) } : item)
      : [...items, { product, size, quantity, lineTotal: product.price * quantity }];
    setItems(optimistic);
    saveCachedCart(userId, optimistic);
    try {
      applyCart(await addCartItemRequest(token, { productId: id, size, quantity }));
    } catch (requestError) {
      setItems(previous);
      saveCachedCart(userId, previous);
      throw requestError;
    }
  }, [applyCart, items, online, token, userId]);

  const setQuantity = useCallback(async (item, quantity) => {
    if (!online) throw new Error('Changing quantities needs an internet connection.');
    if (!token) throw new Error('Sign in before changing your bag.');
    const previous = items;
    const id = getProductId(item.product);
    const optimistic = optimisticQuantity(items, id, item.size, quantity);
    setItems(optimistic);
    saveCachedCart(userId, optimistic);
    try {
      applyCart(await updateCartItemRequest(token, id, { size: item.size, quantity }));
    } catch (requestError) {
      setItems(previous);
      saveCachedCart(userId, previous);
      throw requestError;
    }
  }, [applyCart, items, online, token, userId]);

  const removeItem = useCallback(async (item) => {
    if (!online) throw new Error('Removing items needs an internet connection.');
    if (!token) throw new Error('Sign in before changing your bag.');
    const previous = items;
    const id = getProductId(item.product);
    const optimistic = items.filter((entry) => getProductId(entry.product) !== id || entry.size !== item.size);
    setItems(optimistic);
    saveCachedCart(userId, optimistic);
    try {
      applyCart(await removeCartItemRequest(token, id, item.size));
    } catch (requestError) {
      setItems(previous);
      saveCachedCart(userId, previous);
      throw requestError;
    }
  }, [applyCart, items, online, token, userId]);

  const visibleItems = userId && itemsOwnerId === userId ? items : [];
  const subtotal = visibleItems.reduce((sum, item) =>
    sum + (Number(item.lineTotal) || Number(item.product.price) * item.quantity), 0);
  const count = visibleItems.reduce((sum, item) => sum + item.quantity, 0);
  const value = useMemo(() => ({
    items: visibleItems, loading, error, online, subtotal, count,
    refreshCart, addItem, setQuantity, removeItem
  }), [visibleItems, loading, error, online, subtotal, count, refreshCart, addItem, setQuantity, removeItem]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider.');
  return context;
}
