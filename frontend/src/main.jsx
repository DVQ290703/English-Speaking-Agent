import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { LanguageProvider } from './i18n/LanguageContext';
import { queryClient } from './lib/queryClient';
import './styles.css';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <BrowserRouter basename={basename || undefined}>
          <App />
        </BrowserRouter>
      </LanguageProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
