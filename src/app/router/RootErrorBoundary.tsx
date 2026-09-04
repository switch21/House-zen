/**
 * HOUSE-ZEN — Root error boundary.
 *
 * React unmounts the entire tree on an uncaught render error or a failed
 * lazy-chunk import. Without a boundary that means a BLANK PAGE — the exact
 * "écran blanc après connexion" incident reported on production.
 *
 * This boundary is intentionally framework-free (no router hooks, no i18n
 * context, no auth context): it must keep working when those providers are
 * the ones that crashed. Copy is French (default locale) by design.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_FLAG = 'hz:chunk-retry';

interface Props {
  children: ReactNode;
  /** Render-time label used in console reports to locate the boundary. */
  scope?: string;
}

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a breadcrumb for support: message + boundary scope + component stack.
    console.error(
      `[hz] ${this.props.scope ?? 'root'} error boundary caught:`,
      error.message,
      '\ncomponent stack:',
      info.componentStack,
    );
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* private mode — ignore */
    }
    window.location.assign('/');
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      >
        <p className="text-lg font-semibold text-foreground">
          Une erreur inattendue est survenue
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          L&apos;application n&apos;a pas pu afficher cette page. Un rechargement
          suffit dans la plupart des cas. Si le problème persiste, videz le cache
          du navigateur (Ctrl+Shift+R).
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Recharger l&apos;application
        </button>
      </div>
    );
  }
}
