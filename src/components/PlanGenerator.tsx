import { useEffect, useRef, useState } from 'react';
import { exerciseForProgramWeek, formatProgramDate, getProgramEndDate, localDateString, PROGRAM_WEEKS, PROGRESSION_OPTIONS, progressionOption, type ProgressionStrategy } from '../lib/trainingProgram';
import { exerciseCatalogGroups, exerciseCatalogReplacementOptions } from '../lib/exerciseCatalog';
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, Dumbbell,
  Flame, Home, RotateCcw, Sparkles, Target, Trophy, Zap,
} from 'lucide-react';

export type GeneratedPlanExercise = {
  name: string;
  sets: number;
  reps: number;
  weight_kg?: number | null;
  notes?: string;
  rest_seconds?: number;
  transition_rest_seconds?: number;
  alternatives?: string[];
};

export type GeneratedPlanDay = {
  day_key: string;
  title: string;
  exercises: GeneratedPlanExercise[];
};

export type GeneratedPlanDraft = {
  name: string;
  description: string;
  location: 'home' | 'gym';
  days: GeneratedPlanDay[];
  duration_weeks: number;
  start_date: string;
  progression_strategy: ProgressionStrategy;
};

export type GeneratedPlanResult = { days: GeneratedPlanDay[]; duration_weeks?: number; start_date?: string; progression_strategy?: ProgressionStrategy; };


type Goal = 'muscle' | 'strength' | 'fat-loss' | 'general';
type Level = 'beginner' | 'intermediate' | 'advanced';
type Place = 'home' | 'gym';
type Equipment = 'bands' | 'dumbbells' | 'bench' | 'squat_rack' | 'pullup_bar';
type Focus = 'balanced' | 'upper' | 'lower' | 'conditioning';
type Pattern = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'conditioning' | 'mobility';
type ExerciseTemplate = { name: string; group: 'legs' | 'push' | 'pull' | 'core' | 'conditioning' | 'mobility'; gear?: Equipment | 'gym'; reps?: number; notes?: string };

const SAVED_GENERATOR_SETTINGS_KEY = 'sf-generator-plan-settings-v1';
type SavedGeneratorSettings = {
  goal: Goal; level: Level; location: Place; equipment: Equipment[]; days: number; duration: number;
  focus: Focus; startDate: string; progressionStrategy: ProgressionStrategy;
};

type Props = {
  defaultLocation: Place;
  saving: boolean;
  hasPaidAccess: boolean;
  confirmedOrderNumber?: string | null;
  canCreatePlan: boolean;
  onPurchase: () => Promise<void>;
  onCancel: () => void;
  onSave: (draft: GeneratedPlanDraft) => Promise<boolean | void>;
  onReplaceExercises: (request: { location: Place; equipment: Equipment[] | 'gym'; exercises: Array<{ key: string; day_title: string; name: string; sets: number; reps: number; notes: string; preferred_name?: string; other_names: string[] }> }) => Promise<{ replacements: Array<{ key: string; name: string }> }>;
};

const GOALS: Array<{ id: Goal; title: string; desc: string; icon: typeof Target }> = [
  { id: 'muscle', title: 'Budowa mięśni', desc: 'Więcej objętości i regularna praca z oporem.', icon: Dumbbell },
  { id: 'strength', title: 'Budowanie siły', desc: 'Mniej powtórzeń, dłuższe przerwy i kontrola ruchu.', icon: Zap },
  { id: 'fat-loss', title: 'Redukcja tkanki tłuszczowej', desc: 'Trening całego ciała i sprawne tempo pracy.', icon: Flame },
  { id: 'general', title: 'Lepsza forma', desc: 'Zrównoważony plan, który łatwo utrzymać.', icon: Trophy },
];
const LEVELS: Array<{ id: Level; title: string; desc: string }> = [
  { id: 'beginner', title: 'Początkujący', desc: 'Wracam do treningów lub zaczynam od podstaw.' },
  { id: 'intermediate', title: 'Średniozaawansowany', desc: 'Trenuję regularnie i znam podstawowe ćwiczenia.' },
  { id: 'advanced', title: 'Zaawansowany', desc: 'Mam doświadczenie i dobrze znam technikę.' },
];
const EQUIPMENT_OPTIONS: Array<{ id: Equipment; title: string; desc: string }> = [
  { id: 'dumbbells', title: 'Hantle', desc: 'Jedna lub para hantli' },
  { id: 'bands', title: 'Gumy oporowe', desc: 'Gumy i minibandy' },
  { id: 'bench', title: 'Ławka treningowa', desc: 'Ławka pozioma lub regulowana' },
  { id: 'squat_rack', title: 'Stojaki / sztanga', desc: 'Stojaki do przysiadów i wyciskania' },
  { id: 'pullup_bar', title: 'Drążek do podciągania', desc: 'Podciąganie i ćwiczenia w zwisie' },
];
const FOCUSES: Array<{ id: Focus; title: string }> = [
  { id: 'balanced', title: 'Całe ciało' },
  { id: 'upper', title: 'Więcej góry ciała' },
  { id: 'lower', title: 'Więcej nóg i pośladków' },
  { id: 'conditioning', title: 'Kondycja' },
];
const GOAL_NAMES: Record<Goal, string> = {
  muscle: 'budowa mięśni', strength: 'budowanie siły', 'fat-loss': 'redukcja tkanki tłuszczowej', general: 'ogólna sprawność',
};
const LEVEL_NAMES: Record<Level, string> = { beginner: 'początkujący', intermediate: 'średniozaawansowany', advanced: 'zaawansowany' };
const FOCUS_NAMES: Record<Focus, string> = { balanced: 'całe ciało', upper: 'górne partie ciała', lower: 'nogi i pośladki', conditioning: 'kondycja' };

