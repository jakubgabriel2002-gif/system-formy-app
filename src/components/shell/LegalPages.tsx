type LegalPageKind = 'terms' | 'privacy';

type Props = {
  kind: LegalPageKind;
  supportEmail?: string;
};

const VERSION_DATE = '29 października 2026 r.';
const OPERATOR_NAME = 'Jakub Gabriel';
const OPERATOR_ADDRESS = 'Kazimierza Wielkiego 4/28, Lubawa, Polska';
const LEGAL_EMAIL = 'kontakt@systemformy.com.pl';
const SUPPORT_EMAIL = 'pomoc@systemformy.com.pl';
const SITE_URL = 'https://systemformy.com.pl';

function ContactDetails() {
  return (
    <section className="sf-legal-section">
      <h2>Dane usługodawcy i kontakt</h2>
      <p>
        Usługodawca i administrator danych: <strong>{OPERATOR_NAME}</strong><br />
        Adres: <strong>{OPERATOR_ADDRESS}</strong><br />
        E-mail w sprawach prawnych i dotyczących danych: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a><br />
        Pomoc techniczna, zamówienia i reklamacje: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><br />
        Serwis: <a href={SITE_URL}>{SITE_URL}</a>
      </p>
      <p>Numer NIP nie został podany. Dane identyfikacyjne należy utrzymywać zgodne z rzeczywistym statusem prawnym usługodawcy oraz informacjami przekazywanymi operatorowi płatności.</p>
    </section>
  );
}

