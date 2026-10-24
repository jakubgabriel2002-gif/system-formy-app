import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Send } from 'lucide-react';

type Props = {
  name: string;
  email: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => Promise<boolean>;
};

const FORM_STORAGE_KEY = 'sf-individual-plan-form-v1';
const REQUEST_STORAGE_KEY = 'sf-individual-plan-request-id';

export default function IndividualPlanRequest({ name, email, saving, onCancel, onSubmit }: Props) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [goal, setGoal] = useState('muscle');
  const [level, setLevel] = useState('beginner');
  const [location, setLocation] = useState('gym');
  const [equipment, setEquipment] = useState('gym');
  const [days, setDays] = useState('3');
  const [duration, setDuration] = useState('60');
  const [preferences, setPreferences] = useState('');
  const [avoid, setAvoid] = useState('');
  const [trainingHistory, setTrainingHistory] = useState('');
  const [schedule, setSchedule] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'cancelled') {
      setPaymentNotice('Płatność została anulowana — nie pobrano opłaty. Twoje odpowiedzi zostały zachowane; możesz ponownie przejść do płatności.');
    }
    const requestId = params.get('request_id');
    if (requestId) {
      try { sessionStorage.setItem(REQUEST_STORAGE_KEY, requestId); } catch { /* storage is optional */ }
    }
    try {
      const raw = sessionStorage.getItem(FORM_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (typeof saved.goal === 'string') setGoal(saved.goal);
      if (typeof saved.level === 'string') setLevel(saved.level);
      if (typeof saved.location === 'string') setLocation(saved.location);
      if (typeof saved.equipment === 'string') setEquipment(saved.equipment);
      if (typeof saved.days_per_week === 'string') setDays(saved.days_per_week);
      if (typeof saved.session_minutes === 'string') setDuration(saved.session_minutes);
      if (typeof saved.preferences === 'string') setPreferences(saved.preferences);
      if (typeof saved.avoid === 'string') setAvoid(saved.avoid);
      if (typeof saved.training_history === 'string') setTrainingHistory(saved.training_history);
      if (typeof saved.schedule === 'string') setSchedule(saved.schedule);
      if (typeof saved.notes === 'string') setNotes(saved.notes);
      if (saved.consent === 'true' || saved.consent === true) setConsent(true);
    } catch { /* Ignore malformed old form state; the live form remains usable. */ }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!consent) { setError('Zaznacz zgodę na wykorzystanie odpowiedzi do przygotowania i obsługi zamówienia.'); return; }
    try {
      const redirecting = await onSubmit({ goal, level, location, equipment: location === 'gym' ? 'gym' : equipment, days_per_week: days, session_minutes: duration, training_history: trainingHistory, schedule, preferences, avoid, notes, consent: 'true' });
      if (!redirecting) setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się wysłać zamówienia. Spróbuj ponownie.'); }
  }

  if (sent) return <section className="sf-view sf-individual-plan-view"><div className="sf-panel sf-individual-plan-success"><span><CheckCircle2 size={28}/></span><p className="sf-eyebrow">ZAMÓWIENIE ZAPISANE</p><h1>Dziękuję za odpowiedzi.</h1><p>Formularz trafił do panelu administratora. Możesz wrócić do planów; skontaktuję się z Tobą w sprawie szczegółów i terminu realizacji.</p><button className="sf-button sf-button-lime" onClick={onCancel}>Wróć do planów</button></div></section>;

  return <section className="sf-view sf-individual-plan-view">
    <button type="button" className="sf-back-link" onClick={onCancel}><ArrowLeft size={16}/> Wróć do planów</button>
    <header className="sf-gen-hero"><div className="sf-gen-hero-mark"><ClipboardList size={24}/></div><p className="sf-eyebrow">PLAN PRZYGOTOWANY DLA CIEBIE</p><h1>Zamów plan <span>indywidualny.</span></h1><p>Odpowiedz na pytania, żebym mógł poznać Twój cel i warunki treningowe. Po opłaceniu zamówienia odpowiedzi zapiszą się w ACP i rozpocznę przygotowanie planu.</p><p className="sf-individual-plan-price">149,99 zł <small>jednorazowo</small></p></header>
    <form className="sf-panel sf-form-stack sf-individual-plan-form" onSubmit={submit}>
      <div className="sf-individual-contact"><b>{name || 'Użytkownik'}</b><span>{email}</span><small>Dane kontaktowe pobrane z konta.</small></div>
      <div className="sf-form-grid"><label>Główny cel<select value={goal} onChange={e=>setGoal(e.target.value)}><option value="muscle">Budowa mięśni</option><option value="strength">Zwiększenie siły</option><option value="fat_loss">Redukcja tkanki tłuszczowej</option><option value="general">Ogólna sprawność i regularność</option></select></label><label>Poziom<select value={level} onChange={e=>setLevel(e.target.value)}><option value="beginner">Początkujący</option><option value="intermediate">Średniozaawansowany</option><option value="advanced">Zaawansowany</option></select></label></div>
      <div className="sf-form-grid"><label>Miejsce treningu<select value={location} onChange={e=>{setLocation(e.target.value);setEquipment(e.target.value==='gym'?'gym':'none')}}><option value="gym">Siłownia</option><option value="home">Dom</option><option value="both">Dom i siłownia</option></select></label><label>Dostępny sprzęt<select value={equipment} onChange={e=>setEquipment(e.target.value)} disabled={location==='gym'}><option value="none">Bez sprzętu</option><option value="bands">Gumy oporowe</option><option value="dumbbells">Hantle</option><option value="both">Gumy i hantle</option></select></label></div>
      <div className="sf-form-grid"><label>Ile dni w tygodniu?<select value={days} onChange={e=>setDays(e.target.value)}>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Ile czasu na trening?<select value={duration} onChange={e=>setDuration(e.target.value)}>{[30,45,60,75,90].map(n=><option key={n} value={n}>{n} minut</option>)}</select></label></div>
      <label>Dotychczasowe doświadczenie treningowe<textarea value={trainingHistory} onChange={e=>setTrainingHistory(e.target.value)} rows={3} maxLength={1500} placeholder="Jak długo trenujesz? Co robiłeś do tej pory?"/></label>
      <label>Dni i godziny, które Ci odpowiadają<textarea value={schedule} onChange={e=>setSchedule(e.target.value)} rows={2} maxLength={800} placeholder="Np. poniedziałek, środa i sobota po pracy."/></label>
      <label>Ulubione ćwiczenia lub elementy planu<textarea value={preferences} onChange={e=>setPreferences(e.target.value)} rows={2} maxLength={1000} placeholder="Co lubisz trenować? Na czym zależy Ci najbardziej?"/></label>
      <label>Ćwiczenia, których chcesz unikać / ograniczenia<textarea value={avoid} onChange={e=>setAvoid(e.target.value)} rows={2} maxLength={1200} placeholder="Np. ćwiczenia, których nie wykonujesz lub ograniczenia sprzętowe. Nie wpisuj diagnoz ani szczegółowych danych medycznych."/></label>
      <label>Dodatkowe informacje<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} maxLength={1500} placeholder="Wszystko, co może pomóc w przygotowaniu planu."/></label>
      <label className="sf-check sf-individual-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Wyrażam zgodę na zapisanie moich odpowiedzi w systemie i wykorzystanie ich do przygotowania, realizacji oraz kontaktu w sprawie planu indywidualnego. Wiem, że mogę pominąć pola opcjonalne i nie wpisuję szczegółowych danych medycznych.</span></label>
      {paymentNotice && <div className="sf-info-note" role="status">{paymentNotice}</div>}
      {error && <div className="sf-gen-error" role="alert">{error}</div>}
      <button className="sf-button sf-button-lime sf-button-full" disabled={saving}>{saving ? 'Przygotowuję bezpieczną płatność…' : 'Przejdź do płatności · 149,99 zł'} <Send size={16}/></button>
      <small className="sf-muted">Zamówienie trafia do ACP dopiero po potwierdzeniu płatności. Jeśli anulujesz płatność, możesz wrócić do formularza — odpowiedzi pozostaną zachowane.</small>
    </form>
  </section>;
}
