import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Send, Dumbbell, Home, ShieldCheck } from 'lucide-react';

type Props = {
  name: string;
  email: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => Promise<boolean>;
};

const FORM_STORAGE_KEY = 'sf-individual-plan-form-v1';
const REQUEST_STORAGE_KEY = 'sf-individual-plan-request-id';
const EQUIPMENT_OPTIONS = [
  ['dumbbells', 'Hantle'], ['bands', 'Gumy oporowe'], ['bench', 'Ławka treningowa'],
  ['squat_rack', 'Stojaki / sztanga'], ['pullup_bar', 'Drążek do podciągania'], ['kettlebell', 'Kettlebell'],
  ['suspension', 'Taśmy podwieszane'],
] as const;
const MAX_FIELDS = [
  { key: 'max_bench_press', gym: 'Wyciskanie sztangi leżąc', home: 'Pompki', unitGym: 'kg lub powtórzenia', unitHome: 'powtórzenia' },
  { key: 'max_squat', gym: 'Przysiad', home: 'Przysiady', unitGym: 'kg lub powtórzenia', unitHome: 'powtórzenia' },
  { key: 'max_situps', gym: 'Brzuszki', home: 'Brzuszki', unitGym: 'powtórzenia', unitHome: 'powtórzenia' },
  { key: 'max_deadlift', gym: 'Martwy ciąg', home: 'Pajacyki', unitGym: 'kg lub powtórzenia', unitHome: 'powtórzenia' },
] as const;

const DEFAULTS: Record<string, string> = {
  goal: 'muscle', level: 'beginner', location: 'gym', days_per_week: '3', session_minutes: '60', progression: 'reps',
  age: '', sex: '', weight_kg: '', height_cm: '', illnesses: '', injuries: '', congenital_conditions: '',
  max_bench_press: '', max_squat: '', max_situps: '', max_deadlift: '',
  max_bench_press_unknown: 'false', max_squat_unknown: 'false', max_situps_unknown: 'false', max_deadlift_unknown: 'false',
  training_history: '', schedule: '', preferences: '', avoid: '', unable_exercises: '', medications: '', conditioning_rating: '5', strength_rating: '5', notes: '', consent: 'false', equipment: '[]',
};

function parseStored(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch { return {}; }
}

