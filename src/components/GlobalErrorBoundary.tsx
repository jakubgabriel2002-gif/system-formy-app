import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportClientError } from '../lib/clientMonitoring';
import './global-error-boundary.css';

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('System Formy UI render failure:', error, info.componentStack);
    reportClientError('react-boundary', error.message);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="sf-fatal-error" role="alert">
          <div className="sf-fatal-error-card">
            <AlertTriangle size={28} />
            <p className="sf-eyebrow">SYSTEM FORMY / BŁĄD APLIKACJI</p>
            <h1>Nie udało się wyświetlić tego ekranu.</h1>
            <p>Twoje wcześniej zapisane treningi pozostają na koncie. Odśwież aplikację i spróbuj ponownie.</p>
            <button type="button" onClick={() => window.location.reload()}><RefreshCw size={16} /> Odśwież aplikację</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
