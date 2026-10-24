export type TrainingPlace = 'home' | 'gym';
export type TrainingEquipment = 'none' | 'bands' | 'dumbbells' | 'both' | 'gym';
type Group = 'legs' | 'push' | 'pull' | 'core' | 'conditioning' | 'mobility';
type Exercise = { name: string; group: Group; places: TrainingPlace[]; equipment?: TrainingEquipment[] };

/**
 * Zamknięty katalog nazw. Generator i wymiana ćwiczeń korzystają z niego lokalnie,
 * Dobór ćwiczeń odbywa się lokalnie na podstawie tego katalogu.
 */
const CATALOG: Exercise[] = [
  {name:'Przysiady z masą ciała',group:'legs',places:['home']},
  {name:'Wykroki w tył',group:'legs',places:['home']},
  {name:'Most biodrowy',group:'legs',places:['home']},
  {name:'Wspięcia na palce',group:'legs',places:['home','gym']},
  {name:'Przysiad goblet z hantlem',group:'legs',places:['home'],equipment:['dumbbells','both']},
  {name:'Martwy ciąg rumuński z hantlami',group:'legs',places:['home','gym'],equipment:['dumbbells','both','gym']},
  {name:'Chodzenie bokiem z minibandem',group:'legs',places:['home'],equipment:['bands','both']},
  {name:'Przysiad na suwnicy',group:'legs',places:['gym'],equipment:['gym']},
  {name:'Wypychanie na suwnicy',group:'legs',places:['gym'],equipment:['gym']},
  {name:'Uginanie nóg na maszynie',group:'legs',places:['gym'],equipment:['gym']},
  {name:'Hip thrust',group:'legs',places:['home','gym'],equipment:['dumbbells','both','gym']},
  {name:'Pompki w wariancie dostosowanym',group:'push',places:['home']},
  {name:'Pompki przy ścianie lub blacie',group:'push',places:['home']},
  {name:'Pompki na kolanach',group:'push',places:['home']},
  {name:'Wyciskanie na maszynie',group:'push',places:['gym'],equipment:['gym']},
  {name:'Wyciskanie hantli nad głowę',group:'push',places:['home','gym'],equipment:['dumbbells','both','gym']},
  {name:'Wyciskanie hantli na podłodze',group:'push',places:['home'],equipment:['dumbbells','both']},
  {name:'Wyciskanie na ławce',group:'push',places:['gym'],equipment:['gym']},
  {name:'Wyciskanie hantli na skosie dodatnim',group:'push',places:['gym'],equipment:['gym']},
  {name:'Unoszenie hantli bokiem',group:'push',places:['gym'],equipment:['gym']},
  {name:'Prostowanie ramion na wyciągu',group:'push',places:['gym'],equipment:['gym']},
  {name:'Wiosłowanie gumą oporową',group:'pull',places:['home'],equipment:['bands','both']},
  {name:'Rozciąganie gumy przed klatką',group:'pull',places:['home'],equipment:['bands','both']},
  {name:'Superman — unoszenie tułowia',group:'pull',places:['home']},
  {name:'Y-T-W w leżeniu na brzuchu',group:'pull',places:['home']},
  {name:'Wiosłowanie hantlem jednorącz',group:'pull',places:['home','gym'],equipment:['dumbbells','both','gym']},
  {name:'Ściąganie drążka wyciągu górnego',group:'pull',places:['gym'],equipment:['gym']},
  {name:'Wiosłowanie siedząc na wyciągu',group:'pull',places:['gym'],equipment:['gym']},
  {name:'Wiosłowanie z podparciem klatki',group:'pull',places:['gym'],equipment:['gym']},
  {name:'Face pull',group:'pull',places:['gym'],equipment:['gym']},
  {name:'Uginanie ramion z hantlami',group:'pull',places:['gym'],equipment:['gym']},
  {name:'Dead bug — naprzemienne opuszczanie kończyn',group:'core',places:['home','gym']},
  {name:'Plank',group:'core',places:['home','gym']},
  {name:'Pallof press z gumą',group:'core',places:['home'],equipment:['bands','both']},
  {name:'Spięcia brzucha kontrolowane',group:'core',places:['home','gym']},
  {name:'Marsz w miejscu z energiczną pracą ramion',group:'conditioning',places:['home']},
  {name:'Mountain climbers w spokojnym tempie',group:'conditioning',places:['home']},
  {name:'Marsz na bieżni lub rower stacjonarny',group:'conditioning',places:['gym'],equipment:['gym']},
  {name:'Mobilizacja bioder',group:'mobility',places:['home','gym']},
  {name:'Koci grzbiet',group:'mobility',places:['home','gym']},
  {name:'Rotacje odcinka piersiowego',group:'mobility',places:['home','gym']},
];

