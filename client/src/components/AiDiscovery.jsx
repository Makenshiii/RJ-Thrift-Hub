import { useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, Sparkles } from 'lucide-react';
import { discoverProducts } from '../api/ai.js';
import { listProducts } from '../api/products.js';
import ProductCard from './ProductCard.jsx';
import { AI_QUERY_MAX_LENGTH, AI_QUERY_MIN_LENGTH, sanitizeAiQuery } from '../../../shared/aiDiscovery.mjs';

export default function AiDiscovery({
  available,
  favorites,
  onOpenProduct,
  onToggleFavorite
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const controllerRef = useRef(null);
  const busy = status === 'loading';
  const normalizedQuery = sanitizeAiQuery(query);
  const validLength = normalizedQuery.length >= AI_QUERY_MIN_LENGTH &&
    normalizedQuery.length <= AI_QUERY_MAX_LENGTH;

  useEffect(() => () => controllerRef.current?.abort(), []);

  function changeQuery(value) {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setQuery(value);
    setResult(null);
    setErrorMessage('');
    setStatus('idle');
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || controllerRef.current) return;

    const cleanQuery = sanitizeAiQuery(query);
    setQuery(cleanQuery);
    if (cleanQuery.length < AI_QUERY_MIN_LENGTH || cleanQuery.length > AI_QUERY_MAX_LENGTH) {
      setResult(null);
      setStatus('validation-error');
      setErrorMessage(`Enter between ${AI_QUERY_MIN_LENGTH} and ${AI_QUERY_MAX_LENGTH} characters.`);
      return;
    }
    if (!available) {
      setStatus('network-error');
      setErrorMessage('Connect to the shop service before searching.');
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setResult(null);
    setErrorMessage('');
    setStatus('loading');
    try {
      const data = await discoverProducts(cleanQuery, controller.signal);
      if (!controller.signal.aborted) {
        setResult(data);
        setStatus(data.products?.length ? 'results' : 'empty');
      }
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') return;
      if (error.status === 503 && error.code === 'AI_UNAVAILABLE') {
        try {
          const products = await listProducts(
            { search: cleanQuery, limit: 12 },
            { signal: controller.signal }
          );
          if (!controller.signal.aborted) {
            setResult({ aiAssisted: false, standardSearch: true, products, meta: { count: products.length } });
            setStatus(products.length ? 'standard-results' : 'empty');
          }
        } catch (fallbackError) {
          if (controller.signal.aborted || fallbackError.name === 'AbortError') return;
          setStatus(fallbackError.status === 0 ? 'network-error' : 'error');
          setErrorMessage('Standard search could not be completed. Please try again.');
        }
      } else if (error.status === 429) {
        setStatus('rate-limited');
        setErrorMessage('AI search is busy. Please wait a little and try again.');
      } else if (error.status === 400) {
        setStatus('validation-error');
        setErrorMessage(`Please enter a search request between ${AI_QUERY_MIN_LENGTH} and ${AI_QUERY_MAX_LENGTH} characters.`);
      } else if (error.status === 0) {
        setStatus('network-error');
        setErrorMessage('The shop service is unreachable. Check your connection and try again.');
      } else {
        setStatus('error');
        setErrorMessage('Search could not be completed. Please try again.');
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (controller.signal.aborted) setStatus('idle');
      }
    }
  }

  return (
    <section className="ai-card" aria-busy={busy}>
      <div className="ai-heading">
        <span className="ai-icon"><Bot size={19} /></span>
        <div>
          <h2>Find your next favorite</h2>
          <p>Describe the style, size, or budget you have in mind.</p>
        </div>
      </div>
      <form className="ai-form" onSubmit={submit}>
        <label className="ai-query-label" htmlFor="ai-discovery-query">What are you looking for?</label>
        <input
          id="ai-discovery-query"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          maxLength={AI_QUERY_MAX_LENGTH}
          placeholder="Try “a cozy brown jacket under 800, size L”"
          aria-describedby="ai-query-count ai-discovery-status"
          autoComplete="off"
        />
        <div className="ai-form-footer">
          <span id="ai-query-count" className="ai-character-count">
            {normalizedQuery.length}/{AI_QUERY_MAX_LENGTH}
          </span>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || !available || !validLength}
          >
            {busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            {busy ? 'Finding…' : 'Find pieces'}
          </button>
        </div>
      </form>

      <div id="ai-discovery-status" className="ai-status" role="status" aria-live="polite">
        {busy && <span>Searching catalog…</span>}
        {status === 'validation-error' && <span>{errorMessage}</span>}
        {status === 'rate-limited' && <span>{errorMessage}</span>}
        {status === 'network-error' && <span>{errorMessage}</span>}
        {status === 'error' && <span>{errorMessage}</span>}
        {status === 'idle' && normalizedQuery.length > 0 && normalizedQuery.length < AI_QUERY_MIN_LENGTH &&
          <span>Enter at least {AI_QUERY_MIN_LENGTH} characters.</span>}
        {result?.standardSearch && <span>Showing standard search results.</span>}
        {status === 'empty' && <span>No matches. Try fewer words.</span>}
      </div>

      {busy && (
        <div className="ai-product-grid product-grid" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => <div className="ai-skeleton" key={index} />)}
        </div>
      )}

      {result && !busy && (
        <div className="ai-result">
          <div className="ai-result-heading">
            <h3>{result.standardSearch ? 'Search results' : 'Suggested pieces'}</h3>
            {result.aiAssisted && <span className="ai-badge">AI-Assisted</span>}
          </div>
          {result.aiAssisted && (
            <p className="ai-disclosure">
              Suggestions are AI-assisted and may be imperfect. Prices and availability come from our catalog.
            </p>
          )}
          {result.products?.length > 0 && (
            <div className="ai-product-grid product-grid">
              {result.products.map((product) => (
                <div className="ai-product-result" key={product.id}>
                  <ProductCard
                    product={product}
                    liked={favorites?.includes(product.id) || false}
                    availability={`${product.stock} in stock`}
                    onOpen={onOpenProduct}
                    onToggleFavorite={onToggleFavorite}
                  />
                  {product.aiNote && (
                    <p className="ai-note">
                      <span className="ai-badge">AI-Assisted</span>
                      <span>{product.aiNote}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
