import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { I18nProvider } from '@/lib/i18n/provider';
import { AuthProvider } from '@/lib/auth/context';
import { AppRoutes } from '@/app/router/routes';
import { RootErrorBoundary } from '@/app/router/RootErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            {/* Inner boundary: catches route render errors while keeping the
                router context available to future fallback enhancements. */}
            <RootErrorBoundary scope="router">
              <AppRoutes />
            </RootErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
