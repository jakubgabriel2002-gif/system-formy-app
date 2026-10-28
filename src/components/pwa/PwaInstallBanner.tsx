import { ArrowRight, Download, Smartphone } from 'lucide-react';
import './pwa-install-banner.css';

type Props = { onOpen: () => void };

export default function PwaInstallBanner({ onOpen }: Props) {
  return (
    <aside className="sf-pwa-install-banner" aria-label="Zainstaluj aplikację System Formy">
      <span className="sf-pwa-install-banner-icon"><Smartphone size={20} /></span>
      <div className="sf-pwa-install-banner-copy">
        <strong>System Formy na ekranie głównym</strong>
        <p>Dodaj ikonę aplikacji do telefonu, aby szybciej wracać do treningu.</p>
      </div>
      <button type="button" onClick={onOpen}><Download size={16} /> Instaluj <ArrowRight size={15} /></button>
    </aside>
  );
}
