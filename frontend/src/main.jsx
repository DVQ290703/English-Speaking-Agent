import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import Toaster from './components/ui/Toaster';
import { LanguageProvider } from './i18n/LanguageContext';
import './styles.css';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        <BrowserRouter
          basename={basename || undefined}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <QueryClientProvider client={queryClient}>
            <App />
            <Toaster />
          </QueryClientProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
);
