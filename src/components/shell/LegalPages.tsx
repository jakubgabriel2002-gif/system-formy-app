type LegalPageKind = 'terms' | 'privacy';

type Props = {
  kind: LegalPageKind;
  supportEmail?: string;
};

const VERSION_DATE = '29 października 2026 r.';

function ContactDetails({ supportEmail }: { supportEmail: string }) {
  return (
    <section className="sf-legal-section">
      <h2>Dane usługodawcy i kontakt</h2>
      <div className="sf-legal-placeholder">
        <b>Uzupełnij te dane przed uruchomieniem sprzedaży.</b>
        <p>
          Usługodawca: <strong>[WSTAW IMIĘ I NAZWISKO LUB PEŁNĄ FIRMĘ]</strong><br />
          Adres: <strong>[WSTAW ADRES DO KONTAKTU / ADRES DZIAŁALNOŚCI]</strong><br />
          Forma działalności / rejestr: <strong>[WSTAW, JEŚLI DOTYCZY]</strong><br />
          NIP: <strong>[WSTAW, JEŚLI DOTYCZY]</strong><br />
          E-mail: <strong>{supportEmail || '[WSTAW ADRES E-MAIL DO OBSŁUGI KLIENTA]'}</strong><br />
          Telefon lub inny szybki kanał kontaktu: <strong>[WSTAW DANE, JEŚLI UDOSTĘPNIASZ]</strong>
        </p>
        <p>
          Dane muszą odpowiadać rzeczywistemu statusowi prawnemu sprzedawcy i informacjom podanym w Stripe.
          Nie publikuj dokumentu z nawiasami do uzupełnienia.
        </p>
      </div>
    </section>
  );
}

