import { Heart } from 'lucide-react';

const money = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH')}`;

export default function ProductCard({ product, liked, availability, onOpen, onToggleFavorite }) {
  return (
    <article className="product-card">
      <button className="product-image" type="button" onClick={() => onOpen(product)} aria-label={`View ${product.name}`}>
        {product.tag && <span className="tag">{product.tag}</span>}
        <img src={product.image} alt={product.name} loading="lazy" />
      </button>
      <button
        className={liked ? 'favorite active' : 'favorite'}
        type="button"
        aria-label={liked ? 'Remove from saved pieces' : 'Save piece'}
        aria-pressed={liked}
        onClick={() => onToggleFavorite(product)}
      >
        <Heart size={19} fill={liked ? 'currentColor' : 'none'} />
      </button>
      <button className="product-copy" type="button" onClick={() => onOpen(product)}>
        <span className="product-name">{product.name}</span>
        <span className="product-meta">{product.size} · {product.condition} · {availability}</span>
        <span className="price-row"><strong>{money(product.price)}</strong></span>
      </button>
    </article>
  );
}
