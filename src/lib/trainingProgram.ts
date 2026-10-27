export type ProgressionStrategy = 'reps' | 'weight' | 'sets' | 'none';
export type MonthlyExerciseBase = {
  name: string;
  sets: number;
  reps: number;
  weight_kg?: number | null;
  notes?: string;
};
export type MonthlyExercisePrescription = MonthlyExerciseBase & {
  progression_note: string;
  program_week: number;
};

export const PROGRAM_WEEKS = 4;

export const PROGRESSION_OPTIONS: Array<{ value: ProgressionStrategy; label: string; shortLabel: string; explanation: string }> = [
  { value: 'reps', label: 'Stopniowo zwiększaj powtórzenia', shortLabel: 'Więcej powtórzeń', explanation: 'W tygodniach 2–4 dodajesz po 1 powtórzeniu na serię, jeśli wykonujesz ćwiczenie technicznie poprawnie.' },
  { value: 'weight', label: 'Stopniowo zwiększaj ciężar', shortLabel: 'Większy ciężar', explanation: 'Co tydzień zwiększaj ciężar o mały krok (zwykle ok. 2,5%), wyłącznie jeśli poprzedni trening był wykonany poprawnie. Gdy ciężar nie jest określony, dobierz go podczas pierwszej sesji.' },
  { value: 'sets', label: 'Stopniowo zwiększaj liczbę serii', shortLabel: 'Więcej serii', explanation: 'Tydzień 2: +1 seria, tydzień 3: utrzymanie, tydzień 4: do +2 serii względem bazy (maksymalnie 6 serii na ćwiczenie).' },
  { value: 'none', label: 'Stałe parametry przez 4 tygodnie', shortLabel: 'Bez automatycznej progresji', explanation: 'Zachowaj serie, powtórzenia i wpisany ciężar przez cały blok. Nadal dopasuj obciążenie do samopoczucia i techniki.' },
];

export function progressionOption(strategy: ProgressionStrategy | string | null | undefined) {
  return PROGRESSION_OPTIONS.find((item) => item.value === strategy) ?? PROGRESSION_OPTIONS[0];
}

function dateOnlyUtc(value: string): number | null {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const check = new Date(timestamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return timestamp;
}

export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getProgramWeek(startDate?: string | null, referenceDate = new Date(), durationWeeks = PROGRAM_WEEKS): number {
  const start = dateOnlyUtc(startDate || localDateString(referenceDate));
  const current = dateOnlyUtc(localDateString(referenceDate));
  if (start === null || current === null || current <= start) return 1;
  const elapsedDays = Math.floor((current - start) / 86_400_000);
  return Math.max(1, Math.min(Math.max(1, durationWeeks), Math.floor(elapsedDays / 7) + 1));
}

export function getProgramEndDate(startDate?: string | null, durationWeeks = PROGRAM_WEEKS): string {
  const start = dateOnlyUtc(startDate || localDateString());
  if (start === null) return localDateString();
  const end = new Date(start + Math.max(1, durationWeeks) * 7 * 86_400_000 - 86_400_000);
  return `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`;
}

export function formatProgramDate(value?: string | null): string {
  const timestamp = dateOnlyUtc(value || localDateString());
  if (timestamp === null) return '—';
  return new Date(timestamp).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function isProgramComplete(startDate?: string | null, referenceDate = new Date(), durationWeeks = PROGRAM_WEEKS): boolean {
  const start = dateOnlyUtc(startDate || localDateString(referenceDate));
  const current = dateOnlyUtc(localDateString(referenceDate));
  if (start === null || current === null) return false;
  return current - start >= Math.max(1, durationWeeks) * 7 * 86_400_000;
}

export function exerciseForProgramWeek<T extends MonthlyExerciseBase>(exercise: T, strategy: ProgressionStrategy | string | null | undefined, week: number): T & MonthlyExercisePrescription {
  const safeWeek = Math.max(1, Math.min(PROGRAM_WEEKS, Math.floor(week) || 1));
  const normalizedStrategy: ProgressionStrategy = ['reps', 'weight', 'sets', 'none'].includes(String(strategy)) ? strategy as ProgressionStrategy : 'reps';
  const baseSets = Math.max(1, Math.min(30, Math.floor(Number(exercise.sets) || 3)));
  const baseReps = Math.max(1, Math.min(200, Math.floor(Number(exercise.reps) || 10)));
  const baseWeight = exercise.weight_kg == null || !Number.isFinite(Number(exercise.weight_kg)) ? null : Number(exercise.weight_kg);
  let sets = baseSets;
  let reps = baseReps;
  let weight_kg = baseWeight;
  let progression_note = '';

  if (normalizedStrategy === 'reps') {
    const timeBased = /sekund|minut|izometr|czas utrzymania/i.test(`${exercise.name} ${exercise.notes || ''}`);
    if (!timeBased) reps = Math.min(30, baseReps + safeWeek - 1);
    progression_note = timeBased
      ? 'To ćwiczenie jest mierzone czasem. Wydłużaj czas tylko wtedy, gdy zachowujesz prawidłową pozycję.'
      : safeWeek === 1
        ? 'Tydzień 1: punkt wyjścia. W kolejnych tygodniach dodawaj po 1 powtórzeniu, jeśli technika pozostaje poprawna.'
        : `Tydzień ${safeWeek}/4: cel to ${reps} powtórzeń w serii. Nie zwiększaj zakresu kosztem techniki.`;
  } else if (normalizedStrategy === 'sets') {
    const extra = safeWeek === 1 ? 0 : safeWeek === 2 ? 1 : safeWeek === 3 ? 1 : 2;
    sets = Math.min(6, baseSets + extra);
    progression_note = safeWeek === 1
      ? 'Tydzień 1: punkt wyjścia. Progresja serii w kolejnych tygodniach jest ograniczona do maksymalnie 6 serii.'
      : `Tydzień ${safeWeek}/4: plan zakłada ${sets} serii. Zostaw mniej, jeśli pogarsza się technika lub regeneracja.`;
  } else if (normalizedStrategy === 'weight') {
    if (baseWeight != null && baseWeight > 0) {
      const increment = Math.max(0.5, Math.round((baseWeight * 0.025) / 0.5) * 0.5);
      weight_kg = Math.round((baseWeight + increment * (safeWeek - 1)) * 2) / 2;
    }
    progression_note = safeWeek === 1
      ? 'Tydzień 1: ustal ciężar, z którym wykonasz wszystkie serie z dobrą techniką.'
      : `Tydzień ${safeWeek}/4: zwiększaj ciężar małym krokiem (około 2,5% lub najmniejszy dostępny stopień) tylko po poprawnym wykonaniu poprzednich serii. Jeśli to za trudne, powtórz poprzedni ciężar.`;
  } else {
    progression_note = 'Przez 4 tygodnie zachowaj bazowe parametry; dopasuj ciężar do aktualnych możliwości i techniki.';
  }

  return { ...exercise, sets, reps, weight_kg, progression_note, program_week: safeWeek };
}
