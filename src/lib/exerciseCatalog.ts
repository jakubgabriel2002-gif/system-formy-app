export type TrainingPlace = 'home' | 'gym';
export type TrainingEquipment = 'none' | 'bands' | 'dumbbells' | 'bench' | 'squat_rack' | 'pullup_bar' | 'both' | 'gym';
export type ExerciseGroup = 'legs' | 'push' | 'pull' | 'core' | 'conditioning' | 'mobility';
export type ExerciseCategory = 'Klatka piersiowa' | 'Barki' | 'Triceps' | 'Plecy' | 'Biceps' | 'Nogi i pośladki' | 'Brzuch i core' | 'Kondycja' | 'Mobilność i regeneracja';
export type Exercise = { name: string; group: ExerciseGroup; category?: ExerciseCategory; places: TrainingPlace[]; equipment?: TrainingEquipment[] };

const H: TrainingPlace[] = ['home'];
const HG: TrainingPlace[] = ['home', 'gym'];
const G: TrainingPlace[] = ['gym'];
const CATALOG: Exercise[] = [
  // Klatka piersiowa — masa własnego ciała, hantle, ławka i siłownia
  {name:'Pompki klasyczne',group:'push',category:'Klatka piersiowa',places:H}, {name:'Pompki z nogami na podwyższeniu',group:'push',category:'Klatka piersiowa',places:H}, {name:'Pompki z pauzą na dole',group:'push',category:'Klatka piersiowa',places:H}, {name:'Pompki diamentowe',group:'push',category:'Triceps',places:H}, {name:'Pompki archer',group:'push',category:'Klatka piersiowa',places:H}, {name:'Pompki z obciążeniem',group:'push',category:'Klatka piersiowa',places:H,equipment:['dumbbells','bench']}, {name:'Wyciskanie hantli na podłodze',group:'push',category:'Klatka piersiowa',places:H,equipment:['dumbbells']}, {name:'Wyciskanie hantli na ławce poziomej',group:'push',category:'Klatka piersiowa',places:H,equipment:['dumbbells','bench']}, {name:'Wyciskanie hantli na ławce skośnej',group:'push',category:'Klatka piersiowa',places:H,equipment:['dumbbells','bench']}, {name:'Rozpiętki z hantlami na podłodze',group:'push',category:'Klatka piersiowa',places:H,equipment:['dumbbells']}, {name:'Rozpiętki z hantlami na ławce',group:'push',category:'Klatka piersiowa',places:H,equipment:['dumbbells','bench']}, {name:'Wyciskanie sztangi leżąc',group:'push',category:'Klatka piersiowa',places:H,equipment:['bench','squat_rack']}, {name:'Wyciskanie sztangi na skosie dodatnim',group:'push',category:'Klatka piersiowa',places:H,equipment:['bench','squat_rack']}, {name:'Wyciskanie na maszynie',group:'push',category:'Klatka piersiowa',places:G,equipment:['gym']}, {name:'Wyciskanie sztangi leżąc',group:'push',category:'Klatka piersiowa',places:G,equipment:['gym']}, {name:'Wyciskanie hantli na skosie dodatnim',group:'push',category:'Klatka piersiowa',places:G,equipment:['gym']}, {name:'Rozpiętki na bramie',group:'push',category:'Klatka piersiowa',places:G,equipment:['gym']}, {name:'Pompki na poręczach z pochyleniem',group:'push',category:'Klatka piersiowa',places:G,equipment:['gym']},
  // Barki
  {name:'Wyciskanie hantli nad głowę',group:'push',category:'Barki',places:HG,equipment:['dumbbells']}, {name:'Wyciskanie żołnierskie sztangi',group:'push',category:'Barki',places:H,equipment:['squat_rack']}, {name:'Unoszenie hantli bokiem',group:'push',category:'Barki',places:HG,equipment:['dumbbells']}, {name:'Unoszenie hantli w opadzie tułowia',group:'push',category:'Barki',places:HG,equipment:['dumbbells']}, {name:'Wznosy przodem z hantlami',group:'push',category:'Barki',places:HG,equipment:['dumbbells']}, {name:'Pike push-up',group:'push',category:'Barki',places:H}, {name:'Arnold press',group:'push',category:'Barki',places:HG,equipment:['dumbbells']}, {name:'Face pull',group:'pull',category:'Barki',places:G,equipment:['gym']}, {name:'Odwrotne rozpiętki na maszynie',group:'pull',category:'Barki',places:G,equipment:['gym']},
  // Triceps
  {name:'Prostowanie ramion z gumą nad głową',group:'push',category:'Triceps',places:H,equipment:['bands']}, {name:'Prostowanie ramion z hantlem zza głowy',group:'push',category:'Triceps',places:H,equipment:['dumbbells']}, {name:'Wąskie pompki',group:'push',category:'Triceps',places:H}, {name:'Dipy między stabilnymi podporami',group:'push',category:'Triceps',places:H,equipment:['bench']}, {name:'Prostowanie ramion na wyciągu',group:'push',category:'Triceps',places:G,equipment:['gym']}, {name:'Francuskie wyciskanie hantli',group:'push',category:'Triceps',places:HG,equipment:['dumbbells']},
  // Plecy
  {name:'Wiosłowanie gumą oporową',group:'pull',category:'Plecy',places:H,equipment:['bands']}, {name:'Wiosłowanie gumą w opadzie',group:'pull',category:'Plecy',places:H,equipment:['bands']}, {name:'Ściąganie gumy z góry',group:'pull',category:'Plecy',places:H,equipment:['bands']}, {name:'Wiosłowanie hantlem jednorącz',group:'pull',category:'Plecy',places:HG,equipment:['dumbbells']}, {name:'Wiosłowanie hantlami w opadzie',group:'pull',category:'Plecy',places:HG,equipment:['dumbbells']}, {name:'Wiosłowanie z podparciem klatki',group:'pull',category:'Plecy',places:HG,equipment:['dumbbells','bench']}, {name:'Martwy ciąg rumuński z hantlami',group:'pull',category:'Plecy',places:HG,equipment:['dumbbells']}, {name:'Podciąganie nachwytem',group:'pull',category:'Plecy',places:H,equipment:['pullup_bar']}, {name:'Podciąganie podchwytem',group:'pull',category:'Plecy',places:H,equipment:['pullup_bar']}, {name:'Podciąganie z gumą wspomagającą',group:'pull',category:'Plecy',places:H,equipment:['pullup_bar','bands']}, {name:'Wiosłowanie australijskie',group:'pull',category:'Plecy',places:H,equipment:['squat_rack']}, {name:'Superman — unoszenie tułowia',group:'pull',category:'Plecy',places:H}, {name:'Y-T-W w leżeniu na brzuchu',group:'pull',category:'Plecy',places:H}, {name:'Ściąganie drążka wyciągu górnego',group:'pull',category:'Plecy',places:G,equipment:['gym']}, {name:'Wiosłowanie siedząc na wyciągu',group:'pull',category:'Plecy',places:G,equipment:['gym']}, {name:'Wiosłowanie sztangą',group:'pull',category:'Plecy',places:G,equipment:['gym']}, {name:'Wiosłowanie na maszynie',group:'pull',category:'Plecy',places:G,equipment:['gym']}, {name:'Prostowanie grzbietu na ławce rzymskiej',group:'pull',category:'Plecy',places:G,equipment:['gym']},
  // Biceps
  {name:'Uginanie ramion z hantlami',group:'pull',category:'Biceps',places:HG,equipment:['dumbbells']}, {name:'Uginanie młotkowe hantli',group:'pull',category:'Biceps',places:HG,equipment:['dumbbells']}, {name:'Uginanie ramion z gumą',group:'pull',category:'Biceps',places:H,equipment:['bands']}, {name:'Uginanie ramion ze sztangą',group:'pull',category:'Biceps',places:G,equipment:['gym']}, {name:'Uginanie ramion na modlitewniku',group:'pull',category:'Biceps',places:G,equipment:['gym']}, {name:'Podciąganie podchwytem na biceps',group:'pull',category:'Biceps',places:H,equipment:['pullup_bar']},
  // Nogi i pośladki
  {name:'Przysiady z masą ciała',group:'legs',category:'Nogi i pośladki',places:HG}, {name:'Przysiady z pauzą',group:'legs',category:'Nogi i pośladki',places:H}, {name:'Przysiady bułgarskie',group:'legs',category:'Nogi i pośladki',places:H,equipment:['bench']}, {name:'Przysiad goblet z hantlem',group:'legs',category:'Nogi i pośladki',places:H,equipment:['dumbbells']}, {name:'Przysiad przedni ze sztangą',group:'legs',category:'Nogi i pośladki',places:H,equipment:['squat_rack']}, {name:'Przysiad ze sztangą na plecach',group:'legs',category:'Nogi i pośladki',places:H,equipment:['squat_rack']}, {name:'Wykroki w tył',group:'legs',category:'Nogi i pośladki',places:HG}, {name:'Wykroki chodzone z hantlami',group:'legs',category:'Nogi i pośladki',places:HG,equipment:['dumbbells']}, {name:'Wykroki boczne',group:'legs',category:'Nogi i pośladki',places:HG}, {name:'Most biodrowy',group:'legs',category:'Nogi i pośladki',places:HG}, {name:'Hip thrust',group:'legs',category:'Nogi i pośladki',places:HG,equipment:['bench','dumbbells']}, {name:'Hip thrust ze sztangą',group:'legs',category:'Nogi i pośladki',places:H,equipment:['bench','squat_rack']}, {name:'Martwy ciąg rumuński z hantlami',group:'legs',category:'Nogi i pośladki',places:HG,equipment:['dumbbells']}, {name:'Martwy ciąg klasyczny ze sztangą',group:'legs',category:'Nogi i pośladki',places:H,equipment:['squat_rack']}, {name:'Wspięcia na palce',group:'legs',category:'Nogi i pośladki',places:HG}, {name:'Wspięcia na palce na jednej nodze',group:'legs',category:'Nogi i pośladki',places:HG}, {name:'Chodzenie bokiem z minibandem',group:'legs',category:'Nogi i pośladki',places:H,equipment:['bands']}, {name:'Odwodzenie nogi z gumą',group:'legs',category:'Nogi i pośladki',places:H,equipment:['bands']}, {name:'Uginanie nóg z gumą',group:'legs',category:'Nogi i pośladki',places:H,equipment:['bands']}, {name:'Przysiad na suwnicy',group:'legs',category:'Nogi i pośladki',places:G,equipment:['gym']}, {name:'Wypychanie na suwnicy',group:'legs',category:'Nogi i pośladki',places:G,equipment:['gym']}, {name:'Uginanie nóg na maszynie',group:'legs',category:'Nogi i pośladki',places:G,equipment:['gym']}, {name:'Prostowanie nóg na maszynie',group:'legs',category:'Nogi i pośladki',places:G,equipment:['gym']}, {name:'Odwodzenie bioder na maszynie',group:'legs',category:'Nogi i pośladki',places:G,equipment:['gym']},
  // Brzuch i core
  {name:'Dead bug — naprzemienne opuszczanie kończyn',group:'core',category:'Brzuch i core',places:HG}, {name:'Plank',group:'core',category:'Brzuch i core',places:HG}, {name:'Plank boczny',group:'core',category:'Brzuch i core',places:HG}, {name:'Hollow body hold',group:'core',category:'Brzuch i core',places:H}, {name:'Unoszenie kolan w zwisie',group:'core',category:'Brzuch i core',places:H,equipment:['pullup_bar']}, {name:'Mountain climbers',group:'core',category:'Brzuch i core',places:H}, {name:'Spięcia brzucha kontrolowane',group:'core',category:'Brzuch i core',places:HG}, {name:'Reverse crunch',group:'core',category:'Brzuch i core',places:HG}, {name:'Russian twist z hantlem',group:'core',category:'Brzuch i core',places:H,equipment:['dumbbells']}, {name:'Pallof press z gumą',group:'core',category:'Brzuch i core',places:H,equipment:['bands']}, {name:'Woodchopper z gumą',group:'core',category:'Brzuch i core',places:H,equipment:['bands']}, {name:'Ab wheel rollout',group:'core',category:'Brzuch i core',places:H,equipment:['dumbbells']}, {name:'Unoszenie nóg w podporze',group:'core',category:'Brzuch i core',places:G,equipment:['gym']},
  // Kondycja / mobilność
  {name:'Marsz w miejscu z energiczną pracą ramion',group:'conditioning',category:'Kondycja',places:H}, {name:'Pajacyki',group:'conditioning',category:'Kondycja',places:H}, {name:'Burpees',group:'conditioning',category:'Kondycja',places:H}, {name:'Mountain climbers w interwałach',group:'conditioning',category:'Kondycja',places:H}, {name:'Przeskoki łyżwiarskie',group:'conditioning',category:'Kondycja',places:H}, {name:'Skakanka',group:'conditioning',category:'Kondycja',places:HG}, {name:'Marsz na bieżni lub rower stacjonarny',group:'conditioning',category:'Kondycja',places:G,equipment:['gym']}, {name:'Koci grzbiet',group:'mobility',category:'Mobilność i regeneracja',places:HG}, {name:'Rotacje odcinka piersiowego',group:'mobility',category:'Mobilność i regeneracja',places:HG}, {name:'Mobilizacja bioder',group:'mobility',category:'Mobilność i regeneracja',places:HG}, {name:'Rozciąganie zginaczy biodra',group:'mobility',category:'Mobilność i regeneracja',places:HG}, {name:'Przysiad głęboki z podparciem',group:'mobility',category:'Mobilność i regeneracja',places:HG},
];

