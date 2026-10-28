import { ArrowRight, BookOpen } from 'lucide-react';
import type { Category, Product } from '../../lib/appDomain';
import { money, productTypeLabel } from '../../lib/appDomain';

type Props = {
  product: Product;
  categories: Category[];
  isLoggedIn: boolean;
  isLoading: boolean;
  isPremium: boolean;
  detailBase?: string;
  onNavigate: (path: string) => void;
  onBuy: (product: Product) => void;
};

/** Reusable public/store product card; intentionally receives navigation and purchase actions as props. */
export default function ProductCard({
  product,
  categories,
  isLoggedIn,
  isLoading,
  isPremium,
  detailBase = '/produkty',
  onNavigate,
  onBuy,
}: Props) {
  const now = Date.now();
  const hasTimedDiscount = Boolean(
    product.discount_is_active && Number(product.discount_percent) > 0
    && (!product.discount_starts_at || Date.parse(product.discount_starts_at) <= now)
    && (!product.discount_ends_at || Date.parse(product.discount_ends_at) >= now),
  );
  const regularPrice = Math.max(0, Number(product.price_amount || 0) * (hasTimedDiscount ? 1 - Number(product.discount_percent) / 100 : 1));
  const isChallenge = Boolean(product.is_challenge_product);
  const premiumIncluded = isChallenge && Number(product.price_amount) <= 19.99;
  const isIndividualPlan = product.product_key === 'plan-indywidualny';
  const isGenerator = product.product_key === 'generator-planu-treningowego';
  const showPremiumPrice = !product.is_free && !isGenerator;
  const premiumPrice = product.is_free ? 0 : premiumIncluded ? 0 : isIndividualPlan ? 49.99 : isChallenge ? Math.min(regularPrice, 5) : isGenerator ? regularPrice : regularPrice * 0.8;
  const productPath = `${detailBase}/${encodeURIComponent(product.product_key)}`;

  function openPurchase() {
    if (isIndividualPlan) {
      onNavigate(isLoggedIn ? '/app/plan/indywidualny' : `/login?next=${encodeURIComponent('/app/plan/indywidualny')}`);
      return;
    }
    onBuy(product);
  }

  return (
    <article className="sf-product-card">
      <button className="sf-product-art" onClick={() => onNavigate(productPath)} aria-label={`Szczegóły: ${product.title}`}>
        {product.cover_key
          ? <img className="sf-product-cover" src={`/api/v2/products/${encodeURIComponent(product.product_key)}/cover`} alt={`Okładka: ${product.title}`} loading="lazy" />
          : <span className="sf-art-circle"><BookOpen size={28} /></span>}
        <span className="sf-art-tag">{productTypeLabel(product.product_type)}</span>
      </button>
      <div className="sf-product-copy">
        <p className="sf-eyebrow">{categories.find(item => item.slug === product.category_slug)?.title || 'SYSTEM FORMY'}</p>
        <h3>{product.title}</h3>
        <p className="sf-muted">{product.description}</p>
        <div className="sf-product-bottom"><strong>{product.is_free ? 'Bezpłatny' : money(regularPrice, product.currency)}</strong></div>
        {showPremiumPrice && (
          <div className="sf-member-price">
            <span>W Premium</span>
            <b>{premiumIncluded ? 'W cenie abonamentu' : money(premiumPrice, product.currency)}</b>
            <small>{premiumIncluded
              ? 'Bez dodatkowej opłaty dla aktywnego Premium'
              : isIndividualPlan
                ? 'Cena z rabatem Premium'
                : isChallenge
                  ? 'Cena wyzwania dla Premium · do 5 zł'
                  : 'Cena po rabacie 20%'}</small>
          </div>
        )}
        <button className="sf-button sf-button-lime sf-button-full sf-product-buy" disabled={isLoading} onClick={openPurchase}>
          {isLoading ? 'Przetwarzanie…' : product.is_free ? 'Odbierz materiał' : isIndividualPlan ? 'Zamów plan' : premiumIncluded && isPremium ? 'Odbierz w Premium' : 'Kup teraz'} <ArrowRight size={15} />
        </button>
        <button className="sf-button sf-button-outline sf-button-full sf-product-more" onClick={() => onNavigate(productPath)}>Sprawdź więcej</button>
      </div>
    </article>
  );
}
