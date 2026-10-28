import type { ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check } from 'lucide-react';
import type { Category, Product } from '../../lib/appDomain';
import { money, productTypeLabel } from '../../lib/appDomain';

type Props = {
  selectedProduct: Product | null;
  categories: Category[];
  backPath: string;
  isLoading: boolean;
  isLoggedIn: boolean;
  productCode: string;
  onProductCodeChange: (value: string) => void;
  onNavigate: (path: string) => void;
  onBuy: (product: Product) => void;
};

function discountIsActive(product: Product, now: number): boolean {
  return Boolean(
    product.discount_is_active && Number(product.discount_percent) > 0
    && (!product.discount_starts_at || Date.parse(product.discount_starts_at) <= now)
    && (!product.discount_ends_at || Date.parse(product.discount_ends_at) >= now),
  );
}

function getContents(product: Product): string[] {
  if (product.contents) return product.contents;
  try {
    const value: unknown = JSON.parse(product.contents_json || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Public and in-app product detail page; purchase and routing remain controlled by AppV2. */
export default function ProductDetail({
  selectedProduct,
  categories,
  backPath,
  isLoading,
  isLoggedIn,
  productCode,
  onProductCodeChange,
  onNavigate,
  onBuy,
}: Props) {
  if (!selectedProduct) {
    return <main className="sf-container sf-product-detail"><div className="sf-empty"><h2>Nie znaleziono produktu</h2><button className="sf-button sf-button-lime" onClick={() => onNavigate(backPath)}>Wróć do katalogu</button></div></main>;
  }

  const product = selectedProduct;
  const contents = getContents(product);
  const now = Date.now();
  const hasTimedDiscount = discountIsActive(product, now);
  const discountedPrice = Number(product.price_amount) * (hasTimedDiscount ? 1 - Number(product.discount_percent) / 100 : 1);
  const isChallenge = Boolean(product.is_challenge_product);
  const isIndividualPlan = product.product_key === 'plan-indywidualny';
  const hasPremiumPrice = !product.is_free && product.product_key !== 'generator-planu-treningowego';
  let premiumPriceLabel = '';
  let premiumExplanation = '';
  if (isChallenge && Number(product.price_amount) <= 19.99) {
    premiumPriceLabel = 'W cenie abonamentu';
    premiumExplanation = 'Wyzwanie w cenie abonamentu';
  } else if (isIndividualPlan) {
    premiumPriceLabel = '49,99 zł';
    premiumExplanation = 'Cena z rabatem Premium';
  } else if (isChallenge) {
    premiumPriceLabel = money(Math.min(discountedPrice, 5), product.currency);
    premiumExplanation = 'Cena wyzwania dla Premium';
  } else {
    premiumPriceLabel = money(discountedPrice * 0.8, product.currency);
    premiumExplanation = 'Rabat dla aktywnych subskrybentów Premium';
  }

  function purchase() {
    if (isIndividualPlan) {
      onNavigate(isLoggedIn ? '/app/plan/indywidualny' : `/login?next=${encodeURIComponent('/app/plan/indywidualny')}`);
      return;
    }
    onBuy(product);
  }

  return (
    <main className="sf-container sf-product-detail">
      <button className="sf-back-link" onClick={() => onNavigate(backPath)}><ArrowLeft size={16} /> Wszystkie produkty</button>
      <div className="sf-detail-grid">
        <div className="sf-detail-art">
          {product.cover_key
            ? <img className="sf-detail-cover" src={`/api/v2/products/${encodeURIComponent(product.product_key)}/cover`} alt={`Okładka: ${product.title}`} />
            : <span className="sf-art-circle"><BookOpen size={44} /></span>}
          <p>{productTypeLabel(product.product_type)}</p>
          <span className="sf-detail-lime">SYSTEM FORMY</span>
        </div>
        <section className="sf-detail-copy">
          <p className="sf-eyebrow">{categories.find(item => item.slug === product.category_slug)?.title || 'MATERIAŁ CYFROWY'}</p>
          <h1>{product.title}</h1>
          <p className="sf-lead">{product.description}</p>
          {product.target_audience && <div className="sf-info-note"><b>Dla kogo?</b><p>{product.target_audience}</p></div>}
          <h3>Co znajdziesz w środku</h3>
          {contents.length
            ? <ul className="sf-check-list">{contents.map((item, index) => <li key={`${index}-${item}`}><Check size={16} />{item}</li>)}</ul>
            : <p className="sf-muted">Szczegóły zawartości zostaną uzupełnione przez administratora.</p>}
          <div className="sf-purchase-panel">
            <div>
              <small>CENA</small>
              <strong>{product.is_free
                ? 'Bezpłatny'
                : hasTimedDiscount
                  ? <><del>{money(product.price_amount, product.currency)}</del> {money(discountedPrice, product.currency)} <small>-{product.discount_percent}%</small></>
                  : money(product.price_amount, product.currency)}</strong>
            </div>
            {hasPremiumPrice && <div className="sf-member-price sf-member-price-detail"><span>Cena z Premium</span><b>{premiumPriceLabel}</b><small>{premiumExplanation}</small></div>}
            {!product.is_free && <label className="sf-promo-inline"><span>Kod rabatowy</span><input value={productCode} onChange={(event: ChangeEvent<HTMLInputElement>) => onProductCodeChange(event.target.value.toUpperCase())} placeholder="KOD (opcjonalnie)" maxLength={80} /></label>}
            <button className="sf-button sf-button-lime sf-button-full" disabled={isLoading} onClick={purchase}>
              {isLoading ? 'Przetwarzanie…' : product.is_free ? 'Odbierz materiał' : isIndividualPlan ? 'Zamów plan' : 'Kup teraz'} <ArrowRight size={17} />
            </button>
            <small className="sf-muted">{isLoggedIn ? 'Dostęp przypisujemy do Twojego konta.' : 'Po zalogowaniu materiał będzie przypisany do Twojego konta.'}</small>
          </div>
        </section>
      </div>
    </main>
  );
}