function exerciseTemplatesFromCatalog(location: Place, equipment: Equipment[]): ExerciseTemplate[] {
  const groupByCategory: Record<string, ExerciseTemplate['group']> = {
    'Klatka piersiowa': 'push', 'Barki': 'push', 'Triceps': 'push', 'Plecy': 'pull', 'Biceps': 'pull',
    'Nogi i pośladki': 'legs', 'Brzuch i core': 'core', 'Kondycja': 'conditioning', 'Mobilność i regeneracja': 'mobility',
  };
  const groups = exerciseCatalogGroups(location, location === 'gym' ? 'gym' : (equipment.length ? equipment : 'none'));
  const seen = new Set<string>();
  const result: ExerciseTemplate[] = [];
  for (const category of groups) {
    for (const name of category.exercises) {
      const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const group = groupByCategory[category.category] || 'legs';
      result.push({ name, group, reps: group === 'conditioning' ? 30 : group === 'mobility' ? 8 : group === 'core' ? 12 : 10,
        notes: group === 'conditioning' ? 'Dobierz tempo do swoich możliwości; przerwij, jeśli pojawi się ból lub zawroty głowy.' : undefined });
    }
  }
  return result;
}
function homeExercises(equipment: Equipment[]): ExerciseTemplate[] {
  return exerciseTemplatesFromCatalog('home', equipment);
}

const GYM_EXERCISES: ExerciseTemplate[] = [
  { name: 'Przysiad na suwnicy', group: 'legs', gear: 'gym' },
  { name: 'Wypychanie na suwnicy', group: 'legs', gear: 'gym' },
  { name: 'Martwy ciąg rumuński z hantlami', group: 'legs', gear: 'gym' },
  { name: 'Uginanie nóg na maszynie', group: 'legs', gear: 'gym', reps: 12 },
  { name: 'Hip thrust', group: 'legs', gear: 'gym' },
  { name: 'Wspięcia na palce', group: 'legs', gear: 'gym', reps: 15 },
  { name: 'Wyciskanie na ławce', group: 'push', gear: 'gym' },
  { name: 'Wyciskanie hantli na skosie dodatnim', group: 'push', gear: 'gym' },
  { name: 'Wyciskanie hantli nad głowę', group: 'push', gear: 'gym' },
  { name: 'Unoszenie hantli bokiem', group: 'push', gear: 'gym', reps: 12 },
  { name: 'Prostowanie ramion na wyciągu', group: 'push', gear: 'gym', reps: 12 },
  { name: 'Ściąganie drążka wyciągu górnego', group: 'pull', gear: 'gym' },
  { name: 'Wiosłowanie siedząc na wyciągu', group: 'pull', gear: 'gym' },
  { name: 'Wiosłowanie z podparciem klatki', group: 'pull', gear: 'gym' },
  { name: 'Face pull', group: 'pull', gear: 'gym', reps: 12 },
  { name: 'Uginanie ramion z hantlami', group: 'pull', gear: 'gym', reps: 12 },
  { name: 'Plank', group: 'core', gear: 'gym', reps: 30, notes: 'W polu powtórzeń wpisz czas w sekundach.' },
  { name: 'Dead bug — naprzemienne opuszczanie kończyn', group: 'core', reps: 8 },
  { name: 'Spięcia brzucha kontrolowane', group: 'core', gear: 'gym', reps: 12 },
  { name: 'Marsz na bieżni lub rower stacjonarny', group: 'conditioning', gear: 'gym', reps: 5, notes: '5 minut w umiarkowanym tempie. Pole powtórzeń oznacza minuty.' },
  { name: 'Mobilizacja bioder', group: 'mobility', reps: 8, notes: 'Na każdą stronę.' },
  { name: 'Rotacje odcinka piersiowego', group: 'mobility', reps: 8, notes: 'Na każdą stronę.' },
];

function workoutPatterns(days: number): Pattern[] {
  if (days <= 3) return Array.from({ length: days }, (_, i) => 'full' as Pattern);
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return ['push', 'pull', 'legs', 'upper', 'full'];
  if (days === 6) return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
  return ['push', 'pull', 'legs', 'upper', 'lower', 'full', 'mobility'];
}

function patternLabel(pattern: Pattern): string {
  return ({ full: 'Całe ciało', upper: 'Góra ciała', lower: 'Dół ciała', push: 'Klatka, barki i triceps', pull: 'Plecy i biceps', legs: 'Nogi i pośladki', conditioning: 'Kondycja', mobility: 'Lekka regeneracja i mobilność' } as Record<Pattern, string>)[pattern];
}

