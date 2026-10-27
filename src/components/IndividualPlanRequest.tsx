import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Send, ShieldCheck } from 'lucide-react';

type Props = {
  name: string;
  email: string;
  saving: boolean;
  isPremium: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => Promise<boolean>;
};

type Place = 'gym' | 'home' | 'both';
const FORM_STORAGE_KEY = 'sf-individual-plan-form-v1';
const REQUEST_STORAGE_KEY = 'sf-individual-plan-request-id';

const equipmentOptions = [
  { value: 'none', label: 'Bez dodatkowego sprzętu', places: ['home'] },
  { value: 'bands', label: 'Gumy oporowe', places: ['home', 'gym', 'both'] },
  { value: 'dumbbells', label: 'Hantle', places: ['home', 'gym', 'both'] },
  { value: 'bench', label: 'Ławka do wyciskania', places: ['home', 'gym', 'both'] },
  { value: 'squat_rack', label: 'Stojaki / klatka do przysiadów', places: ['home', 'gym', 'both'] },
  { value: 'pullup_bar', label: 'Drążek do podciągania', places: ['home', 'gym', 'both'] },
  { value: 'kettlebell', label: 'Kettlebell', places: ['home', 'gym', 'both'] },
  { value: 'suspension', label: 'Taśmy podwieszane (TRX)', places: ['home', 'gym', 'both'] },
  { value: 'barbell', label: 'Sztanga', places: ['home', 'gym', 'both'] },
  { value: 'weight_plates', label: 'Obciążenia / talerze', places: ['home', 'gym', 'both'] },
  { value: 'cable_machine', label: 'Wyciąg górny / dolny', places: ['gym', 'both'] },
  { value: 'machines', label: 'Maszyny na siłowni', places: ['gym', 'both'] },
  { value: 'smith_machine', label: 'Maszyna Smitha', places: ['gym', 'both'] },
  { value: 'leg_press', label: 'Suwnica do nóg', places: ['gym', 'both'] },
  { value: 'leg_extension_curl', label: 'Maszyna do prostowania / uginania nóg', places: ['gym', 'both'] },
  { value: 'chest_press', label: 'Maszyna do wyciskania na klatkę', places: ['gym', 'both'] },
  { value: 'lat_pulldown', label: 'Maszyna do ściągania drążka', places: ['gym', 'both'] },
  { value: 'dip_station', label: 'Poręcze do dipów', places: ['home', 'gym', 'both'] },
  { value: 'cardio', label: 'Bieżnia / rower / orbitrek', places: ['gym', 'both'] },
  { value: 'other', label: 'Inny sprzęt — wpiszę jaki', places: ['home', 'gym', 'both'] },
] as const;

const maxFields = {
  gym: [
    { key: 'max_bench_press', unknown: 'max_bench_press_unknown', label: 'Wyciskanie sztangi leżąc', unit: 'kg' },
    { key: 'max_squat', unknown: 'max_squat_unknown', label: 'Przysiad ze sztangą', unit: 'kg' },
    { key: 'max_deadlift', unknown: 'max_deadlift_unknown', label: 'Martwy ciąg', unit: 'kg' },
    { key: 'max_situps', unknown: 'max_situps_unknown', label: 'Brzuszki w jednej serii', unit: 'powt.' },
  ],
  home: [
    { key: 'max_pushups', unknown: 'max_pushups_unknown', label: 'Pompki', unit: 'powt.' },
    { key: 'max_knee_pushups', unknown: 'max_knee_pushups_unknown', label: 'Pompki na kolanach', unit: 'powt.' },
    { key: 'max_squat_bodyweight', unknown: 'max_squat_bodyweight_unknown', label: 'Przysiady z masą ciała', unit: 'powt.' },
    { key: 'max_situps', unknown: 'max_situps_unknown', label: 'Brzuszki', unit: 'powt.' },
    { key: 'max_jumping_jacks', unknown: 'max_jumping_jacks_unknown', label: 'Pajacyki', unit: 'powt.' },
  ],
};

