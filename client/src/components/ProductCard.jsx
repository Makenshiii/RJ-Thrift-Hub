import { Heart, ShoppingBag } from 'lucide-react';

const money = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
});

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
        <span className="product-meta">{product.sizes?.length > 1 ? `${product.sizes.length} sizes` : product.size} · {product.condition} · {availability}</span>
        <span className="price-row"><strong>{money.format(Number(product.price) || 0)}</strong></span>
      </button>
      <button className="card-order-button" type="button" onClick={() => onOpen(product)}>
        Order <ShoppingBag size={15} />
      </button>
    </article>
  );
}