function buildDays(location: Place, equipment: Equipment[], level: Level, goal: Goal, days: number, duration: number, focus: Focus): GeneratedPlanDay[] {
  const patterns = workoutPatterns(days);
  const library = location === 'gym' ? exerciseTemplatesFromCatalog('gym', []) : homeExercises(equipment);
  const sets = level === 'beginner' ? 2 : level === 'intermediate' ? 3 : 4;
  const defaultReps = goal === 'strength' ? (level === 'beginner' ? 8 : level === 'intermediate' ? 6 : 5) : goal === 'fat-loss' ? 12 : goal === 'muscle' ? (level === 'advanced' ? 8 : 10) : 10;
  const exerciseCount = duration <= 30 ? 4 : duration <= 45 ? 5 : duration <= 60 ? 6 : 7;
  const rest = goal === 'strength' ? 150 : level === 'beginner' ? 90 : 105;
  const used = new Set<string>();
  return patterns.map((pattern, dayIndex) => {
    let effectivePattern = pattern;
    if (focus === 'conditioning' && pattern !== 'mobility') effectivePattern = dayIndex % 3 === 2 ? 'legs' : 'conditioning';
    const desiredGroups: Array<ExerciseTemplate['group']> = effectivePattern === 'full'
      ? ['legs', 'push', 'pull', 'legs', 'core', 'conditioning', 'pull']
      : effectivePattern === 'upper' ? ['push', 'pull', 'push', 'pull', 'core', 'push', 'pull']
      : effectivePattern === 'lower' || effectivePattern === 'legs' ? ['legs', 'legs', 'legs', 'core', 'legs', 'conditioning', 'legs']
      : effectivePattern === 'push' ? ['push', 'push', 'push', 'legs', 'push', 'core', 'push']
      : effectivePattern === 'pull' ? ['pull', 'pull', 'pull', 'legs', 'pull', 'core', 'pull']
      : effectivePattern === 'mobility' ? ['mobility', 'mobility', 'core', 'mobility']
      : ['conditioning', 'legs', 'push', 'conditioning', 'core', 'pull', 'conditioning'];
    const targetCount = effectivePattern === 'mobility' ? 4 : exerciseCount;
    const picked: ExerciseTemplate[] = [];
    for (let index = 0; index < targetCount; index++) {
      const group = desiredGroups[index % desiredGroups.length];
      let candidates = library.filter(ex => ex.group === group);
      if (focus === 'upper' && ['full', 'upper'].includes(effectivePattern) && index > 1) {
        const upper = library.filter(ex => ex.group === 'push' || ex.group === 'pull');
        if (upper.length) candidates = upper;
      }
      if (focus === 'lower' && ['full', 'lower', 'legs'].includes(effectivePattern) && index > 1) {
        const lower = library.filter(ex => ex.group === 'legs');
        if (lower.length) candidates = lower;
      }
      if (!candidates.length) candidates = library.filter(ex => ex.group !== 'mobility');
      const unused = candidates.filter(ex => !used.has(`${dayIndex}:${ex.name}`) && !picked.some(item => item.name === ex.name));
      const pool = unused.length ? unused : candidates.filter(ex => !picked.some(item => item.name === ex.name));
      const exercise = pool[(dayIndex + index) % Math.max(pool.length, 1)];
      if (exercise) picked.push(exercise);
    }
    if (effectivePattern !== 'mobility' && picked.length < targetCount) {
      for (const fallback of library.filter(ex => !picked.some(p => p.name === ex.name))) {
        picked.push(fallback);
        if (picked.length >= targetCount) break;
      }
    }
    picked.forEach(ex => used.add(`${dayIndex}:${ex.name}`));
    return {
      day_key: String.fromCharCode(65 + dayIndex),
      title: `Dzień ${dayIndex + 1} — ${patternLabel(effectivePattern)}`,
      exercises: picked.map(ex => ({
        name: ex.name,
        sets: effectivePattern === 'mobility' ? 2 : sets,
        reps: ex.reps ?? defaultReps,
        weight_kg: null,
        ...(ex.notes ? { notes: ex.notes } : {}),
        rest_seconds: effectivePattern === 'mobility' ? 30 : rest,
        transition_rest_seconds: effectivePattern === 'mobility' ? 30 : 90,
      })),
    };
  });
}