export default function IndividualPlanRequest({ name, email, saving, onCancel, onSubmit }: Props) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...DEFAULTS }));
  const [equipment, setEquipment] = useState<string[]>([]);
  const [paymentNotice, setPaymentNotice] = useState('');
  const location = answers.location || 'gym';
  const onHomeEquipment = location !== 'gym';
  const maxProfile = location === 'gym' ? 'gym' : 'home';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'cancelled') setPaymentNotice('Płatność nie została zakończona. Nie pobrano opłaty. Odpowiedzi są zachowane — możesz ponownie przejść do płatności.');
    const requestId = params.get('request_id');
    if (requestId) { try { sessionStorage.setItem(REQUEST_STORAGE_KEY, requestId); } catch { /* optional */ } }
    const saved = parseStored(sessionStorage.getItem(FORM_STORAGE_KEY));
    if (Object.keys(saved).length) {
      setAnswers(old => ({ ...old, ...saved }));
      try {
        const gear = JSON.parse(saved.equipment || '[]');
        if (Array.isArray(gear)) setEquipment(gear.filter((x): x is string => typeof x === 'string'));
      } catch { if (saved.equipment && saved.equipment !== 'gym' && saved.equipment !== 'none') setEquipment([saved.equipment]); }
    }
  }, []);

  function set(key: string, value: string) { setAnswers(old => ({ ...old, [key]: value })); }
  function toggleEquipment(id: string) { setEquipment(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); }

  const serializedAnswers = useMemo(() => ({ ...answers, equipment: location === 'gym' ? 'gym' : JSON.stringify(equipment) }), [answers, equipment, location]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!answers.age || Number(answers.age) < 13 || Number(answers.age) > 100) { setError('Podaj prawidłowy wiek (13–100 lat).'); return; }
    if (!answers.weight_kg || Number(answers.weight_kg) < 25 || Number(answers.weight_kg) > 400) { setError('Podaj prawidłową wagę w kilogramach.'); return; }
    if (!answers.height_cm || Number(answers.height_cm) < 100 || Number(answers.height_cm) > 250) { setError('Podaj prawidłowy wzrost w centymetrach.'); return; }
    if (!answers.sex) { setError('Wybierz płeć lub opcję „Wolę nie podawać”.'); return; }
    if (!answers.consent || answers.consent !== 'true') { setError('Zaznacz zgodę na wykorzystanie odpowiedzi do przygotowania i obsługi zamówienia.'); return; }
    try {
      const values = { ...serializedAnswers, training_history: answers.training_history || '', schedule: answers.schedule || '', preferences: answers.preferences || '', avoid: answers.avoid || '', notes: answers.notes || '', consent: 'true' };
      try { sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(values)); } catch { /* optional */ }
      const requestId = sessionStorage.getItem(REQUEST_STORAGE_KEY) || '';
      values.request_id = requestId;
      const redirecting = await onSubmit(values);
      if (!redirecting) setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się przygotować płatności. Odpowiedzi zostały zachowane — spróbuj ponownie.'); }
  }

  if (sent) return <section className="sf-view sf-individual-plan-view"><div className="sf-panel sf-individual-plan-success"><span><CheckCircle2 size={28}/></span><p className="sf-eyebrow">FORMULARZ ZAPISANY</p><h1>Dziękuję za odpowiedzi.</h1><p>Formularz został zapisany. Wróć do planów, aby kontynuować.</p><button className="sf-button sf-button-lime" onClick={onCancel}>Wróć do planów</button></div></section>;

  return <section className="sf-view sf-individual-plan-view">
    <button type="button" className="sf-back-link" onClick={onCancel}><ArrowLeft size={16}/> Wróć do planów</button>
    <header className="sf-gen-hero"><div className="sf-gen-hero-mark"><ClipboardList size={24}/></div><p className="sf-eyebrow">PLAN PRZYGOTOWANY DLA CIEBIE</p><h1>Zamów plan <span>indywidualny.</span></h1><p>Wypełnij ankietę, żeby plan uwzględniał Twój cel, możliwości, wyposażenie i ograniczenia. Po opłaceniu zamówienia odpowiedzi pojawią się w panelu administratora.</p><div className="sf-individual-steps"><span><b>01</b> Ankieta</span><span><b>02</b> Płatność</span><span><b>03</b> Realizacja</span></div><p className="sf-muted"><ShieldCheck size={14} style={{ display: 'inline', verticalAlign: 'middle' }}/> Odpowiedzi wykorzystamy wyłącznie do obsługi Twojego zamówienia i przygotowania planu.</p><p className="sf-individual-plan-price">149,99 zł <small>jednorazowo</small></p></header>
    <form className="sf-panel sf-form-stack sf-individual-plan-form" onSubmit={submit}>
      <div className="sf-individual-contact"><b>{name || 'Użytkownik'}</b><span>{email}</span><small>Dane kontaktowe pobrane z konta.</small></div>
      <section className="sf-question-section"><div className="sf-question-section-title"><span>01</span><div><h3>Podstawowe informacje</h3><p>Pomogą dopasować plan i odpowiednią objętość treningu.</p></div></div>
        <div className="sf-form-grid"><label>Wiek *<input type="number" min="13" max="100" required value={answers.age} onChange={e=>set('age',e.target.value)} placeholder="np. 28"/></label><label>Płeć *<select value={answers.sex} required onChange={e=>set('sex',e.target.value)}><option value="">Wybierz…</option><option value="female">Kobieta</option><option value="male">Mężczyzna</option><option value="other">Inna</option><option value="prefer_not_to_say">Wolę nie podawać</option></select></label><label>Waga (kg) *<input type="number" min="25" max="400" step="0.1" required value={answers.weight_kg} onChange={e=>set('weight_kg',e.target.value)} placeholder="np. 82"/></label><label>Wzrost (cm) *<input type="number" min="100" max="250" required value={answers.height_cm} onChange={e=>set('height_cm',e.target.value)} placeholder="np. 178"/></label></div>
      </section>
      <section className="sf-question-section"><div className="sf-question-section-title"><span>02</span><div><h3>Zdrowie i ograniczenia</h3><p>Wpisz informacje istotne dla bezpiecznego planowania treningu. Nie zastępuje to konsultacji medycznej.</p></div></div>
        <label>Czy obecnie chorujesz na coś, co może wpływać na trening?<textarea rows={2} maxLength={1200} value={answers.illnesses} onChange={e=>set('illnesses',e.target.value)} placeholder="Jeśli nie — wpisz ‘nie’. Możesz pominąć szczegóły, których nie chcesz podawać."/></label>
        <label>Czy masz kontuzje lub ból przy wykonywaniu ruchu?<textarea rows={2} maxLength={1200} value={answers.injuries} onChange={e=>set('injuries',e.target.value)} placeholder="Np. ograniczona ruchomość barku, ból kolana…"/></label>
        <label>Czy masz wady wrodzone lub inne ograniczenia ruchowe?<textarea rows={2} maxLength={1200} value={answers.congenital_conditions} onChange={e=>set('congenital_conditions',e.target.value)} placeholder="Wpisz tylko informacje, które chcesz udostępnić."/></label>
        <label>Czy przyjmujesz leki, które mogą wpływać na wysiłek? <em>opcjonalnie</em><textarea rows={2} maxLength={1200} value={answers.medications} onChange={e=>set('medications',e.target.value)} placeholder="Możesz też wpisać ‘wolę nie podawać’. W razie wątpliwości skonsultuj trening z lekarzem."/></label>
      </section>
      <section className="sf-question-section"><div className="sf-question-section-title"><span>03</span><div><h3>Miejsce i sprzęt</h3><p>Sprzęt domowy można zaznaczyć wielokrotnie. Dla siłowni nie pytamy o wyposażenie.</p></div></div>
        <div className="sf-form-grid"><label>Gdzie chcesz trenować? *<select value={location} onChange={e=>{ set('location',e.target.value); if(e.target.value==='gym') setEquipment([]); }}><option value="gym">Siłownia</option><option value="home">W domu</option><option value="both">Dom i siłownia</option></select></label><label>Cel treningowy *<select value={answers.goal} onChange={e=>set('goal',e.target.value)}><option value="muscle">Budowa mięśni</option><option value="strength">Zwiększenie siły</option><option value="fat_loss">Redukcja tkanki tłuszczowej</option><option value="general">Ogólna sprawność</option></select></label></div>
        {onHomeEquipment ? <div className="sf-equipment-picker"><div className="sf-form-label">Dostępny sprzęt w domu <small>Wybierz wszystkie pasujące opcje.</small></div><div className="sf-equipment-options">{EQUIPMENT_OPTIONS.map(([id,label])=><label key={id} className={`sf-equipment-option ${equipment.includes(id)?'is-selected':''}`}><input type="checkbox" checked={equipment.includes(id)} onChange={()=>toggleEquipment(id)}/><span><Dumbbell size={16}/>{label}</span></label>)}</div><small className="sf-muted">{equipment.length ? `Wybrano: ${equipment.length} ${equipment.length===1?'element':equipment.length<5?'elementy':'elementów'}.` : 'Bez zaznaczenia plan będzie oparty na masie ciała.'}</small></div> : <div className="sf-info-note"><Home size={16} style={{display:'inline',verticalAlign:'middle'}}/> Sprzęt: nie dotyczy — trenujesz na siłowni.</div>}
      </section>
      <section className="sf-question-section"><div className="sf-question-section-title"><span>04</span><div><h3>Aktualne możliwości</h3><p>Podaj maksymalny wynik lub zaznacz „Nie wiem”. W takim przypadku pierwszy trening będzie sesją sprawdzającą, a właściwy okres planu zacznie się po otrzymaniu kompletnego planu.</p></div></div>
        <div className="sf-max-results-grid">{MAX_FIELDS.map(field=>{const key=field.key; const unknownKey=`${key}_unknown`; const title=maxProfile==='gym'?field.gym:field.home; const unit=maxProfile==='gym'?field.unitGym:field.unitHome; return <div className="sf-max-result" key={key}><label>{title}<input value={answers[key]} disabled={answers[unknownKey]==='true'} onChange={e=>set(key,e.target.value)} placeholder={unit==='kg lub powtórzenia'?'Np. 60 kg × 5':'Liczba powtórzeń'} maxLength={50}/></label><label className="sf-check"><input type="checkbox" checked={answers[unknownKey]==='true'} onChange={e=>{set(unknownKey,e.target.checked?'true':'false');if(e.target.checked)set(key,'');}}/><span>Nie wiem — sprawdzimy na pierwszym treningu</span></label></div>;})}</div>
        <label>Poziom zaawansowania *<select value={answers.level} onChange={e=>set('level',e.target.value)}><option value="beginner">Początkujący</option><option value="intermediate">Średniozaawansowany</option><option value="advanced">Zaawansowany</option></select></label>
        <div className="sf-form-grid"><label>Ocena kondycji (1–10): <b>{answers.conditioning_rating}</b><input type="range" min="1" max="10" value={answers.conditioning_rating} onChange={e=>set('conditioning_rating',e.target.value)}/><small>1 — bardzo słaba · 10 — bardzo dobra</small></label><label>Ocena siły (1–10): <b>{answers.strength_rating}</b><input type="range" min="1" max="10" value={answers.strength_rating} onChange={e=>set('strength_rating',e.target.value)}/><small>1 — bardzo słaba · 10 — bardzo dobra</small></label></div>
      </section>
      <section className="sf-question-section"><div className="sf-question-section-title"><span>05</span><div><h3>Organizacja planu</h3><p>Ustalimy realny rytm, objętość i sposób progresji.</p></div></div>
        <div className="sf-form-grid"><label>Ile dni w tygodniu możesz trenować? *<select value={answers.days_per_week} onChange={e=>set('days_per_week',e.target.value)}>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n} {n===1?'dzień':'dni'}</option>)}</select></label><label>Preferowana długość treningu *<select value={answers.session_minutes} onChange={e=>set('session_minutes',e.target.value)}>{[30,45,60,75,90,105,120].map(n=><option key={n} value={n}>{n} minut</option>)}</select></label><label>Sposób progresji *<select value={answers.progression} onChange={e=>set('progression',e.target.value)}><option value="reps">Najpierw zwiększaj powtórzenia</option><option value="weight">Najpierw zwiększaj ciężar</option><option value="sets">Najpierw zwiększaj serie</option><option value="double">Progresja podwójna (powtórzenia i ciężar)</option><option value="none">Bez automatycznej progresji</option></select></label><label>Historia treningowa<small>Jak długo trenujesz i co robisz obecnie?</small><input value={answers.training_history} maxLength={1500} onChange={e=>set('training_history',e.target.value)} placeholder="Np. trenuję od roku, 3 razy w tygodniu"/></label></div>
        <label>Jakie ćwiczenia lubisz wykonywać?<textarea rows={2} maxLength={1000} value={answers.preferences} onChange={e=>set('preferences',e.target.value)} placeholder="Ruchy, partie mięśniowe, maszyny…"/></label><label>Jakich ćwiczeń nie lubisz?<textarea rows={2} maxLength={1000} value={answers.avoid} onChange={e=>set('avoid',e.target.value)} placeholder="Ćwiczenia, które chcesz ograniczyć albo pominąć."/></label><label>Czy są ćwiczenia, których nie możesz wykonywać?<textarea rows={2} maxLength={1200} value={answers.unable_exercises} onChange={e=>set('unable_exercises',e.target.value)} placeholder="Podaj konkretne ćwiczenia i powód w takim zakresie, jaki chcesz udostępnić."/></label><label>Dni i godziny, które Ci odpowiadają <em>opcjonalnie</em><textarea rows={2} maxLength={800} value={answers.schedule} onChange={e=>set('schedule',e.target.value)} placeholder="Np. poniedziałek, środa i sobota po pracy."/></label>
      </section>
      <section className="sf-question-section"><div className="sf-question-section-title"><span>06</span><div><h3>Dodatkowe informacje</h3><p>Na koniec możesz dodać szczegóły, które pomogą dopasować plan.</p></div></div><label>Dodatkowe informacje<textarea rows={3} maxLength={1500} value={answers.notes} onChange={e=>set('notes',e.target.value)} placeholder="Priorytety, dostępność, preferencje, które nie pasowały do poprzednich pól…"/></label></section>
      <label className="sf-check sf-individual-consent"><input type="checkbox" checked={answers.consent==='true'} onChange={e=>set('consent',e.target.checked?'true':'false')}/><span>Wyrażam zgodę na zapisanie moich odpowiedzi w systemie i wykorzystanie ich do przygotowania, realizacji oraz kontaktu w sprawie planu indywidualnego. Rozumiem, że podane informacje o zdrowiu i lekach mogą mieć wpływ na bezpieczeństwo ćwiczeń, a formularz nie zastępuje konsultacji medycznej.</span></label>
      {paymentNotice && <div className="sf-info-note" role="status">{paymentNotice}</div>}{error && <div className="sf-gen-error" role="alert">{error}</div>}
      <button className="sf-button sf-button-lime sf-button-full" disabled={saving}>{saving ? 'Przygotowuję bezpieczną płatność…' : 'Przejdź do płatności · 149,99 zł'} <Send size={16}/></button>
      <small className="sf-muted">Zamówienie pojawi się w ACP dopiero po potwierdzeniu płatności przez Stripe. W razie anulowania odpowiedzi pozostaną zapisane w tej sesji.</small>
    </form>
  </section>;
}
