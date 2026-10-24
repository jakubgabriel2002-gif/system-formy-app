# System Formy

Aplikacja fitness rozwijana w React, TypeScript i Vite, z API w Cloudflare Worker oraz bazą Cloudflare D1.

## Technologie i wdrożenie

- Frontend: React + TypeScript + Vite (`src/`).
- Backend API: Cloudflare Worker (`worker/index.ts`, `worker/v2.ts`, `worker/platform.ts`).
- Baza: Cloudflare D1, binding `DB`, baza `system-formy-db`.
- Pliki cyfrowe: Cloudflare R2, binding `PRODUCT_FILES`.
- Konfiguracja wdrożenia: `wrangler.jsonc`.

## Uruchamianie lokalne

Wymagany Node.js 22 lub nowszy.

```bash
npm install
npm run dev
```

Sprawdzenie typów i budowanie produkcyjne:

```bash
npm run typecheck
npm run build
```

Wdrożenie Workera (w środowisku z poprawnie skonfigurowanym Cloudflare):

```bash
npm run deploy
```

## Aktualny stan funkcji

### Konto i profil

- Rejestracja, logowanie, sesje i zmiana hasła są obsługiwane przez API.
- Profil przechowuje imię, cel, miejsce treningu, liczbę treningów w tygodniu oraz opcjonalną wagę i wzrost.
- Tworzenie własnego planu wymaga uzupełnienia imienia, celu, miejsca treningu i liczby treningów tygodniowo. Ograniczenie sprawdza frontend i API.
- Treningi przykładowe dom/siłownia można dodać bez kompletnego profilu.

### Plany treningowe

- Zalogowany użytkownik może zapisywać plany zawierające od 1 do 7 dni; limit jest egzekwowany w interfejsie i API. Poszczególny dzień może zawierać ćwiczenia, liczbę serii, powtórzeń, ciężar i ustawienia przerw.
- Limit zapisanych planów jest weryfikowany po stronie API: zwykłe konto — 1 plan, konto z aktywnym uprawnieniem, którego klucz lub tytuł zawiera `premium` — 3 plany.
- Dwa plany przykładowe (dom bez sprzętu i siłownia) są dostępne bez uzupełniania profilu i nie zużywają limitu własnych planów. W centrum treningowym są także wirtualne przykłady, które można uruchomić bez zapisywania ich na koncie.
- Przerwa między seriami ma domyślnie 90 sekund, a między ćwiczeniami 120 sekund. Obie wartości można zmienić dla każdego ćwiczenia.
- Mechanizm rozpoznawania Premium korzysta z istniejących wpisów `user_entitlements`. Projekt nie zawiera jeszcze osobnego systemu abonamentów ani automatycznego nadawania Premium za subskrypcję.

### Aktywna sesja treningowa

- Wybór dnia planu uruchamia sesję i zapis roboczy.
- Nazwa treningu oraz data są ustawiane automatycznie na podstawie wybranego planu/dnia i aktualnej daty; nie są edytowane w trakcie sesji.
- Użytkownik wpisuje rzeczywistą liczbę powtórzeń i może poprawić ciężar zaimportowany z planu.
- Po zapisaniu serii uruchamia się odpowiednia przerwa. Można ją wydłużyć o 30, 60 lub 90 sekund albo pominąć.
- Zapisane serie są pokazywane jako nieaktywna, przygaszona historia. Na koniec sesja zapisuje wyniki i pokazuje podsumowanie.
- Przycisk „Zakończ później” zapisuje roboczą sesję, wraca do centrum treningowego i pozwala ją wznowić. Zapis roboczy jest przechowywany przez API w tabeli `training_session_drafts`.

### Sklep i materiały

- Katalog produktów, zamówienia, uprawnienia do materiałów, kody rabatowe i integracja checkoutu Stripe są obecne w repozytorium.
- Działanie płatności w danym środowisku zależy od konfiguracji sekretów Stripe i webhooka Cloudflare.
- Dostęp Premium rozpoznawany na podstawie istniejącego entitlement nie jest tym samym co system cyklicznej subskrypcji.

## Planowane, ale jeszcze niewdrożone

- **Właściwe generowanie przez model AI**: interaktywny prototyp kreatora jest już dostępny pod `/app/plan/ai`. Obecnie układa propozycję lokalnie z katalogu ćwiczeń na podstawie celu, poziomu, miejsca, dostępnego sprzętu, liczby dni (1–7), czasu treningu i priorytetu. Nie jest jeszcze podłączony zewnętrzny model AI ani logika płatności. Planowana cena pełnej funkcji: 29,99 zł; dla aktywnego Premium bez dodatkowej opłaty — do decyzji przed uruchomieniem produkcyjnym.
- **Subskrypcje Premium**: brak dedykowanego systemu cyklicznych płatności i lifecycle abonamentu. Obecny limit 3 planów wymaga istniejącego aktywnego entitlement z tekstem `premium` w kluczu lub tytule.
- Dalsze szlify wizualne i testy end-to-end po każdym wdrożeniu.

## Przydatne ścieżki

- `src/AppV2.tsx` — główna aplikacja, nawigacja i zapis planów.
- `src/components/PlanGenerator.tsx` — interaktywny prototyp generatora planów na podstawie preferencji.
- `src/components/training/TrainingRoute.tsx` — wybór planu, start/wznowienie sesji i zapis.
- `src/components/training/WorkoutSession.tsx` — rejestracja serii, przerwy i historia wykonania.
- `src/components/training/WorkoutSummary.tsx` — podsumowanie ukończonego treningu.
- `src/components/training/workout.css` oraz `workout-fix-extra.css` — stylowanie treningu.
- `worker/v2.ts` — API planów, sesji, draftu, sklepu i panelu administracyjnego.