const GROUP_LABELS: Record<ExerciseGroup, string> = { push: 'Klatka / barki / triceps', pull: 'Plecy / biceps', legs: 'Nogi i pośladki', core: 'Brzuch i core', conditioning: 'Kondycja', mobility: 'Mobilność i regeneracja' };
function norm(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL').replace(/[^a-z0-9]+/g, ' ').trim(); }
function equipmentMatches(item: Exercise, selection: TrainingEquipment | TrainingEquipment[]): boolean {
  const selected = Array.isArray(selection) ? selection : [selection];
  if (!item.equipment?.length) return true;
  if (selected.includes('gym')) return item.places.includes('gym');
  if (selected.includes('both')) return item.equipment.some(e => ['bands','dumbbells'].includes(e));
  return item.equipment.every(e => selected.includes(e));
}
function available(place: TrainingPlace, equipment: TrainingEquipment | TrainingEquipment[]): Exercise[] {
  return CATALOG.filter(item => item.places.includes(place) && equipmentMatches(item, equipment));
}
export function exerciseCatalogGroups(place: TrainingPlace, equipment?: TrainingEquipment | TrainingEquipment[]): Array<{ category: ExerciseCategory; exercises: string[] }> {
  const order: ExerciseCategory[] = ['Klatka piersiowa','Barki','Triceps','Plecy','Biceps','Nogi i pośladki','Brzuch i core','Kondycja','Mobilność i regeneracja'];
  const source = equipment === undefined ? CATALOG.filter(item => item.places.includes(place)) : available(place, equipment);
  return order.map(category => ({ category, exercises: Array.from(new Set(source.filter(item => (item.category || 'Nogi i pośladki') === category).map(item => item.name))).sort((a,b)=>a.localeCompare(b,'pl')) })).filter(item => item.exercises.length > 0);
}
export function exerciseCatalogNames(place: TrainingPlace, equipment: TrainingEquipment | TrainingEquipment[]): string[] {
  return available(place, equipment).map(item => item.name);
}

export function exerciseCatalogReplacementOptions(
  name: string,
  place: TrainingPlace,
  equipment: TrainingEquipment | TrainingEquipment[],
): { category: ExerciseCategory | null; exercises: string[] } {
  const cleanName = norm(name);
  const library = available(place, equipment);
  const current = library.find(item => norm(item.name) === cleanName) || CATALOG.find(item => norm(item.name) === cleanName && item.places.includes(place));
  const category = current?.category || null;
  const group = current?.group || inferGroup(name);
  const matches = category
    ? library.filter(item => item.category === category)
    : library.filter(item => group && item.group === group);
  const exercises = Array.from(new Set(matches.map(item => item.name)))
    .filter(item => norm(item) !== cleanName)
    .sort((a, b) => a.localeCompare(b, 'pl'));
  return { category, exercises };
}
function inferGroup(name: string): ExerciseGroup | null {
  const value = norm(name);
  if (/przysiad|wykrok|most biodrowy|poslad|wypychan|martwy ciag|wspieci|hip thrust|uginanie nog/.test(value)) return 'legs';
  if (/plank|dead bug|spiecia brzucha|pallof|brzuch|core|hollow|reverse crunch|unoszenie kolan|russian twist|ab wheel/.test(value)) return 'core';
  if (/marsz|biezn|rower|mountain climber|kondyc|skakank|pajacyk|burpee|przeskoki/.test(value)) return 'conditioning';
  if (/mobiliz|koci grzbiet|rotacj|rozciag|stretch|rozluznian/.test(value)) return 'mobility';
  if (/wioslow|sciagan|podciag|przyciag|uginan.*ramion|biceps|face pull|superman|t w|martwy ciag|odwrotne rozpietki/.test(value)) return 'pull';
  if (/wycisk|pomp|pchani|unoszen|wznos|prostow|rozpiet|dipy|pike|arnold press|francuskie/.test(value)) return 'push';
  return null;
}
export function replaceExercisesFromCatalog(request: {
  location: TrainingPlace;
  equipment: TrainingEquipment | TrainingEquipment[];
  exercises: Array<{ key: string; day_title: string; name: string; sets: number; reps: number; notes: string; preferred_name?: string; other_names: string[] }>;
}): { replacements: Array<{ key: string; name: string }> } {
  const library = available(request.location, request.location === 'gym' ? 'gym' : request.equipment);
  const namesChosenByDay = new Map<string, Set<string>>();
  const replacements = request.exercises.map((item, index) => {
    const current = CATALOG.find(ex => ex.places.includes(request.location) && norm(ex.name) === norm(item.name)) || CATALOG.find(ex => norm(ex.name) === norm(item.name));
    const avoid = new Set((item.other_names || []).map(norm)); avoid.add(norm(item.name));
    const group = current?.group || inferGroup(item.name);
    const dayKey = norm(item.day_title || 'trening');
    const alreadyChosen = namesChosenByDay.get(dayKey) || new Set<string>();
    const category = current?.category;
    const sameGroup = group ? library.filter(ex => (category ? ex.category === category : ex.group === group) && !avoid.has(norm(ex.name)) && !alreadyChosen.has(norm(ex.name))) : [];
    const preferredName = item.preferred_name?.trim() || '';
    const preferred = preferredName ? sameGroup.find(ex => norm(ex.name) === norm(preferredName)) : undefined;
    if (!group) throw new Error(`Nie udało się określić rodzaju ćwiczenia „${item.name}”. Wybierz je ręcznie w edytorze, a potem spróbuj wymiany ponownie.`);
    if (preferredName && !preferred) throw new Error(`Nie znaleziono „${preferredName}” w katalogu dla tej partii i wyposażenia albo ta nazwa dubluje inne ćwiczenie w tym dniu.`);
    if (!sameGroup.length) throw new Error(`Nie ma innego ćwiczenia tej samej kategorii, które pasuje do wybranego miejsca i sprzętu. Wymień mniej pozycji albo zmień sprzęt.`);
    const chosen = preferred || sameGroup[(index + alreadyChosen.size) % sameGroup.length];
    alreadyChosen.add(norm(chosen.name)); namesChosenByDay.set(dayKey, alreadyChosen);
    return { key: item.key, name: chosen.name };
  });
  return { replacements };
}