function available(place: TrainingPlace, equipment: TrainingEquipment): Exercise[] {
  return CATALOG.filter(item => item.places.includes(place) && (!item.equipment || item.equipment.includes(equipment)));
}
function norm(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL').replace(/[^a-z0-9]+/g, ' ').trim(); }
function inferGroup(name: string): Group | null {
  const value = norm(name);
  if (/wycisk|pomp|pchani|unoszen|unoszenie|wznos|prostow|rozpiet|rozpietk/.test(value)) return 'push';
  if (/wioslow|sciagan|przyciag|uginan.*ramion|biceps|face pull|superman|t w|rozciaganie gumy/.test(value)) return 'pull';
  if (/przysiad|wykrok|most biodrowy|poslad|wypychan|martwy ciag|wspieci|hip thrust|uginanie nog/.test(value)) return 'legs';
  if (/plank|dead bug|spiecia brzucha|pallof|brzuch|core/.test(value)) return 'core';
  if (/marsz|biezn|rower|mountain climber|kondyc|skakank/.test(value)) return 'conditioning';
  if (/mobiliz|koci grzbiet|rotacj|rozciag|stretch|rozluznian/.test(value)) return 'mobility';
  return null;
}

export function exerciseCatalogNames(place: TrainingPlace, equipment: TrainingEquipment): string[] {
  return available(place, equipment).map(item => item.name);
}

export function replaceExercisesFromCatalog(request: {
  location: TrainingPlace;
  equipment: TrainingEquipment;
  exercises: Array<{ key: string; day_title: string; name: string; sets: number; reps: number; notes: string; preferred_name?: string; other_names: string[] }>;
}): { replacements: Array<{ key: string; name: string }> } {
  const library = available(request.location, request.location === 'gym' ? 'gym' : request.equipment);
  const namesChosenByDay = new Map<string, Set<string>>();
  const replacements = request.exercises.map((item, index) => {
    const current = library.find(ex => norm(ex.name) === norm(item.name)) || CATALOG.find(ex => norm(ex.name) === norm(item.name));
    const avoid = new Set((item.other_names || []).map(norm));
    avoid.add(norm(item.name));
    const group = current?.group || inferGroup(item.name);
    const dayKey = norm(item.day_title || 'trening');
    const alreadyChosen = namesChosenByDay.get(dayKey) || new Set<string>();
    const sameGroup = group ? library.filter(ex => ex.group === group && !avoid.has(norm(ex.name)) && !alreadyChosen.has(norm(ex.name))) : [];
    const preferredName = item.preferred_name?.trim() || '';
    const preferred = preferredName ? sameGroup.find(ex => norm(ex.name) === norm(preferredName)) : undefined;
    if (!group) throw new Error(`Nie udało się określić rodzaju ćwiczenia „${item.name}”. Wybierz je ręcznie w edytorze, a potem spróbuj wymiany ponownie.`);
    if (preferredName && !preferred) throw new Error(`Nie znaleziono „${preferredName}” w katalogu dla tej partii i wyposażenia albo ta nazwa dubluje inne ćwiczenie w tym dniu. Wpisz dokładną nazwę z biblioteki albo usuń własną nazwę, aby dobrać automatyczny zamiennik.`);
    const candidates = sameGroup;
    if (!candidates.length) throw new Error(`Nie ma innego ćwiczenia tej samej grupy, które pasuje do wybranego sprzętu i nie dubluje pozostałych ćwiczeń w tym dniu. Wymień mniej pozycji naraz albo zmień sprzęt.`);
    const chosen = preferred || candidates[(index + alreadyChosen.size) % candidates.length];
    alreadyChosen.add(norm(chosen.name));
    namesChosenByDay.set(dayKey, alreadyChosen);
    return { key: item.key, name: chosen.name };
  });
  return { replacements };
}