export default function PlanGenerator({ defaultLocation, saving, hasPaidAccess, confirmedOrderNumber, canCreatePlan, onPurchase, onCancel, onSave, onReplaceExercises }: Props) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<Goal>('muscle');
  const [level, setLevel] = useState<Level>('beginner');
  const [location, setLocation] = useState<Place>(defaultLocation);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [days, setDays] = useState(3);
  const [duration, setDuration] = useState(45);
  const [focus, setFocus] = useState<Focus>('balanced');
  const [startDate, setStartDate] = useState(localDateString());
  const [progressionStrategy, setProgressionStrategy] = useState<ProgressionStrategy>('reps');
  const [planName, setPlanName] = useState('Mój plan treningowy');
  const [generatedDays, setGeneratedDays] = useState<GeneratedPlanDay[]>([]);
  const [generationMeta, setGenerationMeta] = useState<GeneratedPlanResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [selectedForReplacement, setSelectedForReplacement] = useState<Record<string, boolean>>({});
  const [preferredReplacementNames, setPreferredReplacementNames] = useState<Record<string, string>>({});
  const [replacingExercises, setReplacingExercises] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [replacementNotice, setReplacementNotice] = useState('');
  const selectedGoal = GOALS.find(item => item.id === goal) || GOALS[0];
  const selectedLevel = LEVELS.find(item => item.id === level) || LEVELS[0];
  const chosenEquipment = equipment.length ? equipment.map(id => EQUIPMENT_OPTIONS.find(item => item.id === id)?.title || id).join(', ') : 'bez sprzętu';
  const [paymentBanner, setPaymentBanner] = useState('');
  const autoSavingAfterPayment = useRef(false);

  useEffect(() => {
    try {
      const pendingRaw = window.sessionStorage.getItem('sf-generator-pending-draft-v1');
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw) as GeneratedPlanDraft & { goal?: Goal; level?: Level; focus?: Focus; equipment?: Equipment[]; days_count?: number; duration?: number };
        if (pending && Array.isArray(pending.days) && pending.days.length) {
          setPlanName(pending.name || 'Mój plan treningowy'); setGeneratedDays(pending.days); setGenerationMeta({ days: pending.days, duration_weeks: pending.duration_weeks || PROGRAM_WEEKS, start_date: pending.start_date, progression_strategy: pending.progression_strategy });
          if (pending.goal && GOALS.some(item => item.id === pending.goal)) setGoal(pending.goal);
          if (pending.level && LEVELS.some(item => item.id === pending.level)) setLevel(pending.level);
          if (pending.location === 'home' || pending.location === 'gym') setLocation(pending.location);
          if (Array.isArray(pending.equipment)) setEquipment(pending.equipment);
          if (typeof pending.days_count === 'number') setDays(pending.days_count);
          if (typeof pending.duration === 'number') setDuration(pending.duration);
          setStartDate(pending.start_date || localDateString()); setProgressionStrategy(pending.progression_strategy || 'reps'); setStep(3);
          return;
        }
      }
      const raw = window.sessionStorage.getItem(SAVED_GENERATOR_SETTINGS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<SavedGeneratorSettings> & { equipment?: Equipment[] | string };
      if (saved.goal && GOALS.some(item => item.id === saved.goal)) setGoal(saved.goal);
      if (saved.level && LEVELS.some(item => item.id === saved.level)) setLevel(saved.level);
      if (saved.location === 'home' || saved.location === 'gym') setLocation(saved.location);
      if (Array.isArray(saved.equipment)) setEquipment(saved.equipment.filter((item): item is Equipment => EQUIPMENT_OPTIONS.some(option => option.id === item)));
      else if (saved.equipment === 'both') setEquipment(['bands','dumbbells']);
      else if (saved.equipment === 'bands' || saved.equipment === 'dumbbells') setEquipment([saved.equipment]);
      else if (saved.equipment === 'none') setEquipment([]);
      if (typeof saved.days === 'number' && Number.isInteger(saved.days) && saved.days >= 1 && saved.days <= 7) setDays(saved.days);
      if ([30, 45, 60, 75].includes(Number(saved.duration))) setDuration(Number(saved.duration));
      if (saved.focus && FOCUSES.some(item => item.id === saved.focus)) setFocus(saved.focus);
      if (typeof saved.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.startDate)) setStartDate(saved.startDate);
      if (saved.progressionStrategy && PROGRESSION_OPTIONS.some(item => item.value === saved.progressionStrategy)) setProgressionStrategy(saved.progressionStrategy);
      setStep(2);
    } catch { /* Ustawienia są opcjonalne; uszkodzony wpis nie blokuje generatora. */ }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'cancelled') setPaymentBanner('Płatność nie została zakończona. Nie pobrano opłaty. Twój skonfigurowany plan pozostał w kreatorze — możesz spróbować ponownie.');
  }, []);

  useEffect(() => {
    if (autoSavingAfterPayment.current || !hasPaidAccess) return;
    let confirmed = false;
    try { confirmed = window.sessionStorage.getItem('sf-generator-payment-confirmed') === '1'; } catch { /* sessionStorage opcjonalny */ }
    if (!confirmed) return;
    let raw = '';
    try { raw = window.sessionStorage.getItem('sf-generator-pending-draft-v1') || ''; } catch { /* opcjonalny zapis */ }
    if (!raw) { try { window.sessionStorage.removeItem('sf-generator-payment-confirmed'); } catch {} return; }
    let draft: GeneratedPlanDraft;
    try { draft = JSON.parse(raw) as GeneratedPlanDraft; } catch { setGenerationError('Płatność potwierdzona, ale nie udało się odczytać podglądu planu. Wróć do konfiguratora i spróbuj zapisać plan ponownie.'); return; }
    autoSavingAfterPayment.current = true;
    setPaymentBanner('Płatność potwierdzona. Zapisuję skonfigurowany plan i otwieram edytor…');
    void onSave(draft).then(result => {
      if (result === false) { autoSavingAfterPayment.current = false; setGenerationError('Płatność została potwierdzona, ale zapis planu nie powiódł się. Twój podgląd pozostał zachowany — kliknij przycisk ponownie.'); return; }
      try { window.sessionStorage.removeItem('sf-generator-pending-draft-v1'); window.sessionStorage.removeItem('sf-generator-payment-confirmed'); window.sessionStorage.removeItem(SAVED_GENERATOR_SETTINGS_KEY); } catch { /* opcjonalny zapis */ }
    }).catch(error => { autoSavingAfterPayment.current = false; setGenerationError(error instanceof Error ? error.message : 'Płatność została potwierdzona, ale nie udało się zapisać planu.'); });
  }, [hasPaidAccess]);

  function navigateStep(next: number) { setStep(next); window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' })); }

  function generatedExerciseSelectionKey(day: GeneratedPlanDay, exerciseIndex: number, exercise: GeneratedPlanExercise) {
    return `${day.day_key}::${exerciseIndex}::${exercise.name}`;
  }

  function getSelectedGeneratedTargets() {
    return generatedDays.flatMap(day => day.exercises.map((exercise, exerciseIndex) => {
      const key = generatedExerciseSelectionKey(day, exerciseIndex, exercise);
      return selectedForReplacement[key] ? { key, day_key: day.day_key, day_title: day.title, exerciseIndex, name: exercise.name, sets: exercise.sets, reps: exercise.reps, notes: exercise.notes || '', preferred_name: preferredReplacementNames[key] || '', other_names: day.exercises.filter((_, otherIndex) => otherIndex !== exerciseIndex).map(item => item.name).filter(Boolean) } : null;
    }).filter((item): item is NonNullable<typeof item> => item !== null));
  }

  function toggleAllGeneratedExercises() {
    setReplacementError('');
    setReplacementNotice('');
    const allKeys = generatedDays.flatMap(day => day.exercises.map((exercise, index) => generatedExerciseSelectionKey(day, index, exercise)));
    if (allKeys.length > 0 && allKeys.every(key => selectedForReplacement[key])) {
      setSelectedForReplacement({});
      setPreferredReplacementNames({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const day of generatedDays) day.exercises.forEach((exercise, index) => { next[generatedExerciseSelectionKey(day, index, exercise)] = true; });
    setSelectedForReplacement(next);
  }

  async function replaceSelectedGeneratedExercises() {
    const targets = getSelectedGeneratedTargets();
    if (!targets.length || replacingExercises) return;
    if (targets.length > 49) { setReplacementError('Jednym razem można wymienić maksymalnie 49 ćwiczeń. Zaznacz mniejszą partię.'); return; }
    setReplacingExercises(true); setReplacementError(''); setReplacementNotice('');
    try {
      const requestToSelectionKey = new Map<string, string>();
      const requestExercises = targets.map((target, index) => {
        const requestKey = `E${index + 1}`;
        requestToSelectionKey.set(requestKey, target.key);
        return { key: requestKey, day_title: target.day_title, name: target.name, sets: target.sets, reps: target.reps, notes: target.notes, preferred_name: target.preferred_name, other_names: target.other_names };
      });
      const result = await onReplaceExercises({ location, equipment: location === 'home' ? equipment : 'gym', exercises: requestExercises });
      const replacements = new Map<string, string>();
      for (const item of result.replacements) {
        const selectionKey = requestToSelectionKey.get(item.key);
        if (!selectionKey) throw new Error('Katalog zwrócił nieznany identyfikator ćwiczenia. Plan pozostał bez zmian.');
        replacements.set(selectionKey, item.name);
      }
      if (replacements.size !== targets.length || targets.some(item => !replacements.has(item.key))) throw new Error('Nie udało się dobrać zamiennika dla każdego zaznaczonego ćwiczenia. Plan pozostał bez zmian.');
      setGeneratedDays(old => old.map(day => ({ ...day, exercises: day.exercises.map((exercise, index) => {
        const replacement = replacements.get(generatedExerciseSelectionKey(day, index, exercise));
        return replacement ? { ...exercise, name: replacement, weight_kg: null, notes: '', alternatives: [] } : exercise;
      }) })));
      const replacedKeys = new Set(targets.map(item => item.key));
      setSelectedForReplacement(old => Object.fromEntries(Object.entries(old).filter(([key, selected]) => selected && !replacedKeys.has(key))));
      setPreferredReplacementNames(old => Object.fromEntries(Object.entries(old).filter(([key]) => !replacedKeys.has(key))));
      setReplacementNotice(`Wymieniono ${targets.length} ${targets.length === 1 ? 'ćwiczenie' : targets.length < 5 ? 'ćwiczenia' : 'ćwiczeń'}. Serie, powtórzenia i przerwy zostały zachowane.`);
    } catch (error) {
      setReplacementError(error instanceof Error ? error.message : 'Nie udało się wymienić ćwiczeń. Plan pozostał bez zmian.');
    } finally {
      setReplacingExercises(false);
    }
  }

  const selectedGeneratedCount = getSelectedGeneratedTargets().length;

  const generate = async () => {
    if (!canCreatePlan) {
      setGenerationError('Osiągnięto limit zapisanych planów na tym koncie. Usuń jeden z własnych planów, aby kontynuować. Jeśli korzystasz z Premium, sprawdź, czy nie masz już 3 zapisanych planów.');
      return;
    }
    setSelectedForReplacement({}); setPreferredReplacementNames({}); setReplacementError(''); setReplacementNotice('');
    setGenerating(true); setGenerationError('');
    try {
      // Krótki ekran ładowania dla UX; plan powstaje lokalnie z zamkniętego katalogu.
      await new Promise(resolve => window.setTimeout(resolve, 450));
      const resultDays = buildDays(location, equipment, level, goal, days, duration, focus);
      if (!Array.isArray(resultDays) || resultDays.length !== days || !resultDays.every(day => Array.isArray(day.exercises) && day.exercises.length >= 1 && day.exercises.every(ex => typeof ex.name === 'string' && ex.name.trim()))) {
        throw new Error('Nie udało się zbudować kompletnego planu z katalogu ćwiczeń. Zmień ustawienia i spróbuj ponownie.');
      }
      const localResult: GeneratedPlanResult = {
        days: resultDays, duration_weeks: PROGRAM_WEEKS,
        start_date: startDate, progression_strategy: progressionStrategy,
      };
      setGeneratedDays(localResult.days); setGenerationMeta(localResult); navigateStep(3);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Nie udało się przygotować planu. Spróbuj ponownie.');
    } finally { setGenerating(false); }
  };

  const regenerateLocal = async () => {
    setSelectedForReplacement({}); setPreferredReplacementNames({}); setReplacementError(''); setReplacementNotice('');
    setGenerating(true); setGenerationError('');
    try {
      await new Promise(resolve => window.setTimeout(resolve, 350));
      const resultDays = buildDays(location, equipment, level, goal, days, duration, focus);
      if (!resultDays.length || !resultDays.every(day => day.exercises.length && day.exercises.every(ex => ex.name.trim()))) throw new Error('Nie udało się ułożyć planu z katalogu. Zmień ustawienia i spróbuj ponownie.');
      setGeneratedDays(resultDays);
      setGenerationMeta({ days: resultDays, duration_weeks: PROGRAM_WEEKS, start_date: startDate, progression_strategy: progressionStrategy });
      navigateStep(3);
    } catch (error) { setGenerationError(error instanceof Error ? error.message : 'Nie udało się ułożyć planu.'); }
    finally { setGenerating(false); }
  };

  const makeDraft = (): GeneratedPlanDraft => {
    const description = `Plan przygotowany na 4 tygodnie: cel — ${GOAL_NAMES[goal]}; poziom — ${LEVEL_NAMES[level]}; nacisk — ${FOCUS_NAMES[focus]}; ${location === 'home' ? `trening w domu (sprzęt: ${chosenEquipment})` : 'trening na siłowni'}; ${days} jednostki tygodniowo; około ${duration} min na jednostkę; progresja — ${progressionOption(progressionStrategy).shortLabel}. Dopasuj obciążenie do swoich możliwości i techniki.`;
    return { name: planName.trim(), description, location, days: generatedDays, duration_weeks: PROGRAM_WEEKS, start_date: startDate, progression_strategy: progressionStrategy };
  };
  const save = async () => {
    const draft = makeDraft();
    if (draft.name.length < 2 || !generationMeta) return;
    if (!hasPaidAccess) {
      try {
        window.sessionStorage.setItem(SAVED_GENERATOR_SETTINGS_KEY, JSON.stringify({ goal, level, location, equipment, days, duration, focus, startDate, progressionStrategy } satisfies SavedGeneratorSettings));
        window.sessionStorage.setItem('sf-generator-pending-draft-v1', JSON.stringify({ ...draft, goal, level, focus, equipment, days_count: days, duration }));
      } catch { setGenerationError('Nie udało się tymczasowo zachować planu. Sprawdź ustawienia przeglądarki i spróbuj ponownie.'); return; }
      setGenerationError('');
      try { await onPurchase(); }
      catch (error) { setGenerationError(error instanceof Error ? error.message : 'Wystąpił błąd płatności. Możesz ponowić próbę bez utraty konfiguracji.'); }
      return;
    }
    const saved = await onSave(draft);
    if (saved !== false) { try { window.sessionStorage.removeItem('sf-generator-pending-draft-v1'); window.sessionStorage.removeItem(SAVED_GENERATOR_SETTINGS_KEY); } catch { /* opcjonalny zapis */ } }
  };

  if (generating) return <section className="sf-view sf-plan-generator-view sf-gen-loading-view" role="status" aria-live="polite">
    <div className="sf-gen-loading-card">
      <div className="sf-gen-loader-ring" aria-hidden="true"><span/></div>
      <p className="sf-eyebrow">SYSTEM FORMY · KREATOR PLANU</p>
      <h1>Układamy Twój <span>plan.</span></h1>
      <p>Układamy trening z kontrolowanej biblioteki ćwiczeń, dopasowując podział dni, poziom i dostępny sprzęt.</p>
      <div className="sf-gen-loading-steps"><span className="is-done"><CheckCircle2 size={15}/> Analizujemy ustawienia</span><span className="is-current"><span className="sf-catalog-mini-spinner"/> Dobieramy ćwiczenia z katalogu</span><span><CheckCircle2 size={15}/> Sprawdzamy plan</span></div>
      <small>Plan powstaje lokalnie na podstawie katalogu ćwiczeń Systemu Formy.</small>
    </div>
  </section>;

  return <section className="sf-view sf-plan-generator-view">
    <div className="sf-gen-topline">
      <button type="button" className="sf-text-button" onClick={onCancel}><ArrowLeft size={16}/> Wróć do planów</button>
      <span className="sf-gen-badge"><Sparkles size={14}/> GENERATOR PLANU</span>
    </div>
    <header className="sf-gen-hero">
      <div className="sf-gen-hero-mark"><Sparkles size={24}/></div>
      <p className="sf-eyebrow">TWÓJ PLAN, TWOJE MOŻLIWOŚCI</p>
      <h1>Ułóżmy plan pod <span>Ciebie.</span></h1>
      <p>Odpowiedz na kilka krótkich pytań. Zobacz propozycję, a potem dopracuj ćwiczenia w edytorze.</p>
    </header>

    <div className="sf-gen-progress" aria-label={`Krok ${step} z 3`}>
      {[{ n: 1, title: 'Cel i poziom' }, { n: 2, title: 'Warunki treningu' }, { n: 3, title: 'Twoja propozycja' }].map(item => <div className={`sf-gen-progress-step ${step === item.n ? 'is-current' : step > item.n ? 'is-done' : ''}`} key={item.n}><span>{step > item.n ? <Check size={15}/> : item.n}</span><b>{item.title}</b></div>)}
    </div>

    {step === 1 && <div className="sf-gen-content">
      <div className="sf-gen-section-head"><div><p className="sf-eyebrow">KROK 1 Z 3</p><h2>Co chcesz osiągnąć?</h2><p>To pomoże dobrać charakter treningów, liczbę powtórzeń i przerwy.</p></div><span className="sf-gen-step-number">01</span></div>
      <div className="sf-gen-goal-grid">{GOALS.map(item => { const Icon = item.icon; return <button type="button" key={item.id} className={`sf-gen-choice-card ${goal === item.id ? 'is-selected' : ''}`} onClick={() => setGoal(item.id)}><span className="sf-gen-choice-icon"><Icon size={20}/></span><span className="sf-gen-radio-dot"/><b>{item.title}</b><small>{item.desc}</small></button>; })}</div>
      <div className="sf-gen-section-head sf-gen-section-head-small"><div><h2>Jak oceniasz swój poziom?</h2><p>Plan będzie miał odpowiednią objętość i stopień trudności.</p></div></div>
      <div className="sf-gen-level-grid">{LEVELS.map(item => <button type="button" key={item.id} className={`sf-gen-level-card ${level === item.id ? 'is-selected' : ''}`} onClick={() => setLevel(item.id)}><span className="sf-gen-radio-dot"/><b>{item.title}</b><small>{item.desc}</small></button>)}</div>
      <div className="sf-gen-footer"><span>Możesz później zmienić ćwiczenia w edytorze.</span><button type="button" className="sf-button sf-button-lime" onClick={() => navigateStep(2)}>Dalej <ArrowRight size={16}/></button></div>
    </div>}

    {step === 2 && <div className="sf-gen-content">
      <div className="sf-gen-section-head"><div><p className="sf-eyebrow">KROK 2 Z 3</p><h2>Jak i kiedy trenujesz?</h2><p>Ustaw realne warunki, do których dopasujemy podział treningów i ćwiczenia.</p></div><span className="sf-gen-step-number">02</span></div>
      <div className="sf-gen-location-grid">
        <button type="button" className={`sf-gen-location-card ${location === 'home' ? 'is-selected' : ''}`} onClick={() => setLocation('home')}><span className="sf-gen-choice-icon"><Home size={22}/></span><span className="sf-gen-radio-dot"/><b>W domu</b><small>Ćwiczenia dopasowane do dostępnego sprzętu.</small></button>
        <button type="button" className={`sf-gen-location-card ${location === 'gym' ? 'is-selected' : ''}`} onClick={() => setLocation('gym')}><span className="sf-gen-choice-icon"><Dumbbell size={22}/></span><span className="sf-gen-radio-dot"/><b>Na siłowni</b><small>Wykorzystamy maszyny, hantle i wyciągi.</small></button>
      </div>
      {location === 'home' && <div className="sf-gen-subsection"><div className="sf-gen-subsection-head"><h3>Jaki masz sprzęt?</h3><span>Możesz zaznaczyć kilka opcji.</span></div><button type="button" className={`sf-gen-equipment-card sf-gen-no-equipment ${equipment.length === 0 ? 'is-selected' : ''}`} onClick={() => setEquipment([])}><span className="sf-gen-radio-dot"/><b>Nie mam sprzętu</b><small>Plan oparty na masie własnego ciała.</small></button><div className="sf-gen-equipment-grid">{EQUIPMENT_OPTIONS.map(item => <button type="button" key={item.id} className={`sf-gen-equipment-card ${equipment.includes(item.id) ? 'is-selected' : ''}`} aria-pressed={equipment.includes(item.id)} onClick={() => setEquipment(old => old.includes(item.id) ? old.filter(value => value !== item.id) : [...old, item.id])}><span className="sf-gen-radio-dot"/><b>{item.title}</b><small>{item.desc}</small></button>)}</div></div>}
      <div className="sf-gen-setting-grid">
        <div className="sf-gen-setting-card"><div className="sf-gen-setting-icon"><CalendarDays size={19}/></div><div className="sf-gen-subsection-head"><h3>Ile dni w tygodniu?</h3><b>{days} {days === 1 ? 'dzień' : days < 5 ? 'dni' : 'dni'}</b></div><p>Wybierz od 1 do 7 jednostek treningowych.</p><div className="sf-gen-number-chips">{[1, 2, 3, 4, 5, 6, 7].map(value => <button type="button" key={value} className={days === value ? 'is-selected' : ''} onClick={() => setDays(value)}>{value}</button>)}</div>{days === 7 && <small className="sf-gen-inline-note">Siódmy dzień będzie lżejszy i nastawiony na mobilność oraz regenerację.</small>}</div>
        <div className="sf-gen-setting-card"><div className="sf-gen-setting-icon"><Clock3 size={19}/></div><div className="sf-gen-subsection-head"><h3>Ile masz czasu?</h3><b>{duration} min</b></div><p>Szacowany czas jednej jednostki treningowej.</p><div className="sf-gen-duration-options">{[{ v: 30, label: '30 min' }, { v: 45, label: '45 min' }, { v: 60, label: '60 min' }, { v: 75, label: '75 min' }].map(item => <button type="button" key={item.v} className={duration === item.v ? 'is-selected' : ''} onClick={() => setDuration(item.v)}>{item.label}</button>)}</div></div>
      </div>
      <div className="sf-gen-subsection sf-gen-focus-subsection"><div className="sf-gen-subsection-head"><h3>Na czym chcesz położyć większy nacisk?</h3><span>Opcjonalnie</span></div><div className="sf-gen-focus-options">{FOCUSES.map(item => <button type="button" key={item.id} className={focus === item.id ? 'is-selected' : ''} onClick={() => setFocus(item.id)}>{item.title}</button>)}</div></div>
      <div className="sf-gen-month-settings"><div className="sf-gen-month-settings-title"><div><p className="sf-eyebrow">PLAN MIESIĘCZNY</p><h3>Ustaw start i progresję</h3><p>Generator przygotuje tygodniowy schemat na 4 tygodnie (28 dni). Nie tworzymy 28 kopii tych samych treningów — w każdym tygodniu zmieniają się parametry zgodnie z wybraną zasadą.</p></div><span><CalendarDays size={20}/></span></div><div className="sf-month-program-fields"><label>Start programu<input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)}/></label><label>Specyfika progresu<select value={progressionStrategy} onChange={event => setProgressionStrategy(event.target.value as ProgressionStrategy)}>{PROGRESSION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="sf-month-progression-explainer"><b>{progressionOption(progressionStrategy).shortLabel}</b><span>{progressionOption(progressionStrategy).explanation}</span></div></div>
      {generationError && <div className="sf-gen-error" role="alert">{generationError}</div>}
      <div className="sf-gen-footer"><button type="button" className="sf-button sf-button-outline" disabled={generating} onClick={() => navigateStep(1)}><ArrowLeft size={16}/> Wstecz</button><button type="button" className="sf-button sf-button-lime" disabled={generating || saving} onClick={() => void generate()}>{generating ? <><Sparkles size={16}/> Układam podgląd…</> : <>Ułóż podgląd planu <ArrowRight size={16}/></>}</button></div>
    </div>}

    {step === 3 && <div className="sf-gen-content sf-gen-result-content">
      <div className="sf-gen-result-banner"><span><CheckCircle2 size={23}/></span><div><p className="sf-eyebrow">PLAN Z KATALOGU SYSTEMU FORMY</p><h2>Sprawdź swój plan</h2><p>Dni i ćwiczenia zostały dobrane według stałych zasad z zamkniętej biblioteki. Możesz wymienić wybrane pozycje na znane, dostępne ćwiczenia.</p></div></div>
      <div className="sf-gen-summary-grid">
        <div><small>Cel</small><b>{selectedGoal.title}</b></div>
        <div><small>Poziom</small><b>{selectedLevel.title}</b></div>
        <div><small>Miejsce</small><b>{location === 'home' ? 'W domu' : 'Na siłowni'}</b></div>
        <div><small>Program</small><b>4 tygodnie · {days}/tydz.</b></div>
      </div>
      <section className="sf-gen-month-summary"><div><h3>Plan na 4 tygodnie</h3><p>Program trwa od {formatProgramDate(startDate)} do {formatProgramDate(getProgramEndDate(startDate))}. Ten sam tygodniowy układ treningów powtarza się przez 4 tygodnie, a parametry są dostosowane do wybranej progresji.</p></div><div className="sf-gen-month-weeks">{[1,2,3,4].map(week => { const example = generatedDays.flatMap(day => day.exercises).find(ex => ex.name); const prescribed = example ? exerciseForProgramWeek(example, progressionStrategy, week) : null; const value = !prescribed ? '—' : progressionStrategy === 'weight' ? prescribed.weight_kg == null ? 'Mały krok ciężaru' : `${prescribed.weight_kg} kg` : `${prescribed.sets} ser. × ${prescribed.reps} powt.`; return <div key={week}><small>TYDZIEŃ {week}</small><b>{value}</b></div>; })}</div><p><b>{progressionOption(progressionStrategy).shortLabel}:</b> {progressionOption(progressionStrategy).explanation}</p></section>
      <label className="sf-gen-plan-name">Nazwa Twojego planu<input value={planName} onChange={event => setPlanName(event.target.value)} maxLength={120} minLength={2} required placeholder="np. Siła i forma — plan A"/></label>
      <section className="sf-builder-catalog-replace-toolbar sf-gen-preview-replace" aria-label="Wymiana ćwiczeń w podglądzie">
        <div className="sf-builder-catalog-replace-copy"><b>Nie pasuje Ci jakieś ćwiczenie?</b><span>Zaznacz ćwiczenia do wymiany i wybierz zamiennik z listy podobnych ruchów. Lista dopasowuje kategorię i dostępny sprzęt.</span></div>
        <div className="sf-builder-catalog-replace-actions"><button type="button" className="sf-button sf-button-outline sf-button-sm" disabled={replacingExercises} onClick={toggleAllGeneratedExercises}>{generatedDays.length > 0 && generatedDays.flatMap(day => day.exercises.map((exercise, index) => generatedExerciseSelectionKey(day,index,exercise))).every(key => selectedForReplacement[key]) ? 'Odznacz cały plan' : 'Zaznacz cały plan'}</button><button type="button" className="sf-button sf-button-lime sf-button-sm" disabled={replacingExercises || selectedGeneratedCount === 0} onClick={() => void replaceSelectedGeneratedExercises()}>{replacingExercises ? <><span className="sf-catalog-mini-spinner"/> Dobieram zamienniki…</> : <><RotateCcw size={14}/> Wymień zaznaczone ({selectedGeneratedCount})</>}</button></div>
        {selectedGeneratedCount > 0 && <small className="sf-builder-catalog-selected-count">Zaznaczono {selectedGeneratedCount} ćwiczeń. Wszystkie pozostałe parametry treningu zostaną zachowane.</small>}
        {replacementError && <div className="sf-builder-catalog-feedback is-error" role="alert">{replacementError}</div>}
        {replacementNotice && <div className="sf-builder-catalog-feedback is-success" role="status">{replacementNotice}</div>}
      </section>
      <div className="sf-gen-day-list">{generatedDays.map((day, index) => <article className="sf-gen-day-card" key={day.day_key}><header><span className="sf-gen-day-index">{String(index + 1).padStart(2, '0')}</span><div><p className="sf-eyebrow">{location === 'home' ? 'DOM' : 'SIŁOWNIA'} · {day.exercises.length} ĆWICZEŃ</p><h3>{day.title.replace(/^Dzień \d+ — /, '')}</h3></div><span className="sf-gen-day-chevron"><ArrowRight size={17}/></span></header><div className="sf-gen-exercise-list">{day.exercises.map((exercise, exerciseIndex) => { const selectionKey = generatedExerciseSelectionKey(day, exerciseIndex, exercise); const isSelected = Boolean(selectedForReplacement[selectionKey]); return <div className="sf-gen-exercise-wrap" key={`${day.day_key}-${exercise.name}-${exerciseIndex}`}><div className="sf-gen-exercise-row"><label className="sf-gen-exercise-select"><input type="checkbox" checked={isSelected} disabled={replacingExercises} onChange={event => { setSelectedForReplacement(old => ({ ...old, [selectionKey]: event.target.checked })); setReplacementError(''); setReplacementNotice(''); }}/><span>{String(exerciseIndex + 1).padStart(2, '0')}</span></label><b>{exercise.name}</b><small>{exercise.sets} × {exercise.reps}{exercise.notes?.toLowerCase().includes('minut') ? ' min' : exercise.notes?.toLowerCase().includes('sekund') ? ' s' : ''}</small></div>{isSelected && (() => { const choices = exerciseCatalogReplacementOptions(exercise.name, location, location === 'gym' ? 'gym' : (equipment.length ? equipment : 'none')); const sameDayNames = day.exercises.filter((_, otherIndex) => otherIndex !== exerciseIndex).map(item => item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()); const options = choices.exercises.filter(option => !sameDayNames.includes(option.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())); return <label className="sf-builder-catalog-preference sf-gen-exercise-preference">Zamiennik{choices.category ? <span> · {choices.category}</span> : null}<select value={preferredReplacementNames[selectionKey] || ''} disabled={replacingExercises || options.length === 0} onChange={event => setPreferredReplacementNames(old => ({ ...old, [selectionKey]: event.target.value }))}><option value="">Dobierz automatycznie z tej kategorii</option>{options.map(option => <option value={option} key={option}>{option}</option>)}</select>{options.length === 0 && <small>Brak innego ćwiczenia tej kategorii z zaznaczonym sprzętem. Zmień sprzęt albo odznacz to ćwiczenie.</small>}</label>; })()}</div>; })}</div><div className="sf-gen-day-foot"><span><Clock3 size={13}/> Przerwa: {day.exercises[0]?.rest_seconds ?? 90} s</span><span>{day.exercises.reduce((total, ex) => total + ex.sets, 0)} serii łącznie</span></div></article>)}</div>
      {generationError && <div className="sf-gen-error" role="alert">{generationError}</div>}
      {generating && <div className="sf-gen-history-strip" role="status"><Sparkles size={16}/><span><b>Katalog przygotowuje nową wersję.</b> Poprzedni podgląd zostaje zachowany do czasu otrzymania nowego wyniku.</span></div>}
      {paymentBanner && <div className={paymentBanner.startsWith('Płatność nie została') ? 'sf-gen-error' : 'sf-info-note'} role={paymentBanner.startsWith('Płatność nie została') ? 'alert' : 'status'}>{paymentBanner}</div>}{confirmedOrderNumber && <div className="sf-info-note sf-payment-transaction-number" role="status">Numer transakcji: <b>{confirmedOrderNumber}</b></div>}
      <div className="sf-gen-footer sf-gen-result-footer"><button type="button" className="sf-button sf-button-outline" disabled={generating || saving} onClick={() => navigateStep(2)}><ArrowLeft size={16}/> Zmień ustawienia</button><button type="button" className="sf-button sf-button-outline" disabled={generating || saving} onClick={() => void regenerateLocal()}><Sparkles size={16}/> {generating ? 'Układam nową wersję…' : 'Ułóż inną wersję'}</button><button type="button" className="sf-button sf-button-lime" disabled={saving || generating || planName.trim().length < 2 || autoSavingAfterPayment.current} onClick={() => void save()}>{saving ? 'Zapisuję plan…' : hasPaidAccess ? 'Zapisz plan i otwórz edytor' : 'Skonfiguruj swój plan (29,99 zł)'} <ArrowRight size={16}/></button></div>
    </div>}

    <div className="sf-gen-bottom-hint"><span><CheckCircle2 size={15}/></span><p>Plan jest punktem wyjścia — dobieraj obciążenie do swoich możliwości i techniki. Jeśli ćwiczenie powoduje ból, przerwij je i wybierz bezpieczny wariant.</p></div>
  </section>;
}
