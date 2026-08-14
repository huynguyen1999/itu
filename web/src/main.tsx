import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from './shared/auth/AuthProvider';
import { SyncProvider } from './shared/sync/SyncProvider';
import { GrowthSyncProvider } from './features/growth';
import { ThemeProvider } from './shared/ui/ThemeProvider';
import { UndoStackProvider } from './shared/hooks/useUndoStack';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <GrowthSyncProvider>
            <ThemeProvider>
              <UndoStackProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </UndoStackProvider>
            </ThemeProvider>
          </GrowthSyncProvider>
        </SyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
