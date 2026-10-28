import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, Home, Share2, Smartphone, X } from 'lucide-react';
import './pwa-install-guide.css';

export type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Props = {
  open: boolean;
  installPrompt: DeferredInstallPromptEvent | null;
  onClose: () => void;
  onPromptConsumed: () => void;
};

type Platform = 'ios' | 'android' | 'desktop' | 'other';

function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (!/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'desktop';
  return 'other';
}

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(displayMode || iosStandalone);
}

export default function PwaInstallGuide({ open, installPrompt, onClose, onPromptConsumed }: Props) {
  const detectedPlatform = useMemo(getPlatform, []);
  const [platformOverride, setPlatformOverride] = useState<Platform | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const platform = platformOverride || detectedPlatform;

  if (!open || isAppInstalled()) return null;

  async function tryInstall() {
    if (!installPrompt) {
      setInstallMessage('Opcja instalacji nie jest dostępna w tej przeglądarce. Skorzystaj z instrukcji poniżej.');
      return;
    }
    setInstalling(true);
    setInstallMessage('');
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      onPromptConsumed();
      if (choice.outcome === 'accepted') onClose();
      else setInstallMessage('Instalacja nie została zakończona. Możesz wrócić do niej później z menu przeglądarki.');
    } catch {
      setInstallMessage('Nie udało się otworzyć instalatora. Użyj menu przeglądarki i wybierz opcję instalacji.');
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="sf-pwa-guide-backdrop" role="presentation">
      <section className="sf-pwa-guide" role="dialog" aria-modal="true" aria-labelledby="sf-pwa-guide-title">
        <button type="button" className="sf-pwa-guide-close" onClick={onClose} aria-label="Zamknij instrukcję instalacji"><X size={19} /></button>
        <div className="sf-pwa-guide-mark"><Smartphone size={27} /></div>
        <p className="sf-pwa-guide-eyebrow">SYSTEM FORMY · TWOJA APLIKACJA</p>
        <h2 id="sf-pwa-guide-title">Dodaj System Formy do ekranu głównego</h2>
        <p className="sf-pwa-guide-intro">Otwieraj treningi szybciej — z własnej ikony, bez szukania strony w przeglądarce.</p>

        <div className="sf-pwa-platform-tabs" role="group" aria-label="Wybierz urządzenie">
          <button type="button" className={platform === 'android' ? 'is-active' : ''} onClick={() => setPlatformOverride('android')}>Android</button>
          <button type="button" className={platform === 'ios' ? 'is-active' : ''} onClick={() => setPlatformOverride('ios')}>iPhone / iPad</button>
          <button type="button" className={platform === 'desktop' ? 'is-active' : ''} onClick={() => setPlatformOverride('desktop')}>Komputer</button>
        </div>

        {platform === 'ios' ? (
          <ol className="sf-pwa-guide-steps">
            <li><span>1</span><div><b>Otwórz stronę w Safari</b><p>Na iPhonie instalacja ze strony działa przez Safari, nie przez przeglądarkę wbudowaną w inną aplikację.</p></div></li>
            <li><span>2</span><div><b>Naciśnij Udostępnij</b><p>To ikona kwadratu ze strzałką w górę <Share2 size={15} /> w pasku Safari.</p></div></li>
            <li><span>3</span><div><b>Wybierz „Dodaj do ekranu początkowego”</b><p>Jeśli nie widzisz tej opcji, przewiń listę działań. Następnie wybierz „Dodaj”.</p></div></li>
          </ol>
        ) : platform === 'android' ? (
          <>
            <ol className="sf-pwa-guide-steps">
              <li><span>1</span><div><b>Otwórz aplikację w Chrome</b><p>Użyj aktualnej przeglądarki Chrome i otwórz stronę Systemu Formy.</p></div></li>
              <li><span>2</span><div><b>Naciśnij „Zainstaluj aplikację”</b><p>{installPrompt ? 'Możesz użyć przycisku poniżej, aby otworzyć systemowy instalator.' : 'Jeśli nie pojawi się automatyczny komunikat, otwórz menu ⋮ w Chrome i wybierz „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.'}</p></div></li>
            </ol>
            {installPrompt && <button type="button" className="sf-pwa-install-action" onClick={() => void tryInstall()} disabled={installing}><Download size={17} />{installing ? 'Otwieram instalator…' : 'Zainstaluj aplikację'}<ArrowRight size={16} /></button>}
          </>
        ) : (
          <ol className="sf-pwa-guide-steps">
            <li><span>1</span><div><b>Otwórz menu przeglądarki</b><p>W Chrome lub Edge poszukaj opcji „Zainstaluj System Formy” albo ikony instalacji przy pasku adresu.</p></div></li>
            <li><span>2</span><div><b>Potwierdź instalację</b><p>Ikona aplikacji pojawi się na urządzeniu. W razie braku opcji sprawdź, czy używasz aktualnej przeglądarki.</p></div></li>
          </ol>
        )}

        {installMessage && <p className="sf-pwa-guide-message" role="status">{installMessage}</p>}
        <div className="sf-pwa-guide-footer"><span><CheckCircle2 size={15} /> Nie wymaga pobierania zewnętrznego pliku</span><button type="button" onClick={onClose}>Zrobię to później</button></div>
        {platform === 'ios' && <p className="sf-pwa-ios-note"><Home size={14} /> Po dodaniu ikony uruchamiaj aplikację z ekranu początkowego.</p>}
      </section>
    </div>
  );
}
