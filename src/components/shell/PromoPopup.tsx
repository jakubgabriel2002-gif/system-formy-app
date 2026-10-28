import { ArrowRight, BookOpen, Sparkles, X } from 'lucide-react';
import type { Product } from '../../lib/appDomain';

type Mode = 'trialWelcome' | 'premium' | 'product';
type Props = {
  mode: Mode;
  product?: Product;
  onClose: () => void;
  onPremium: () => void;
  onProduct: (productKey?: string) => void;
  onStore: () => void;
};

export default function PromoPopup({ mode, product, onClose, onPremium, onProduct, onStore }: Props) {
  return (
    <div className="sf-product-popup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sf-product-popup" role="dialog" aria-modal="true" aria-labelledby="sf-product-popup-title">
        <button className="sf-product-popup-close" aria-label="Zamknij okno" onClick={onClose}><X size={19}/></button>
        <span className="sf-product-popup-icon"><Sparkles size={25}/></span>
        {mode === 'trialWelcome' ? <>
          <p className="sf-eyebrow">PREMIUM NA START</p>
          <h2 id="sf-product-popup-title">Masz 3 dni Premium za darmo!</h2>
          <p>Korzystaj z dodatkowych funkcji, rabatów i aplikacji bez reklam. Nie pobierzemy opłaty automatycznie — po 3 dniach samodzielnie zdecydujesz, czy chcesz wykupić abonament.</p>
          <div className="sf-product-popup-actions">
            <button className="sf-button sf-button-lime sf-button-full" onClick={onPremium}>Poznaj możliwości Premium <ArrowRight size={16}/></button>
            <button className="sf-product-popup-dismiss" onClick={onClose}>Przejdź do aplikacji</button>
          </div>
          <small>Okres próbny przysługuje tylko raz i wyłącznie nowo zarejestrowanym kontom.</small>
        </> : mode === 'premium' ? <>
          <p className="sf-eyebrow">ODKRYJ WIĘCEJ</p>
          <h2 id="sf-product-popup-title">Poznaj możliwości Premium</h2>
          <p>Korzystaj bez reklam, z 20% rabatu na materiały, wybranymi wyzwaniami w cenie i dodatkowymi możliwościami treningowymi.</p>
          <div className="sf-product-popup-actions">
            <button className="sf-button sf-button-lime sf-button-full" onClick={onPremium}>Sprawdź Premium — 50 zł / miesiąc <ArrowRight size={16}/></button>
            <button className="sf-product-popup-dismiss" onClick={onClose}>Nie teraz</button>
          </div>
          <small>Roczny plan kosztuje 250 zł.</small>
        </> : <>
          <p className="sf-eyebrow">POLECANY MATERIAŁ</p>
          <h2 id="sf-product-popup-title">{product?.title || 'Znajdź coś dla swojego celu'}</h2>
          <p>{product?.description || 'Sprawdź dostępne plany treningowe, wyzwania i materiały przygotowane przez System Formy.'}</p>
          <div className="sf-product-popup-actions">
            <button className="sf-button sf-button-lime sf-button-full" onClick={() => onProduct(product?.product_key)}><BookOpen size={16}/> Zobacz produkt <ArrowRight size={16}/></button>
            <button className="sf-button sf-button-outline sf-button-full" onClick={onStore}>Przeglądaj cały sklep</button>
            <button className="sf-product-popup-dismiss" onClick={onClose}>Nie teraz</button>
          </div>
          <small>Pokazujemy wyłącznie produkty Systemu Formy.</small>
        </>}
      </section>
    </div>
  );
}
