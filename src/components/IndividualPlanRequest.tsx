import { FormEvent, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Send } from 'lucide-react';

type Props = {
  name: string;
  email: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
};

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!consent) { setError('Zaznacz zgodę na wykorzystanie odpowiedzi do przygotowania i obsługi zamówienia.'); return; }
    try {
      await onSubmit({ goal, level, location, equipment: location === 'gym' ? 'gym' : equipment, days_per_week: days, session_minutes: duration, training_history: trainingHistory, schedule, preferences, avoid, notes, consent: 'true' });
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się wysłać zamówienia. Spróbuj ponownie.'); }
  }

  if (sent) return <section className="sf-view sf-individual-plan-view"><div className="sf-panel sf-individual-plan-success"><span><CheckCircle2 size={28}/></span><p className="sf-eyebrow">ZAMÓWIENIE ZAPISANE</p><h1>Dziękuję za odpowiedzi.</h1><p>Formularz trafił do panelu administratora. Możesz wrócić do planów; skontaktuję się z Tobą w sprawie szczegółów i terminu realizacji.</p><button className="sf-button sf-button-lime" onClick={onCancel}>Wróć do planów</button></div></section>;

  return <section className="sf-view sf-individual-plan-view">
    <button type="button" className="sf-back-link" onClick={onCancel}><ArrowLeft size={16}/> Wróć do planów</button>
    <header className="sf-gen-hero"><div className="sf-gen-hero-mark"><ClipboardList size={24}/></div><p className="sf-eyebrow">PLAN PRZYGOTOWANY DLA CIEBIE</p><h1>Zamów plan <span>indywidualny.</span></h1><p>Odpowiedz na pytania, żebym mógł poznać Twój cel i warunki treningowe. Zgłoszenie zapisze się w systemie i będzie widoczne w ACP.</p></header>
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
      {error && <div className="sf-gen-error" role="alert">{error}</div>}
      <button className="sf-button sf-button-lime sf-button-full" disabled={saving}>{saving ? 'Wysyłam zamówienie…' : 'Wyślij zamówienie planu indywidualnego'} <Send size={16}/></button>
      <small className="sf-muted">Wysłanie formularza nie oznacza automatycznej płatności ani natychmiastowego rozpoczęcia realizacji. Szczegóły i cena zostaną uzgodnione indywidualnie.</small>
    </form>
  </section>;
}
