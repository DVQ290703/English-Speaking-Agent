import { useContext } from 'react';
import { LanguageContext, type LanguageContextValue } from './LanguageContext';

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return ctx;
}

export function useT(): LanguageContextValue['t'] {
  return useLanguage().t;
}
