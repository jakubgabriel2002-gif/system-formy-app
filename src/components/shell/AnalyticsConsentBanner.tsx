type Props = { onChoose: (choice: 'yes' | 'no') => void };

export default function AnalyticsConsentBanner({ onChoose }: Props) {
  return (
    <div className="sf-consent">
      <div><b>Twoja prywatność ma znaczenie.</b><p>Opcjonalna analityka zapisuje zdarzenia korzystania ze sklepu; po zalogowaniu mogą być powiązane z kontem. Uruchamia się dopiero po zgodzie.</p></div>
      <div>
        <button className="sf-button sf-button-outline" onClick={() => onChoose('no')}>Odrzuć</button>
        <button className="sf-button sf-button-lime" onClick={() => onChoose('yes')}>Akceptuję analitykę</button>
      </div>
    </div>
  );
}