function TermsPage() {
  return (
    <>
      <div className="sf-legal-meta">Wersja z dnia {VERSION_DATE}</div>
      <ContactDetails />

      <section className="sf-legal-section">
        <h2>1. Postanowienia ogólne</h2>
        <p>Regulamin określa zasady korzystania z serwisu internetowego i aplikacji System Formy, zakładania i używania konta, korzystania z funkcji treningowych, udziału w wyzwaniach oraz zawierania umów dotyczących materiałów cyfrowych, planów i dostępu Premium.</p>
        <p>Przed złożeniem zamówienia użytkownik otrzymuje informacje o produkcie, jego zakresie, cenie i dostępnych warunkach zakupu. Regulamin nie wyłącza ani nie ogranicza praw przyznanych konsumentom przez bezwzględnie obowiązujące przepisy.</p>
      </section>

      <section className="sf-legal-section">
        <h2>2. Definicje i zakres usług</h2>
        <ul>
          <li><b>Serwis</b> — strona systemformy.com.pl oraz powiązana aplikacja System Formy.</li>
          <li><b>Użytkownik</b> — osoba korzystająca z Serwisu.</li>
          <li><b>Konto</b> — profil użytkownika służący do korzystania z dostępnych funkcji.</li>
          <li><b>Materiały cyfrowe</b> — e-booki, poradniki, plany treningowe, pliki i inne treści udostępniane elektronicznie.</li>
          <li><b>Wyzwanie</b> — cyfrowy program treningowy udostępniany zgodnie z opisem i ceną wskazanymi w Serwisie.</li>
          <li><b>Premium</b> — płatny dostęp do dodatkowych funkcji na okres i za cenę wskazane przed zakupem; jeśli oferta wskazuje cykliczne odnowienie, obowiązują zasady z punktu 7.</li>
        </ul>
        <p>Oferta może obejmować bezpłatne materiały, e-booki i gotowe plany, płatne wyzwania, indywidualne plany treningowe oraz prowadzenie 1:1. Dostępność i dokładny zakres konkretnego produktu wynikają z jego aktualnego opisu.</p>
      </section>

      <section className="sf-legal-section">
        <h2>3. Konto i wymagania techniczne</h2>
        <p>Do korzystania z Serwisu potrzebne są urządzenie z dostępem do internetu i aktualna przeglądarka obsługująca nowoczesne aplikacje internetowe. Niektóre funkcje mogą zależeć od urządzenia, przeglądarki lub możliwości instalacji aplikacji PWA.</p>
        <p>Użytkownik powinien podawać prawdziwe informacje, chronić dane logowania i nie udostępniać konta w sposób naruszający warunki zakupu lub prawa innych osób. Zabronione jest zakłócanie działania Serwisu, próby uzyskania nieuprawnionego dostępu oraz bezprawne kopiowanie lub rozpowszechnianie materiałów.</p>
        <p>Serwis nie określa w tej wersji regulaminu odrębnego minimalnego wieku użytkownika. W przypadku osób małoletnich zastosowanie mają przepisy dotyczące zdolności do czynności prawnych i zgody przedstawiciela ustawowego, gdy jest wymagana.</p>
      </section>

      <section className="sf-legal-section">
        <h2>4. Funkcje aplikacji i materiały</h2>
        <p>W zależności od konta i zakupionych uprawnień Serwis może umożliwiać tworzenie i zapisywanie planów, rejestrowanie treningów, monitorowanie postępów, udział w wyzwaniach, korzystanie z materiałów, przeglądanie zamówień oraz używanie funkcji Premium.</p>
        <p>Zakupione treści i funkcje są przypisywane do konta po potwierdzeniu płatności przez system. Samo przekierowanie po płatności nie oznacza, że transakcja została rozliczona. Jeśli środki pobrano, a dostęp nie został przyznany, należy skontaktować się z pomocą i podać adres e-mail konta oraz informacje pozwalające zidentyfikować zamówienie.</p>
        <p>Materiały są przeznaczone do osobistego użytku kupującego, chyba że opis produktu stanowi inaczej. Bez odpowiedniej podstawy nie wolno ich odsprzedawać, publicznie udostępniać ani rozpowszechniać.</p>
      </section>

      <section className="sf-legal-section">
        <h2>5. Zamówienia, ceny i płatności</h2>
        <p>Cena, waluta, opis, zakres produktu i ewentualne warunki promocyjne są pokazywane przy produkcie i w procesie zamówienia przed płatnością. Dla konkretnego zamówienia wiążące są warunki przedstawione przed jego złożeniem.</p>
        <p>Obsługę płatności elektronicznych zapewnia Stripe. Płatność może wymagać przejścia do interfejsu operatora. System Formy otrzymuje informacje niezbędne do rozpoznania transakcji i przypisania zamówienia do konta. Nie przesyłaj pomocy pełnego numeru karty ani kodu CVC.</p>
        <p>Jeżeli płatność nie zostanie potwierdzona, dostęp do produktu może nie zostać odblokowany. W przypadku błędu skontaktuj się z pomocą: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </section>

      <section className="sf-legal-section">
        <h2>6. Dostarczenie produktów cyfrowych i planów indywidualnych</h2>
        <p>Produkty cyfrowe są udostępniane na koncie użytkownika lub w inny sposób wskazany w opisie konkretnego produktu. Użytkownik powinien zapoznać się z opisem, zakresem i wymaganiami technicznymi przed zakupem.</p>
        <p>Indywidualny plan lub prowadzenie jest realizowane w zakresie opisanym w ofercie i na podstawie informacji przekazanych przez użytkownika. Jeżeli do przygotowania usługi potrzebne są dodatkowe dane, ich przekazanie może być konieczne do wykonania zamówienia.</p>
        <p>System Formy nie świadczy usług medycznych, diagnostycznych ani rehabilitacyjnych. Plany i materiały mają charakter treningowy i edukacyjny, a materiały żywieniowe nie stanowią indywidualnej diety medycznej.</p>
      </section>

      <section className="sf-legal-section">
        <h2>7. Premium i subskrypcje</h2>
        <p>Jeżeli przy zakupie Premium wskazano subskrypcję odnawianą automatycznie, opłata jest pobierana za kolejne okresy zgodnie z ceną i częstotliwością przedstawioną przed zakupem, aż do skutecznego anulowania. Przed potwierdzeniem zamówienia użytkownik powinien sprawdzić cenę, okres rozliczeniowy i warunki odnowienia.</p>
        <p>Jeżeli w Serwisie lub portalu płatności udostępniono zarządzanie subskrypcją, można z niego skorzystać, aby sprawdzić status lub anulować kolejne odnowienia. Jeśli opcja nie jest dostępna, należy skontaktować się z pomocą. Anulowanie odnowienia nie pozbawia praw, które przysługują na mocy przepisów.</p>
      </section>

      <section className="sf-legal-section">
        <h2>8. Odstąpienie od umowy i zwroty</h2>
        <p>Prawo odstąpienia od umowy zawartej na odległość zależy od rodzaju umowy i przepisów mających zastosowanie do danego zakupu. Konsumentowi co do zasady przysługuje 14-dniowy termin na odstąpienie od umowy zawartej na odległość, z zastrzeżeniem ustawowych wyjątków.</p>
        <p>W przypadku treści cyfrowych niedostarczanych na nośniku materialnym prawo odstąpienia nie jest automatycznie wyłączone tylko dlatego, że produkt jest cyfrowy lub został opłacony. Wyjątek może mieć zastosowanie, gdy spełnione są wymagania ustawowe, w tym uzyskanie uprzedniej wyraźnej zgody konsumenta na rozpoczęcie dostarczania treści przed upływem terminu odstąpienia, przyjęcie przez niego do wiadomości utraty prawa odstąpienia oraz przekazanie wymaganego potwierdzenia zawarcia umowy. Sam zapis w tym regulaminie nie zastępuje odpowiednich zgód i potwierdzeń w procesie zakupu.</p>
        <p>Jeżeli wymagane zgody lub potwierdzenia nie zostały prawidłowo uzyskane, nie należy zakładać, że prawo odstąpienia zostało utracone. Każde zgłoszenie jest oceniane zgodnie z przepisami i okolicznościami konkretnej umowy.</p>
        <p>Aby zgłosić odstąpienie lub zapytać o zwrot, napisz na <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Dobrowolna polityka zwrotów, jeśli zostanie wprowadzona, nie ogranicza praw ustawowych.</p>
      </section>

      <section className="sf-legal-section">
        <h2>9. Reklamacje i pomoc</h2>
        <p>Problemy z kontem, płatnością, dostępem do produktu lub działaniem funkcji można zgłaszać na adres <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> albo przez Centrum pomocy w Serwisie. W zgłoszeniu opisz problem i podaj informacje potrzebne do znalezienia zamówienia.</p>
        <p>Nie wysyłaj hasła, pełnych danych karty płatniczej ani innych informacji, które nie są niezbędne do obsługi sprawy. Zgłoszenia będą rozpatrywane bez zbędnej zwłoki i w terminach wynikających z właściwych przepisów.</p>
      </section>

      <section className="sf-legal-section">
        <h2>10. Bezpieczeństwo i rezultaty treningowe</h2>
        <p>System Formy ma charakter treningowy i edukacyjny; nie diagnozuje ani nie leczy chorób i nie zastępuje lekarza, fizjoterapeuty ani innego odpowiedniego specjalisty. Ćwiczenia należy dostosować do własnych możliwości. W razie choroby, kontuzji lub wątpliwości co do bezpieczeństwa należy skonsultować się ze specjalistą.</p>
        <p>Nie gwarantuje się konkretnej zmiany sylwetki, liczby kilogramów, czasu osiągnięcia efektu ani wyniku sportowego. Rezultaty zależą od indywidualnej sytuacji oraz sposobu realizacji planu.</p>
      </section>

      <section className="sf-legal-section">
        <h2>11. Zmiany regulaminu i prawo właściwe</h2>
        <p>Aktualna wersja regulaminu jest publikowana w Serwisie. Zmiany będą stosowane z poszanowaniem praw nabytych oraz zasad wynikających z przepisów. Do umów stosuje się prawo polskie, z zastrzeżeniem ochrony konsumenta wynikającej z bezwzględnie obowiązujących przepisów.</p>
        <p>Kontakt: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> lub <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </section>
    </>
  );
}