## Testy

Przed publikacją uruchom `npm run typecheck` i `npm run build`, a następnie ręcznie sprawdź m.in. profil niekompletny, dodawanie przykładowego planu, limity zwykłego/Premium konta, plan wielodniowy, zmianę ciężaru w serii, przedłużanie przerw i zapis podsumowania.

### Interaktywny kreator planu — aktualizacja 2026-10-24

- Utworzenie własnego planu zaczyna się od nazwy, opcjonalnego opisu i liczby dni treningowych (1–7). Wybrana struktura dni jest zapisywana od razu, więc można wrócić do edycji po odświeżeniu strony.
- Kreator używa zakładek dni zamiast długiej listy wszystkich dni. W każdej zakładce można zmienić nazwę dnia, dodawać i usuwać ćwiczenia oraz zmieniać ich kolejność przyciskami góra/dół (wygodne na telefonie).
- Karta ćwiczenia ma osobne pola serii, powtórzeń oraz opcjonalnego ciężaru. Zaawansowane ustawienia zawierają przerwę między seriami, przerwę między ćwiczeniami i opcjonalną wskazówkę techniczną.
- Podgląd przed zapisem zbiera dni, ćwiczenia, serie, ciężary i przerwy; z podglądu można wrócić do edycji wybranego dnia.
- Zapis weryfikuje kompletność danych po stronie interfejsu i API. Limity API: 7 dni na plan, 40 ćwiczeń na dzień, 30 serii na ćwiczenie, 200 powtórzeń i zakresy przerw określone w `worker/v2.ts`.
- Nowy komponent kreatora: `src/components/PlanBuilder.tsx`. Style są dopisane w `src/v2.css`.
- Utworzenie planu zapisuje początkowy układ dni zanim otworzy się edytor. Same zmiany ćwiczeń zapisuje użytkownik przyciskiem „Zapisz plan i wszystkie dni”; nie ma automatycznego zapisu po każdej zmianie pola. Jeśli zapis struktury dni się nie powiedzie, aplikacja podejmuje próbę usunięcia nowo utworzonego rekordu, aby nie zajmował limitu planów.

### Weryfikacja tej aktualizacji

- Parser/transpilacja TypeScript/TSX: 13 plików bez błędów składni. Nowy `PlanBuilder.tsx` przeszedł dodatkowe sprawdzenie typów na minimalnych deklaracjach React; nie jest to zamiennik pełnego sprawdzenia z rzeczywistymi zależnościami projektu.
- Pełny `npm run typecheck` i build produkcyjny nie zostały potwierdzone w środowisku przygotowawczym, ponieważ instalacja zależności (`npm ci`) przekroczyła limit czasu i katalog `node_modules` pozostał niekompletny. Przed wdrożeniem sprawdź kontrolę builda w swoim pipeline.

### Generator planu — prototyp 2026-10-24

- Strona planów nie pokazuje już wstępnego nagłówka „Zaplanuj swój trening.” ani jego długiego opisu.
- Osobny kreator ma trzy kroki: cel i poziom, warunki treningu, a następnie podgląd proponowanego planu.
- Użytkownik wybiera trening domowy lub siłowniany, sprzęt domowy (jeśli dotyczy), 1–7 dni, czas treningu i priorytet. Cel i poziom zmieniają dobór ćwiczeń, serii, powtórzeń i przerw. Siódmy dzień jest zaplanowany jako lżejsza mobilność/regeneracja.
- Zapis tworzy plan poprzez istniejące API i otwiera standardowy edytor, w którym można zmienić ćwiczenia i parametry. Nie jest potrzebna migracja SQL.
- Ważne: to działający prototyp regułowy, nie integracja z modelem AI. Właściwa integracja AI wymaga osobnego kroku projektowego i decyzji o dostawcy, kluczu API, kosztach oraz obsłudze błędów.
- Podczas przygotowania sprawdzono parser TSX dla zmienionych komponentów. Pełny build nie został potwierdzony, ponieważ instalacja zależności `npm ci` przekroczyła limit czasu w środowisku roboczym; przed wdrożeniem należy sprawdzić wynik builda w GitHub/Cloudflare.

## Program treningowy na 4 tygodnie

Plan treningowy jest zapisywany jako tygodniowy schemat od 1 do 7 jednostek, z metadanymi `duration_weeks` (4), `start_date` oraz `progression_strategy` (`reps`, `weight`, `sets` lub `none`). Aplikacja wylicza parametry dla aktualnego tygodnia przy uruchomieniu treningu. Nie przechowujemy 28 duplikatów tygodniowych jednostek, co upraszcza edycję i ogranicza koszt generacji AI.

Przed wdrożeniem uruchom w Cloudflare D1 diagnostykę `sql/SQL-00-SPRAWDZENIE-SCHEMATU.sql`, a następnie według instrukcji wybierz ewentualną bazową migrację AI i uruchom `sql/SQL-02-PLANY-MIESIECZNE.sql`. Pełna instrukcja wdrożenia znajduje się w `INSTRUKCJA-WDROZENIA-PLANOW-MIESIECZNYCH.txt`.
