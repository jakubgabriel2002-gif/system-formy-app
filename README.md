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

- Zalogowany użytkownik może zapisywać plany zawierające do 14 dni; poszczególny dzień może zawierać ćwiczenia, liczbę serii, powtórzeń, ciężar i ustawienia przerw.
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

- **Generator planu przez System Formy**: planowany wywiad o celu, doświadczeniu, miejscu i sprzęcie użytkownika, a następnie wybór zatwierdzonych ćwiczeń i przygotowanie planu. Planowana cena: 29,99 zł; dla aktywnego Premium bez dodatkowej opłaty. Formularz i generowanie nie są jeszcze podłączone do logiki płatności ani generatora — obecny interfejs oznacza tę funkcję jako „Wkrótce”.
- **Subskrypcje Premium**: brak dedykowanego systemu cyklicznych płatności i lifecycle abonamentu. Obecny limit 3 planów wymaga istniejącego aktywnego entitlement z tekstem `premium` w kluczu lub tytule.
- Dalsze szlify wizualne i testy end-to-end po każdym wdrożeniu.

## Przydatne ścieżki

- `src/AppV2.tsx` — główna aplikacja i kreator planów.
- `src/components/training/TrainingRoute.tsx` — wybór planu, start/wznowienie sesji i zapis.
- `src/components/training/WorkoutSession.tsx` — rejestracja serii, przerwy i historia wykonania.
- `src/components/training/WorkoutSummary.tsx` — podsumowanie ukończonego treningu.
- `src/components/training/workout.css` oraz `workout-fix-extra.css` — stylowanie treningu.
- `worker/v2.ts` — API planów, sesji, draftu, sklepu i panelu administracyjnego.

## Testy

Przed publikacją uruchom `npm run typecheck` i `npm run build`, a następnie ręcznie sprawdź m.in. profil niekompletny, dodawanie przykładowego planu, limity zwykłego/Premium konta, plan wielodniowy, zmianę ciężaru w serii, przedłużanie przerw i zapis podsumowania.

### Interaktywny kreator planu — aktualizacja 2026-10-24

- Utworzenie własnego planu zaczyna się od nazwy, opcjonalnego opisu i liczby dni treningowych (1–14). Wybrana struktura dni jest zapisywana od razu, więc można wrócić do edycji po odświeżeniu strony.
- Kreator używa zakładek dni zamiast długiej listy wszystkich dni. W każdej zakładce można zmienić nazwę dnia, dodawać i usuwać ćwiczenia oraz zmieniać ich kolejność przyciskami góra/dół (wygodne na telefonie).
- Karta ćwiczenia ma osobne pola serii, powtórzeń oraz opcjonalnego ciężaru. Zaawansowane ustawienia zawierają przerwę między seriami, przerwę między ćwiczeniami i opcjonalną wskazówkę techniczną.
- Podgląd przed zapisem zbiera dni, ćwiczenia, serie, ciężary i przerwy; z podglądu można wrócić do edycji wybranego dnia.
- Zapis weryfikuje kompletność danych po stronie interfejsu, a API nadal waliduje strukturę dni i ćwiczeń. Limity maksymalne API: 14 dni na plan, 40 ćwiczeń na dzień, 30 serii na ćwiczenie, 200 powtórzeń i zakresy przerw określone w `worker/v2.ts`.
- Nowy komponent kreatora: `src/components/PlanBuilder.tsx`. Style są dopisane w `src/v2.css`.
- Utworzenie planu zapisuje początkowy układ dni zanim otworzy się edytor. Same zmiany ćwiczeń zapisuje użytkownik przyciskiem „Zapisz plan i wszystkie dni”; nie ma automatycznego zapisu po każdej zmianie pola. Jeśli zapis struktury dni się nie powiedzie, aplikacja podejmuje próbę usunięcia nowo utworzonego rekordu, aby nie zajmował limitu planów.

### Weryfikacja tej aktualizacji

- Parser/transpilacja TypeScript/TSX: 13 plików bez błędów składni. Nowy `PlanBuilder.tsx` przeszedł dodatkowe sprawdzenie typów na minimalnych deklaracjach React; nie jest to zamiennik pełnego sprawdzenia z rzeczywistymi zależnościami projektu.
- Pełny `npm run typecheck` i build produkcyjny nie zostały potwierdzone w środowisku przygotowawczym, ponieważ instalacja zależności (`npm ci`) przekroczyła limit czasu i katalog `node_modules` pozostał niekompletny. Przed wdrożeniem sprawdź kontrolę builda w swoim pipeline.
