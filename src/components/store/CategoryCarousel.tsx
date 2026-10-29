import { useRef } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import type { Category } from '../../lib/appDomain';

type Props = {
  categories: Category[];
  selected: string;
  onSelect: (slug: string) => void;
  hasChallenges: boolean;
};

/** Mobile-friendly horizontal category carousel shared by public and in-app catalogs. */
export default function CategoryCarousel({ categories, selected, onSelect, hasChallenges }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const categoryOptions = [
    { slug: 'all', title: 'Wszystkie' },
    ...categories.filter(category => category.slug !== 'all' && category.slug !== '__challenges__' && category.slug !== 'wyzwania'),
    ...((hasChallenges || categories.some(category => category.slug === 'wyzwania')) ? [{ slug: categories.some(category => category.slug === 'wyzwania') ? 'wyzwania' : '__challenges__', title: 'Wyzwania' }] : []),
  ];

  return (
    <section className="sf-category-picker" aria-label="Kategorie produktów">
      <div className="sf-category-picker-heading">
        <span className="sf-category-picker-mark"><SlidersHorizontal size={16} /></span>
        <div>
          <p className="sf-eyebrow">KATALOG PRODUKTÓW</p>
          <h2>Wybierz kategorię</h2>
        </div>
        <span className="sf-category-picker-hint">Przesuń, aby zobaczyć więcej</span>
      </div>
      <div className="sf-category-carousel">
        <button type="button" className="sf-category-arrow" aria-label="Przewiń kategorie w lewo" onClick={() => listRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}><ChevronLeft size={18} /></button>
        <div className="sf-category-carousel-track" ref={listRef} role="group" aria-label="Wybierz kategorię produktów">
          {categoryOptions.map(option => (
            <button type="button" key={option.slug} className={`sf-category-chip${selected === option.slug ? ' is-active' : ''}`} aria-pressed={selected === option.slug} onClick={() => onSelect(option.slug)}>
              {option.title}
            </button>
          ))}
        </div>
        <button type="button" className="sf-category-arrow" aria-label="Przewiń kategorie w prawo" onClick={() => listRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}><ChevronRight size={18} /></button>
      </div>
    </section>
  );
}
