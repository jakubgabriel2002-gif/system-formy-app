const MAX_REPORTS_PER_SESSION = 5;
const SESSION_KEY = 'sf-client-error-reports-v1';

type ClientErrorKind = 'runtime' | 'unhandled-rejection' | 'react-boundary';

function safeMessage(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function reportClientError(kind: ClientErrorKind, message: string): void {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const reports = Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [];
    const recent = reports.filter(timestamp => Date.now() - timestamp < 10 * 60 * 1000);
    if (recent.length >= MAX_REPORTS_PER_SESSION) return;
    recent.push(Date.now());
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(recent));
  } catch {
    // Monitoring must never prevent the application from working when storage is unavailable.
  }

  const payload = {
    kind,
    message: safeMessage(message || 'Nieznany błąd klienta'),
    path: window.location.pathname.slice(0, 160),
  };
  void fetch('/api/v2/client-error', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function installClientMonitoring(): () => void {
  const onError = (event: ErrorEvent) => reportClientError('runtime', event.message || 'Błąd wykonania JavaScript');
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    reportClientError('unhandled-rejection', reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Nieobsłużone odrzucenie Promise');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