function TermsPage({ supportEmail }: { supportEmail: string }) {
  return (
    <>
      <div className="sf-legal-meta">Wersja z dnia {VERSION_DATE}</div>
      <div className="sf-legal-warning" role="note">
        <b>Przed publikacją uzupełnij dane usługodawcy.</b>
        <p>Ten projekt regulaminu opisuje funkcje widoczne w aktualnej wersji aplikacji. Wyróżnione pola wymagają danych właściciela i sprawdzenia zgodności z faktycznym sposobem prowadzenia sprzedaży.</p>
      </div>
      <ContactDetails supportEmail={supportEmail} />

      <section className="sf-legal-section">
        <h2>1. Postanowienia ogólne</h2>
        <p>Regulamin określa zasady korzystania z serwisu i aplikacji System Formy, zakładania kont, korzystania z funkcji treningowych, udziału w wyzwaniach oraz zakupu materiałów cyfrowych i członkostwa Premium.</p>
        <p>Regulamin jest udostępniany bezpłatnie przed zawarciem umowy. Korzystając z funkcji płatnych, użytkownik powinien zapoznać się z opisem produktu, ceną i warunkami wyświetlanymi przed złożeniem zamówienia.</p>
        <p>Postanowienia regulaminu nie ograniczają praw konsumenta wynikających z bezwzględnie obowiązujących przepisów prawa.</p>
      </section>

      <section className="sf-legal-section">
        <h2>2. Definicje</h2>
        <ul>
          <li><b>Serwis</b> — strona internetowa i aplikacja System Formy.</li>
          <li><b>Użytkownik</b> — osoba korzystająca z serwisu.</li>
          <li><b>Konto</b> — indywidualny profil użytkownika utworzony przy użyciu adresu e-mail i hasła.</li>
          <li><b>Materiały</b> — e-booki, poradniki, plany, pliki do pobrania oraz inne treści udostępniane w serwisie.</li>
          <li><b>Premium</b> — płatne członkostwo z dodatkowymi funkcjami, rozliczane w cyklu wybranym przez użytkownika.</li>
        </ul>
      </section>

      <section className="sf-legal-section">
        <h2>3. Konto i wymagania techniczne</h2>
        <p>Do korzystania z konta potrzebne są dostęp do internetu, aktualna przeglądarka obsługująca nowoczesne aplikacje internetowe oraz aktywny adres e-mail. Niektóre funkcje, w tym instalacja aplikacji PWA, zależą od możliwości urządzenia i przeglądarki.</p>
        <p>Użytkownik odpowiada za prawdziwość podanych danych, zachowanie poufności hasła i działania wykonywane na swoim koncie. Nie należy udostępniać innym osobom danych logowania.</p>
        <p>Zabronione jest korzystanie z serwisu w sposób bezprawny, zakłócający jego działanie, naruszający prawa innych osób lub próbujący uzyskać nieuprawniony dostęp do kont, danych czy materiałów.</p>
      </section>

      <section className="sf-legal-section">
        <h2>4. Funkcje serwisu</h2>
        <p>W zależności od stanu konta i zakupionych uprawnień serwis może udostępniać tworzenie i zapisywanie planów, rejestrowanie treningów, śledzenie postępów, udział w wyzwaniach, pobieranie materiałów, historię zamówień, zgłoszenia do pomocy oraz funkcje Premium.</p>
        <p>Dostęp do materiałów płatnych jest przypisywany do konta po potwierdzeniu płatności przez system. Samo przekierowanie na stronę po płatności nie stanowi potwierdzenia jej rozliczenia.</p>
        <p>Usługodawca może aktualizować funkcje i interfejs, o ile zmiana nie pozbawia użytkownika praw nabytych ani nie zmienia istotnie zakupionego świadczenia z naruszeniem obowiązujących przepisów.</p>
      </section>

      <section className="sf-legal-section">
        <h2>5. Produkty, ceny i płatności</h2>
        <p>Aktualna cena, opis, zakres, forma dostarczenia oraz ewentualny rabat są wskazywane przy produkcie i w podsumowaniu zamówienia przed rozpoczęciem płatności. Właściwa jest cena wyświetlona dla konkretnego zamówienia, z uwzględnieniem przyznanych rabatów.</p>
        <p>Płatności elektroniczne obsługuje Stripe. Dane płatnicze są przekazywane na stronę płatności operatora; System Formy otrzymuje informacje niezbędne do rozpoznania transakcji i przypisania zamówienia do konta.</p>
        <p>Jeżeli płatność nie zostanie potwierdzona, produkt może nie zostać odblokowany. W razie pobrania środków bez aktywowania dostępu skontaktuj się z pomocą, podając e-mail konta i dane transakcji — nigdy pełny numer karty ani kod CVC.</p>
      </section>

      <section className="sf-legal-section">
        <h2>6. Materiały cyfrowe i indywidualne plany</h2>
        <p>Materiały cyfrowe są udostępniane w formie i zakresie opisanym przy produkcie, na przykład przez pobranie pliku albo udostępnienie funkcji w aplikacji. Użytkownik powinien sprawdzić wymagania techniczne oraz kompatybilność pliku z własnym urządzeniem.</p>
        <p>Indywidualny plan jest przygotowywany na podstawie informacji przekazanych przez użytkownika. Termin realizacji, cena i zakres świadczenia wynikają z opisu aktualnej oferty oraz informacji pokazanych w trakcie zamówienia.</p>
        <p>Materiałów nie wolno rozpowszechniać, sprzedawać ani udostępniać publicznie bez zgody uprawnionego podmiotu, z zastrzeżeniem dozwolonego użytku wynikającego z przepisów prawa.</p>
      </section>

      <section className="sf-legal-section">
        <h2>7. Premium i płatności cykliczne</h2>
        <p>Jeśli przy zakupie Premium widnieje informacja o automatycznym odnowieniu, subskrypcja odnawia się na kolejny okres zgodnie z wybranym wariantem i ceną przedstawioną przed płatnością, aż do anulowania.</p>
        <p>Subskrypcją można zarządzać w udostępnionym portalu płatności Stripe, gdy opcja zarządzania jest aktywna dla danego konta. Anulowanie zatrzymuje kolejne odnowienia zgodnie z informacją pokazaną w portalu; nie uchyla praw ustawowych, w tym prawa do odstąpienia, gdy przysługuje.</p>
      </section>

      <section className="sf-legal-section">
        <h2>8. Odstąpienie od umowy i treści cyfrowe</h2>
        <p>Konsument, co do zasady, ma 14 dni na odstąpienie od umowy zawartej na odległość, chyba że zastosowanie ma ustawowy wyjątek. Szczegóły i wyjątki zależą od rodzaju świadczenia i okoliczności zawarcia umowy.</p>
        <p>W przypadku treści cyfrowych niedostarczanych na nośniku materialnym utrata prawa odstąpienia przed upływem terminu może nastąpić wyłącznie po spełnieniu wymagań ustawowych, w tym po uzyskaniu uprzedniej wyraźnej zgody na rozpoczęcie świadczenia przed upływem terminu oraz potwierdzenia przyjęcia do wiadomości skutku dla prawa odstąpienia. Sama płatność ani samo przekierowanie do materiału nie zastępują tych wymagań.</p>
        <p>Żądanie odstąpienia lub pytanie o zwrot wyślij na dane kontaktowe wskazane w regulaminie. Usługodawca rozpatrzy sprawę zgodnie z właściwymi przepisami i warunkami konkretnej umowy.</p>
      </section>

      <section className="sf-legal-section">
        <h2>9. Reklamacje i pomoc</h2>
        <p>Problem z kontem, płatnością, dostępem lub działaniem funkcji można zgłosić przez formularz w sekcji „Pomoc i kontakt” albo na adres e-mail wskazany w danych usługodawcy. W zgłoszeniu podaj temat, opis problemu i — jeśli dotyczy zakupu — numer zamówienia.</p>
        <p>Nie przesyłaj haseł, pełnych danych karty płatniczej ani innych danych, które nie są potrzebne do rozpatrzenia zgłoszenia. Reklamacje są rozpatrywane bez zbędnej zwłoki, z zachowaniem terminów wymaganych przez obowiązujące przepisy.</p>
        <p>Konsument może korzystać z pozasądowych sposobów rozwiązywania sporów, jeśli są dostępne dla danej sprawy, oraz z pomocy właściwych instytucji ochrony konsumentów.</p>
      </section>

      <section className="sf-legal-section">
        <h2>10. Charakter treningowy i ograniczenia</h2>
        <p>System Formy ma charakter treningowy i edukacyjny. Nie świadczy usług medycznych, nie diagnozuje chorób i nie zastępuje lekarza, fizjoterapeuty ani dietetyka. Materiały żywieniowe mają charakter ogólny i nie są dietą medyczną.</p>
        <p>Użytkownik powinien dostosować ćwiczenia do swoich możliwości i przerwać aktywność, jeżeli pojawią się niepokojące objawy. W przypadku chorób, kontuzji, przyjmowania leków lub wątpliwości dotyczących bezpieczeństwa należy skonsultować trening ze specjalistą.</p>
        <p>Nie gwarantuje się konkretnej zmiany sylwetki, liczby kilogramów, czasu uzyskania efektu ani wyniku sportowego. Rezultaty zależą m.in. od indywidualnej sytuacji i sposobu realizacji planu.</p>
      </section>

      <section className="sf-legal-section">
        <h2>11. Zmiany regulaminu i prawo właściwe</h2>
        <p>Zmiany regulaminu będą publikowane w serwisie z datą obowiązywania. Zmiana nie narusza praw nabytych i nie zmienia z mocą wsteczną warunków już zawartych umów, chyba że przepisy stanowią inaczej.</p>
        <p>Do umów stosuje się prawo polskie, z zachowaniem ochrony przyznanej konsumentowi na mocy bezwzględnie obowiązujących przepisów.</p>
      </section>

      <section className="sf-legal-section">
        <h2>Kontakt</h2>
        <p>Pomoc i zgłoszenia: <a href="/pomoc">Centrum pomocy</a>{supportEmail ? <> lub <a href={`mailto:${supportEmail}`}>{supportEmail}</a></> : null}.</p>
        <p>Polityka prywatności: <a href="/prywatnosc">zobacz dokument</a>.</p>
      </section>
    </>
  );
}