const initialAnswers: Record<string, string> = {
  age: '', sex: '', weight_kg: '', height_cm: '', illnesses: 'Nie', injuries: 'Nie', congenital_conditions: 'Nie', medications: 'Nie',
  max_profile: 'gym', max_bench_press: '', max_squat: '', max_situps: '', max_deadlift: '', max_pushups: '', max_knee_pushups: '', max_squat_bodyweight: '', max_jumping_jacks: '',
  max_bench_press_unknown: 'false', max_squat_unknown: 'false', max_situps_unknown: 'false', max_deadlift_unknown: 'false', max_pushups_unknown: 'false', max_knee_pushups_unknown: 'false', max_squat_bodyweight_unknown: 'false', max_jumping_jacks_unknown: 'false',
  progression: 'double', conditioning_rating: '5', strength_rating: '5', unable_exercises: 'Nie', equipment_other: '',
};

export default function IndividualPlanRequest({ name, email, saving, isPremium, onCancel, onSubmit }: Props) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [goal, setGoal] = useState('muscle');
  const [level, setLevel] = useState('beginner');
  const [location, setLocation] = useState<Place>('gym');
  const [equipment, setEquipment] = useState<string[]>(['barbell', 'dumbbells', 'cable_machine', 'machines']);
  const [days, setDays] = useState('3');
  const [duration, setDuration] = useState('60');
  const [preferences, setPreferences] = useState('');
  const [avoid, setAvoid] = useState('');
  const [trainingHistory, setTrainingHistory] = useState('');
  const [schedule, setSchedule] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);

  const maxProfile = useMemo(() => location === 'home' ? 'home' : answers.max_profile || 'gym', [location, answers.max_profile]);
  const visibleMaxFields = maxProfile === 'home' ? maxFields.home : maxFields.gym;
  const visibleEquipmentOptions = equipmentOptions.filter(option => (option.places as readonly string[]).includes('home'));
  const equipmentPickerVisible = location !== 'gym';

  function setAnswer(key: string, value: string) {
    setAnswers(current => ({ ...current, [key]: value }));
  }

  function toggleEquipment(value: string) {
    setEquipment(current => {
      if (value === 'none') return current.includes('none') ? [] : ['none'];
      if (current.includes(value)) return current.filter(item => item !== value && item !== 'none');
      return [...current.filter(item => item !== 'none'), value];
    });
  }

  function changeLocation(next: Place) {
    setLocation(next);
    setEquipment(next === 'gym' ? ['full_gym'] : next === 'home' ? ['none'] : ['dumbbells', 'bands']);
    if (next === 'home') setAnswer('max_profile', 'home');
    else if (next === 'gym') setAnswer('max_profile', 'gym');
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'cancelled') setPaymentNotice('Płatność została anulowana — nie pobrano opłaty. Odpowiedzi zostały zachowane; możesz ponownie przejść do płatności.');
    const requestId = params.get('request_id');
    if (requestId) { try { sessionStorage.setItem(REQUEST_STORAGE_KEY, requestId); } catch { /* storage is optional */ } }
    try {
      const raw = sessionStorage.getItem(FORM_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (typeof saved.goal === 'string') setGoal(saved.goal);
      if (typeof saved.level === 'string') setLevel(saved.level);
      if (saved.location === 'gym' || saved.location === 'home' || saved.location === 'both') setLocation(saved.location);
      if (typeof saved.days_per_week === 'string') setDays(saved.days_per_week);
      if (typeof saved.session_minutes === 'string') setDuration(saved.session_minutes);
      if (typeof saved.preferences === 'string') setPreferences(saved.preferences);
      if (typeof saved.avoid === 'string') setAvoid(saved.avoid);
      if (typeof saved.training_history === 'string') setTrainingHistory(saved.training_history);
      if (typeof saved.schedule === 'string') setSchedule(saved.schedule);
      if (typeof saved.notes === 'string') setNotes(saved.notes);
      if (typeof saved.equipment === 'string') {
        try { const parsed: unknown = JSON.parse(saved.equipment); if (Array.isArray(parsed)) setEquipment(parsed.filter((item): item is string => typeof item === 'string')); else if (saved.equipment === 'bands' || saved.equipment === 'dumbbells') setEquipment([saved.equipment]); } catch { if (saved.equipment === 'bands' || saved.equipment === 'dumbbells') setEquipment([saved.equipment]); }
      }
      if (saved.consent === 'true' || saved.consent === true) setConsent(true);
      setAnswers(current => {
        const next = { ...current };
        for (const key of Object.keys(initialAnswers)) if (typeof saved[key] === 'string') next[key] = saved[key] as string;
        return next;
      });
    } catch { /* Ignore malformed old form state; the live form remains usable. */ }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!consent) { setError('Zaznacz zgodę na wykorzystanie odpowiedzi do przygotowania i obsługi zamówienia.'); return; }
    if (!Number.isInteger(Number(answers.age)) || Number(answers.age) < 13 || Number(answers.age) > 100) { setError('Podaj wiek w zakresie 13–100 lat.'); return; }
    if (!['female', 'male', 'other', 'prefer_not_to_say'].includes(answers.sex)) { setError('Wybierz płeć lub „Nie chcę podawać”.'); return; }
    if (!Number.isFinite(Number(answers.weight_kg)) || Number(answers.weight_kg) < 25 || Number(answers.weight_kg) > 400) { setError('Podaj prawidłową wagę w zakresie 25–400 kg.'); return; }
    if (!Number.isFinite(Number(answers.height_cm)) || Number(answers.height_cm) < 100 || Number(answers.height_cm) > 250) { setError('Podaj prawidłowy wzrost w zakresie 100–250 cm.'); return; }
    const selectedEquipment = location === 'gym' ? ['full_gym'] : equipment;
    if (location !== 'gym' && !selectedEquipment.length) { setError('Wybierz sprzęt, który masz dostępny w domu. Możesz zaznaczyć kilka pozycji.'); return; }
    if (location !== 'gym' && selectedEquipment.includes('other') && !answers.equipment_other.trim()) { setError('Opisz inny sprzęt, który masz w domu.'); return; }
    const unknownMetric = visibleMaxFields.find(field => answers[field.unknown] !== 'true' && !answers[field.key].trim());
    if (unknownMetric) { setError(`Dla pola „${unknownMetric.label}” wpisz wynik albo zaznacz „Nie wiem”.`); return; }
    const values: Record<string, string> = {
      goal, level, location, equipment: JSON.stringify(selectedEquipment), equipment_other: location === 'gym' ? '' : answers.equipment_other,
      days_per_week: days, session_minutes: duration, training_history: trainingHistory, schedule, preferences, avoid, notes,
      ...answers, max_profile: maxProfile, consent: 'true',
    };
    try {
      sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(values));
    } catch { /* storage is optional */ }
    try {
      let requestId = '';
      try { requestId = sessionStorage.getItem(REQUEST_STORAGE_KEY) || ''; } catch { /* storage is optional */ }
      const redirecting = await onSubmit({ ...values, request_id: requestId });
      if (!redirecting) setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się wysłać zamówienia. Spróbuj ponownie.'); }
  }

  if (sent) return <section className="sf-view sf-individual-plan-view"><div className="sf-panel sf-individual-plan-success"><span><CheckCircle2 size={28}/></span><p className="sf-eyebrow">ZAMÓWIENIE ZAPISANE</p><h1>Dziękuję za odpowiedzi.</h1><p>Po potwierdzeniu płatności zamówienie trafi do trenera. Przygotowanie planu odbywa się ręcznie i trwa zwykle 24–48 godzin. Status sprawdzisz na swoim koncie.</p><button type="button" className="sf-button sf-button-lime" onClick={onCancel}>Wróć do planów</button></div></section>;

  return <section className="sf-view sf-individual-plan-view">
    <button type="button" className="sf-back-link" onClick={onCancel}><ArrowLeft size={16}/> Wróć do planów</button>
    <header className="sf-gen-hero"><div className="sf-gen-hero-mark"><ClipboardList size={24}/></div><p className="sf-eyebrow">PLAN PRZYGOTOWANY PRZEZ TRENERA</p><h1>Zamów plan <span>indywidualny.</span></h1><p>Odpowiedz na pytania, żebym mógł przygotować plan dopasowany do Twoich możliwości, sprzętu i celu. Każde zamówienie jest opracowywane ręcznie po potwierdzeniu płatności.</p><p className="sf-individual-plan-price">{isPremium ? '49,99 zł' : '59,99 zł'} <small>jednorazowo{isPremium ? ' · cena Premium' : ' · 49,99 zł z Premium'}</small></p><div className="sf-individual-delivery-note"><ShieldCheck size={18}/><span><b>Realizacja w ciągu 24–48 godzin</b><small>Po płatności zamówienie trafia do panelu trenera. Status realizacji zobaczysz na swoim koncie, a gotowy plan zostanie przypisany do Twojego profilu.</small></span></div></header>
    <form className="sf-panel sf-form-stack sf-individual-plan-form" onSubmit={submit}>
      <div className="sf-individual-contact"><b>{name || 'Użytkownik'}</b><span>{email}</span><small>Dane kontaktowe pobrane z konta.</small></div>
      <div className="sf-form-section"><p className="sf-eyebrow">01 / TWOJE DANE</p><h3>Podstawowe informacje</h3><div className="sf-form-grid"><label>Wiek<input type="number" min="13" max="100" required value={answers.age} onChange={e=>setAnswer('age',e.target.value)} placeholder="np. 28"/></label><label>Płeć<select required value={answers.sex} onChange={e=>setAnswer('sex',e.target.value)}><option value="">Wybierz…</option><option value="female">Kobieta</option><option value="male">Mężczyzna</option><option value="other">Inna / wolę opisać w uwagach</option><option value="prefer_not_to_say">Nie chcę podawać</option></select></label><label>Waga (kg)<input type="number" min="25" max="400" step="0.1" required value={answers.weight_kg} onChange={e=>setAnswer('weight_kg',e.target.value)} placeholder="np. 78"/></label><label>Wzrost (cm)<input type="number" min="100" max="250" required value={answers.height_cm} onChange={e=>setAnswer('height_cm',e.target.value)} placeholder="np. 178"/></label></div></div>
      <div className="sf-form-section"><p className="sf-eyebrow">02 / BEZPIECZEŃSTWO</p><h3>Zdrowie i ograniczenia</h3><p className="sf-muted">Wpisz „Nie”, jeśli dana sytuacja Cię nie dotyczy. Podaj tylko informacje potrzebne do bezpiecznego dopasowania ćwiczeń.</p><label>Czy obecnie chorujesz lub masz stan zdrowia, który może wpływać na trening?<textarea required value={answers.illnesses} onChange={e=>setAnswer('illnesses',e.target.value)} rows={2} maxLength={1200} placeholder="Nie / krótki opis"/></label><label>Czy masz obecnie lub miałeś kontuzje, które trzeba uwzględnić?<textarea required value={answers.injuries} onChange={e=>setAnswer('injuries',e.target.value)} rows={2} maxLength={1200} placeholder="Nie / obszar i ograniczenia ruchu"/></label><label>Czy masz wady wrodzone lub inne ograniczenia ruchowe?<textarea required value={answers.congenital_conditions} onChange={e=>setAnswer('congenital_conditions',e.target.value)} rows={2} maxLength={1200} placeholder="Nie / krótki opis"/></label><label>Czy przyjmujesz leki, które mogą mieć znaczenie dla treningu?<textarea required value={answers.medications} onChange={e=>setAnswer('medications',e.target.value)} rows={2} maxLength={1200} placeholder="Nie / nazwy lub wpływ na trening — bez zbędnych szczegółów"/></label><label>Czy są ćwiczenia, których nie możesz wykonywać?<textarea required value={answers.unable_exercises} onChange={e=>setAnswer('unable_exercises',e.target.value)} rows={2} maxLength={1200} placeholder="Nie / wymień ćwiczenia"/></label></div>
      <div className="sf-form-section"><p className="sf-eyebrow">03 / WARUNKI TRENINGOWE</p><h3>Cel i dostępny sprzęt</h3><div className="sf-form-grid"><label>Główny cel<select value={goal} onChange={e=>setGoal(e.target.value)}><option value="muscle">Budowa mięśni</option><option value="strength">Zwiększenie siły</option><option value="fat_loss">Redukcja tkanki tłuszczowej</option><option value="general">Ogólna sprawność i regularność</option></select></label><label>Poziom zaawansowania<select value={level} onChange={e=>setLevel(e.target.value)}><option value="beginner">Początkujący</option><option value="intermediate">Średniozaawansowany</option><option value="advanced">Zaawansowany</option></select></label><label>Miejsce treningu<select value={location} onChange={e=>changeLocation(e.target.value as Place)}><option value="gym">Siłownia</option><option value="home">Dom</option><option value="both">Dom i siłownia</option></select></label><label>Ile dni w tygodniu?<select value={days} onChange={e=>setDays(e.target.value)}>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Preferowana długość treningu<select value={duration} onChange={e=>setDuration(e.target.value)}>{[30,45,60,75,90,105,120].map(n=><option key={n} value={n}>{n} minut</option>)}</select></label><label>Sposób progresji<select value={answers.progression} onChange={e=>setAnswer('progression',e.target.value)}><option value="double">Podwójna progresja (powtórzenia, potem ciężar)</option><option value="weight">Stopniowe zwiększanie ciężaru</option><option value="reps">Stopniowe zwiększanie powtórzeń</option><option value="sets">Stopniowe zwiększanie liczby serii</option><option value="none">Bez określonego schematu</option></select></label></div>
        {equipmentPickerVisible && <fieldset className="sf-equipment-picker"><legend>Sprzęt dostępny w domu — zaznacz wszystkie pasujące opcje</legend><div className="sf-equipment-grid">{visibleEquipmentOptions.map(option=><label className="sf-equipment-option" key={option.value}><input type="checkbox" checked={equipment.includes(option.value)} onChange={()=>toggleEquipment(option.value)}/><span>{option.label}</span></label>)}</div>{equipment.includes('other') && <label>Jaki inny sprzęt masz w domu?<input value={answers.equipment_other} onChange={e=>setAnswer('equipment_other',e.target.value)} maxLength={300} required placeholder="Np. wyciąg montowany do drzwi"/></label>}</fieldset>}
        <div className="sf-form-grid"><label>Samoocena kondycji (1–10)<select value={answers.conditioning_rating} onChange={e=>setAnswer('conditioning_rating',e.target.value)}>{Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}{n===1?' — bardzo niska':n===10?' — bardzo wysoka':''}</option>)}</select></label><label>Samoocena siły (1–10)<select value={answers.strength_rating} onChange={e=>setAnswer('strength_rating',e.target.value)}>{Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}{n===1?' — bardzo niska':n===10?' — bardzo wysoka':''}</option>)}</select></label></div>
      </div>
      <div className="sf-form-section"><p className="sf-eyebrow">04 / MAKSIMA STARTOWE</p><h3>Jakie są Twoje obecne możliwości?</h3><p className="sf-muted">Wybierz profil, którego dotyczą wyniki. Jeżeli nie znasz maksimum danego ćwiczenia, zaznacz „Nie wiem”. Pierwszy trening może wtedy służyć do bezpiecznego sprawdzenia poziomu, a okres programu zacznie się po przygotowaniu pełnego planu.</p>{location==='both' && <label>Profil do sprawdzenia maksimów<select value={answers.max_profile} onChange={e=>setAnswer('max_profile',e.target.value)}><option value="gym">Siłownia</option><option value="home">Dom</option></select></label>}{location!=='both' && <p className="sf-info-note">Profil: {maxProfile==='gym'?'siłownia':'trening w domu'}.</p>}<div className="sf-max-grid">{visibleMaxFields.map(field=><div className="sf-max-item" key={field.key}><label>{field.label} <small>({field.unit})</small><input type="number" min="0" max={field.unit==='kg'?'1000':'1000'} step={field.unit==='kg'?'0.5':'1'} disabled={answers[field.unknown]==='true'} value={answers[field.key]} onChange={e=>setAnswer(field.key,e.target.value)} placeholder="Wpisz wynik"/></label><label className="sf-check"><input type="checkbox" checked={answers[field.unknown]==='true'} onChange={e=>{setAnswer(field.unknown,e.target.checked?'true':'false');if(e.target.checked)setAnswer(field.key,'');}}/><span>Nie wiem</span></label></div>)}</div></div>
      <div className="sf-form-section"><p className="sf-eyebrow">05 / PREFERENCJE</p><h3>Jak lubisz trenować?</h3><label>Dotychczasowe doświadczenie treningowe<textarea value={trainingHistory} onChange={e=>setTrainingHistory(e.target.value)} rows={3} maxLength={1500} placeholder="Jak długo trenujesz? Co robiłeś do tej pory?"/></label><label>Dni i godziny, które Ci odpowiadają<textarea value={schedule} onChange={e=>setSchedule(e.target.value)} rows={2} maxLength={800} placeholder="Np. poniedziałek, środa i sobota po pracy."/></label><label>Ćwiczenia, które lubisz wykonywać<textarea value={preferences} onChange={e=>setPreferences(e.target.value)} rows={2} maxLength={1000} placeholder="Wymień ulubione ćwiczenia lub formy treningu."/></label><label>Ćwiczenia, których nie lubisz<textarea value={avoid} onChange={e=>setAvoid(e.target.value)} rows={2} maxLength={1200} placeholder="Wymień ćwiczenia, które wolisz pominąć."/></label><label>Dodatkowe informacje<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} maxLength={1500} placeholder="Inne preferencje, oczekiwania lub ważne uwagi."/></label></div>
      <label className="sf-check sf-individual-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Wyrażam zgodę na zapisanie odpowiedzi, w tym informacji o zdrowiu i ograniczeniach, oraz wykorzystanie ich przez System Formy do przygotowania i realizacji zamówionego planu i kontaktu w tej sprawie. Wiem, że mogę skontaktować się z administratorem w sprawie moich danych.</span></label>
      {paymentNotice && <div className="sf-info-note" role="status">{paymentNotice}</div>}
      {error && <div className="sf-gen-error" role="alert">{error}</div>}
      <button type="submit" className="sf-button sf-button-lime sf-button-full" disabled={saving}>{saving ? 'Przygotowuję bezpieczną płatność…' : isPremium ? 'Przejdź do płatności · 49,99 zł' : 'Przejdź do płatności · 59,99 zł'} <Send size={16}/></button>
      <small className="sf-muted">Po opłaceniu zamówienie trafia do trenera. Plan przygotowujemy ręcznie w ciągu 24–48 godzin. Możesz śledzić status na swoim koncie; gotowy plan będzie przypisany do tego konta.</small>
    </form>
  </section>;
}
