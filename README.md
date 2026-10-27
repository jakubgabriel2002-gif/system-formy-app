# System Formy

Aplikacja fitness oparta na React, TypeScript i Vite, z API w Cloudflare Workers, bazą Cloudflare D1 oraz plikami produktów w R2.

## Uruchomienie i build

Wymagany Node.js 22 lub nowszy.

```bash
npm ci
npm run dev
npm run typecheck
npm run build
```

Wdrożenie backendu (po zalogowaniu do Cloudflare i sprawdzeniu konfiguracji sekretów):

```bash
npm run deploy
```

## Struktura projektu

- `src/main.tsx` — punkt wejścia frontendu; ładuje `AppV2` i style aplikacji.
- `src/AppV2.tsx` — routing, logowanie, panel klienta, ACP i integracja z API.
- `src/components/HomeHeroPreview.tsx` — wydzielony podgląd aplikacji używany na publicznej stronie głównej.
- `src/components/` — kreatory planów, formularz planu indywidualnego i moduły aktywnej sesji treningowej.
- `src/v2.css`, `src/v2-client-refresh.css` — bazowy system wizualny i późniejsze poprawki responsywności/animacji.
- `worker/index.ts` — główny entrypoint Workera, sesje i bazowe API.
- `worker/platform.ts` — obsługa platformy, checkoutu i webhooka płatności.
- `worker/v2.ts` — API planów, postępów, zamówień, powiadomień, wyzwań oraz ACP.
- `wrangler.jsonc` — konfiguracja Cloudflare Worker, D1 i R2.
- `public/manifest.webmanifest` i ikony PWA — instalacja na urządzeniu i wygląd aplikacji.

## Konfiguracja produkcyjna

Worker używa bindingu D1 `DB` i opcjonalnego bindingu R2 `PRODUCT_FILES`. Sekrety (m.in. `AUTH_PASSWORD_PEPPER`, klucze Stripe i sekret webhooka) ustawiaj w Cloudflare jako sekrety, nie zapisuj ich w repozytorium.

W części endpointów tabela lub indeks jest tworzony idempotentnie przez Worker. Nie oznacza to, że wolno usuwać istniejące tabele: zawierają dane kont, zamówień, uprawnień, treningów, planów i powiadomień.

## Zasady przed publikacją

1. Uruchom `npm run typecheck` i `npm run build` w CI.
2. Przetestuj rejestrację/logowanie, zakup i webhook, przypisanie dostępu, zapis treningu, status planu indywidualnego, powiadomienia na dwóch kontach oraz dołączenie i ukończenie wyzwania.
3. Przetestuj widoki na wąskim ekranie i w trybie „ogranicz ruch” systemu.
4. Uzupełnij i zweryfikuj treści regulaminu oraz polityki prywatności przed sprzedażą publiczną.

Szczegółowe decyzje dotyczące porządków, wydajności oraz bezpiecznego czyszczenia repozytorium opisuje `docs/OPTYMALIZACJA_I_PORZADKI.md`.