function PrivacyPage({ supportEmail }: { supportEmail: string }) {
  return (
    <>
      <div className="sf-legal-meta">Wersja z dnia {VERSION_DATE}</div>
      <div className="sf-legal-warning" role="note">
        <b>Przed publikacją uzupełnij dane administratora.</b>
        <p>Trzeba wpisać prawdziwe dane właściciela serwisu, ustalić faktyczne okresy przechowywania oraz sprawdzić umowy i ustawienia dostawców. Ankieta planu indywidualnego może obejmować dane dotyczące zdrowia.</p>
      </div>

      <section className="sf-legal-section">
        <h2>1. Administrator danych</h2>
        <div className="sf-legal-placeholder">
          <b>Administrator danych osobowych</b>
          <p>
            <strong>[WSTAW IMIĘ I NAZWISKO LUB PEŁNĄ FIRMĘ]</strong><br />
            Adres: <strong>[WSTAW ADRES DO KONTAKTU]</strong><br />
            E-mail: <strong>{supportEmail || '[WSTAW ADRES E-MAIL DO SPRAW DANYCH OSOBOWYCH]'}</strong><br />
            Inspektor ochrony danych: <strong>[JEŚLI ZOSTAŁ WYZNACZONY — PODAJ KONTAKT; W PRZECIWNYM RAZIE USUŃ TEN WIERSZ]</strong>
          </p>
        </div>
        <p>Ta polityka wyjaśnia, jakie dane są przetwarzane podczas korzystania z Systemu Formy, w jakich celach, komu mogą być przekazane oraz jakie prawa przysługują osobom, których dane dotyczą.</p>
      </section>

      <section className="sf-legal-section">
        <h2>2. Jakie dane przetwarzamy</h2>
        <ul>
          <li><b>Dane konta:</b> adres e-mail, identyfikator konta i informacje niezbędne do uwierzytelniania oraz ochrony sesji. Hasła nie powinny być przekazywane obsłudze.</li>
          <li><b>Dane profilu:</b> imię, cel treningowy, miejsce treningu, wzrost, masa ciała i preferowana częstotliwość treningów, jeśli użytkownik je poda.</li>
          <li><b>Dane treningowe:</b> plany, ćwiczenia, serie, powtórzenia, ciężary, ukończone sesje, cele, pomiary i postęp zapisany przez użytkownika.</li>
          <li><b>Dane o wyzwaniach:</b> udział, status i dni oznaczone jako ukończone.</li>
          <li><b>Dane zakupowe:</b> historia zamówień, produkty, kwoty, status płatności i identyfikatory transakcji. Dane karty obsługuje operator płatności.</li>
          <li><b>Dane pomocy:</b> e-mail i treść zgłoszenia oraz informacje potrzebne do obsługi problemu.</li>
          <li><b>Dane ankiety planu indywidualnego:</b> m.in. wiek, płeć, wzrost, masa ciała, cel, sprzęt, a także odpowiedzi o chorobach, kontuzjach, ograniczeniach ruchowych i lekach — w zakresie, w jakim użytkownik je poda.</li>
          <li><b>Dane techniczne i analityczne:</b> adres odwiedzanej ścieżki, typ zdarzenia, identyfikator produktu i klucz sesji analitycznej, jeśli użytkownik zaakceptował opcjonalną analitykę.</li>
        </ul>
      </section>

      <section className="sf-legal-section">
        <h2>3. Cele i podstawy prawne</h2>
        <ul>
          <li>utworzenie i obsługa konta, zapewnienie funkcji aplikacji oraz dostarczenie zakupionych produktów — wykonanie umowy lub działania przed jej zawarciem;</li>
          <li>obsługa zamówień, płatności, reklamacji i obowiązków księgowych lub prawnych — wykonanie umowy i obowiązek prawny;</li>
          <li>zapewnienie bezpieczeństwa serwisu, zapobieganie nadużyciom i ustalenie lub obrona roszczeń — prawnie uzasadniony interes administratora, w zakresie w jakim ma zastosowanie;</li>
          <li>opcjonalna analityka aktywności w sklepie — zgoda użytkownika, którą można wycofać przez zmianę decyzji w zakresie analityki, zgodnie z dostępnymi ustawieniami serwisu;</li>
          <li>dane dotyczące zdrowia lub ograniczeń przekazane w ankiecie — tylko w zakresie niezbędnym do realizacji zamówionego planu i na podstawie odpowiedniej, wyraźnej zgody, jeżeli jest wymagana. Nie podawaj danych, które nie są potrzebne do przygotowania planu.</li>
        </ul>
        <p>Wycofanie zgody nie wpływa na zgodność z prawem przetwarzania dokonanego przed jej wycofaniem. Jeśli dane są niezbędne do wykonania zamówienia lub wypełnienia obowiązku prawnego, samo wycofanie zgody nie usuwa automatycznie wszystkich danych, które muszą być dalej przechowywane na innej podstawie.</p>
      </section>

      <section className="sf-legal-section">
        <h2>4. Odbiorcy danych</h2>
        <p>Dane mogą być dostępne osobom upoważnionym przez administratora oraz dostawcom technologii niezbędnym do działania serwisu, w szczególności Cloudflare (obsługa aplikacji, bazy danych i przechowywanie plików) oraz Stripe (obsługa płatności i zarządzanie subskrypcją). Dane mogą być udostępnione także uprawnionym organom, jeżeli wynika to z prawa.</p>
        <p>Dostawcy przetwarzają dane w zakresie wynikającym z ich usług i właściwych umów. Przed publikacją administrator powinien sprawdzić aktualne umowy powierzenia, role dostawców oraz warunki ewentualnego transferu danych poza Europejski Obszar Gospodarczy.</p>
      </section>

      <section className="sf-legal-section">
        <h2>5. Okres przechowywania</h2>
        <p>Dane konta, profilu i aktywności są przechowywane tak długo, jak to konieczne do utrzymania konta i świadczenia funkcji, a następnie przez okres potrzebny do rozliczeń, ustalenia lub obrony roszczeń albo spełnienia obowiązków prawnych.</p>
        <p>Dane zamówień i dokumenty związane z rozliczeniami są przechowywane przez okres wymagany przepisami. Zgłoszenia pomocy przechowuje się przez czas potrzebny do ich obsługi i ewentualnego wykazania przebiegu sprawy. Dane o zdrowiu powinny być ograniczone do minimum i przechowywane wyłącznie przez okres uzasadniony celem, zgodą i obowiązkami prawnymi.</p>
        <p>Administrator powinien określić i wdrożyć rzeczywiste okresy retencji oraz zasady usuwania danych w systemach i kopiach zapasowych.</p>
      </section>

      <section className="sf-legal-section">
        <h2>6. Pliki cookies i pamięć urządzenia</h2>
        <p>Serwis wykorzystuje niezbędne mechanizmy sesji, aby zalogować użytkownika i utrzymać bezpieczeństwo konta. W przeglądarce mogą być zapisywane techniczne pliki cookies sesji oraz ustawienia pamięci, w tym decyzja dotycząca opcjonalnej analityki i tymczasowy identyfikator sesji analitycznej.</p>
        <p>Opcjonalna analityka jest uruchamiana po wybraniu „Akceptuję analitykę”. Wybór „Odrzuć” zapisuje odmowę i nie powinien uruchamiać tych zdarzeń. Serwis może korzystać także z mechanizmu Service Worker/PWA dla funkcji instalacji aplikacji.</p>
        <p>Usunięcie niezbędnych cookies lub zablokowanie pamięci przeglądarki może spowodować, że logowanie lub niektóre funkcje nie będą działały prawidłowo.</p>
      </section>

      <section className="sf-legal-section">
        <h2>7. Prawa użytkownika</h2>
        <p>W granicach i na zasadach określonych w przepisach użytkownik może żądać dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przeniesienia, wnieść sprzeciw lub wycofać zgodę. Przysługuje mu również prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.</p>
        <p>W celu skorzystania z praw skontaktuj się z administratorem, korzystając z danych wskazanych w tej polityce. Administrator może poprosić o informacje potrzebne do potwierdzenia tożsamości i prawidłowej obsługi żądania.</p>
      </section>

      <section className="sf-legal-section">
        <h2>8. Bezpieczeństwo</h2>
        <p>Serwis stosuje środki techniczne i organizacyjne odpowiednie do jego działania, w tym ochronę sesji i kontrolę dostępu do danych kont oraz materiałów. Użytkownik powinien chronić swoje dane logowania i nie przesyłać w zgłoszeniach pomocy haseł ani danych karty płatniczej.</p>
        <p>Żaden system transmisji lub przechowywania danych nie daje jednak bezwzględnej gwarancji bezpieczeństwa. W razie podejrzenia nieuprawnionego dostępu skontaktuj się niezwłocznie z administratorem.</p>
      </section>

      <section className="sf-legal-section">
        <h2>9. Dobrowolność podania danych</h2>
        <p>Podanie danych niezbędnych do utworzenia konta lub realizacji zakupu jest konieczne, aby skorzystać z danej funkcji. Podanie danych w opcjonalnych polach profilu lub analityka może być dobrowolne. Niepodanie informacji potrzebnych do przygotowania planu indywidualnego może uniemożliwić jego właściwe dopasowanie.</p>
      </section>

      <section className="sf-legal-section">
        <h2>10. Zmiany polityki i kontakt</h2>
        <p>Polityka może być aktualizowana, gdy zmienią się funkcje serwisu, dostawcy, przepisy lub sposób przetwarzania. Aktualna wersja jest publikowana pod tym adresem.</p>
        <p>Kontakt w sprawie danych: <a href="/pomoc">Centrum pomocy</a>{supportEmail ? <> lub <a href={`mailto:${supportEmail}`}>{supportEmail}</a></> : null}.</p>
        <p>Regulamin serwisu: <a href="/regulamin">zobacz dokument</a>.</p>
      </section>
    </>
  );
}

export default function LegalPages({ kind, supportEmail = '' }: Props) {
  const title = kind === 'terms' ? 'Regulamin Systemu Formy' : 'Polityka prywatności';
  return (
    <main className="sf-container sf-legal">
      <div className="sf-page-title">
        <div>
          <p className="sf-eyebrow">DOKUMENTY / SYSTEM FORMY</p>
          <h1>{title}</h1>
          <p className="sf-muted">Jasne zasady korzystania z platformy, zakupów i ochrony danych.</p>
        </div>
      </div>
      <article className="sf-content-panel sf-legal-document">
        {kind === 'terms' ? <TermsPage supportEmail={supportEmail} /> : <PrivacyPage supportEmail={supportEmail} />}
      </article>
    </main>
  );
}
