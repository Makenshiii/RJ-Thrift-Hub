import { Bot, LoaderCircle, Sparkles } from 'lucide-react';

const money = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH')}`;

export default function AiDiscovery({ prompt, onPromptChange, onSubmit, busy, available, result, onOpenProduct }) {
  return (
    <section className="ai-card">
      <div className="ai-heading">
        <span className="ai-icon"><Bot size={19} /></span>
        <div>
          <h2>Find your next favorite</h2>
          <p>Personalized ideas from available pieces.</p>
        </div>
      </div>
      <form className="ai-form" onSubmit={onSubmit}>
        <input
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          maxLength={500}
          placeholder="Try “size M under ₱300”"
          aria-label="Describe what you are looking for"
        />
        <button className="primary-button" type="submit" disabled={busy || !available || !prompt.trim()}>
          {busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
          {busy ? 'Finding…' : 'Find pieces'}
        </button>
      </form>
      {result && (
        <div className="ai-result">
          <p>{result.message}</p>
          <div className="ai-result-list">
            {result.products.map((product) => (
              <button key={product.id} type="button" onClick={() => onOpenProduct(product)}>
                {product.name}<strong>{money(product.price)}</strong>
              </button>
            ))}
          </div>
          <small>Recommendations use live catalog availability.</small>
        </div>
      )}
    </section>
  );
}