function PrivacyPage() {
  return (
    <>
      <div className="sf-legal-meta">Wersja z dnia {VERSION_DATE}</div>
      <ContactDetails />

      <section className="sf-legal-section">
        <h2>1. Zakres polityki</h2>
        <p>Polityka opisuje zasady przetwarzania danych osobowych podczas korzystania z Systemu Formy, w tym konta, funkcji treningowych, wyzwań, materiałów, zamówień, Premium i kontaktu z pomocą. Zakres przetwarzania zależy od funkcji, z których korzysta użytkownik, oraz informacji, które sam przekazuje.</p>
      </section>

      <section className="sf-legal-section">
        <h2>2. Jakie dane mogą być przetwarzane</h2>
        <ul>
          <li><b>Dane konta:</b> adres e-mail, identyfikator konta i dane technicznie niezbędne do uwierzytelnienia oraz utrzymania sesji.</li>
          <li><b>Dane profilu i treningowe:</b> informacje podane w profilu, takie jak imię, cel treningowy, miejsce treningu, wzrost, masa ciała i preferowana częstotliwość treningów, oraz zapisy planów, ćwiczeń, serii, powtórzeń, obciążeń, treningów i postępów.</li>
          <li><b>Dane o wyzwaniach:</b> udział w wyzwaniu, jego status i postęp, jeżeli funkcja jest używana.</li>
          <li><b>Dane zamówień:</b> kupione produkty, kwoty, status płatności, identyfikatory zamówień i informacje transakcyjne niezbędne do obsługi zakupu. Dane karty płatniczej obsługuje operator płatności; Serwis nie prosi o przekazywanie pełnych danych karty w wiadomościach.</li>
          <li><b>Dane ankiet i planów indywidualnych:</b> odpowiedzi potrzebne do przygotowania planu, które mogą obejmować wiek, parametry fizyczne, cele, dostępny sprzęt, ograniczenia ruchowe, kontuzje, choroby lub leki, jeżeli użytkownik je poda. Informacje o zdrowiu mogą stanowić szczególną kategorię danych osobowych.</li>
          <li><b>Dane kontaktowe i zgłoszenia:</b> adres e-mail, treść zgłoszenia i informacje potrzebne do rozwiązania problemu.</li>
          <li><b>Dane techniczne i analityczne:</b> informacje o odwiedzanej ścieżce, zdarzeniu w Serwisie, produkcie i sesji analitycznej. Opcjonalna analityka aktywności sklepu w aplikacji jest uzależniona od wyboru użytkownika w banerze zgody. Inne narzędzia analityczne lub reklamowe nie zostały w tej polityce potwierdzone.</li>
        </ul>
        <p>Nie przekazuj danych, które nie są potrzebne do danej funkcji. W szczególności informacje o zdrowiu podawaj tylko wtedy, gdy są potrzebne do realizacji wybranej usługi.</p>
      </section>

      <section className="sf-legal-section">
        <h2>3. Cele i podstawy przetwarzania</h2>
        <ul>
          <li>utworzenie i obsługa konta, udostępnienie funkcji oraz wykonanie zakupu — w zakresie niezbędnym do wykonania umowy lub podjęcia działań przed jej zawarciem;</li>
          <li>obsługa płatności, zamówień, reklamacji i obowiązków rozliczeniowych — w celu wykonania umowy oraz wypełnienia obowiązków prawnych, które mają zastosowanie;</li>
          <li>zapewnienie bezpieczeństwa, zapobieganie nadużyciom i dochodzenie lub obrona roszczeń — w zakresie prawnie uzasadnionego interesu, jeśli ma zastosowanie;</li>
          <li>opcjonalna analityka zachowania w Serwisie — na podstawie wyboru użytkownika, zgodnie z mechanizmem zgody udostępnionym w aplikacji;</li>
          <li>przetwarzanie danych o zdrowiu, jeżeli użytkownik poda takie dane w ankiecie — wyłącznie, gdy istnieje odpowiednia podstawa prawna, w tym wyraźna zgoda, jeśli jest wymagana. Przed wdrożeniem ankiety administrator powinien zapewnić właściwy sposób uzyskiwania i dokumentowania takiej zgody.</li>
        </ul>
        <p>Wycofanie zgody nie wpływa na zgodność z prawem przetwarzania dokonanego przed jej wycofaniem. Dane, które muszą być zachowane na innej podstawie prawnej, nie są automatycznie usuwane po wycofaniu zgody.</p>
      </section>

      <section className="sf-legal-section">
        <h2>4. Odbiorcy danych</h2>
        <p>Dostęp do danych mogą mieć osoby upoważnione do obsługi Serwisu oraz dostawcy technologii niezbędni do jego działania. Aplikacja korzysta z usług Cloudflare do obsługi aplikacji, bazy danych i przechowywania plików oraz Stripe do obsługi płatności i subskrypcji. Dane mogą być również przekazane uprawnionym organom, jeśli wymaga tego prawo.</p>
        <p>Przed publikacją administrator powinien zweryfikować aktualne warunki i role dostawców, umowy dotyczące przetwarzania danych oraz ewentualne transfery danych poza Europejski Obszar Gospodarczy.</p>
      </section>

      <section className="sf-legal-section">
        <h2>5. Okres przechowywania</h2>
        <p>Dane konta, profilu i aktywności są przechowywane tak długo, jak jest to potrzebne do obsługi konta i funkcji, a następnie przez okres konieczny do rozliczeń, realizacji obowiązków prawnych lub ustalenia, dochodzenia i obrony roszczeń. Dane zamówień i dokumenty rozliczeniowe są przechowywane przez okres wynikający z właściwych przepisów.</p>
        <p>Zgłoszenia pomocy przechowuje się przez czas potrzebny do ich obsługi i ewentualnego wykazania przebiegu sprawy. Dane o zdrowiu powinny być ograniczone do minimum i przechowywane wyłącznie przez okres uzasadniony celem i właściwą podstawą prawną. Konkretne okresy retencji i zasady usuwania danych, w tym kopii zapasowych, powinny zostać określone i wdrożone przez administratora.</p>
      </section>

      <section className="sf-legal-section">
        <h2>6. Cookies, pamięć urządzenia i analityka</h2>
        <p>Serwis wykorzystuje techniczne mechanizmy potrzebne do logowania, utrzymania sesji, bezpieczeństwa i działania aplikacji. W pamięci przeglądarki może być zapisywana decyzja dotycząca opcjonalnej analityki oraz tymczasowy identyfikator sesji analitycznej.</p>
        <p>Opcjonalna analityka aktywności sklepu jest uruchamiana po wybraniu akceptacji w banerze zgody. Użytkownik może ponownie otworzyć ustawienia prywatności z poziomu Serwisu i zmienić wybór. W tej wersji dokumentu nie deklaruje się użycia Google Analytics, Meta Pixel ani innych zewnętrznych narzędzi reklamowych, ponieważ nie zostało to potwierdzone.</p>
        <p>Usunięcie niezbędnych danych sesji lub zablokowanie pamięci przeglądarki może spowodować, że logowanie albo niektóre funkcje nie będą działać prawidłowo.</p>
      </section>

      <section className="sf-legal-section">
        <h2>7. Prawa osób, których dane dotyczą</h2>
        <p>W granicach określonych przepisami użytkownik może żądać dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania lub przeniesienia, wnieść sprzeciw, a w przypadku danych przetwarzanych na podstawie zgody — wycofać zgodę. Przysługuje mu również prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.</p>
        <p>Żądania dotyczące danych można przesłać na <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>. Administrator może poprosić o informacje niezbędne do potwierdzenia tożsamości i prawidłowej obsługi żądania.</p>
      </section>

      <section className="sf-legal-section">
        <h2>8. Usuwanie konta</h2>
        <p>Aby poprosić o usunięcie konta, napisz na <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> z adresu e-mail powiązanego z kontem lub podaj informacje pozwalające je zidentyfikować. Usunięcie konta nie zawsze oznacza natychmiastowe usunięcie wszystkich informacji: część danych może być zachowana, jeśli wymaga tego prawo albo jest to konieczne do ustalenia, dochodzenia lub obrony roszczeń. Dane, dla których nie ma dalszej podstawy przetwarzania, powinny zostać usunięte zgodnie z procedurą administratora.</p>
      </section>

      <section className="sf-legal-section">
        <h2>9. Bezpieczeństwo i dobrowolność podania danych</h2>
        <p>Stosowane są środki techniczne i organizacyjne właściwe dla działania Serwisu, w tym kontrola dostępu do kont i danych. Użytkownik powinien chronić swoje dane logowania. Żaden system nie gwarantuje jednak bezwzględnego bezpieczeństwa transmisji lub przechowywania informacji.</p>
        <p>Podanie danych niezbędnych do założenia konta, zakupu lub przygotowania zamówionego planu jest konieczne do skorzystania z danej funkcji. Podanie informacji opcjonalnych jest dobrowolne. Niepodanie informacji wymaganych do wykonania planu indywidualnego może uniemożliwić jego przygotowanie.</p>
      </section>

      <section className="sf-legal-section">
        <h2>10. Marketing i zmiany polityki</h2>
        <p>Na dzień publikacji polityki wysyłka newslettera lub marketingowych wiadomości e-mail nie została potwierdzona jako aktywna funkcja. Jeżeli zostanie wdrożona, użytkownik powinien otrzymać odpowiednią informację i — gdy jest to wymagane — możliwość udzielenia oraz wycofania zgody niezależnie od wiadomości niezbędnych do obsługi konta lub zamówienia.</p>
        <p>Polityka może być aktualizowana, gdy zmienią się funkcje Serwisu, dostawcy, przepisy lub sposób przetwarzania danych. Aktualna wersja jest publikowana pod tym adresem.</p>
        <p>Kontakt w sprawach danych: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>. Pomoc techniczna i zamówienia: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. <a href="/regulamin">Przeczytaj regulamin.</a></p>
      </section>
    </>
  );
}

export default function LegalPages({ kind }: Props) {
  const title = kind === 'terms' ? 'Regulamin Systemu Formy' : 'Polityka prywatności';
  return (
    <main className="sf-container sf-legal">
      <div className="sf-page-title">
        <div>
          <p className="sf-eyebrow">DOKUMENTY / SYSTEM FORMY</p>
          <h1>{title}</h1>
          <p className="sf-muted">Zasady korzystania z platformy, zakupów i ochrony danych.</p>
        </div>
      </div>
      <article className="sf-content-panel sf-legal-document">
        {kind === 'terms' ? <TermsPage /> : <PrivacyPage />}
      </article>
    </main>
  );
}
