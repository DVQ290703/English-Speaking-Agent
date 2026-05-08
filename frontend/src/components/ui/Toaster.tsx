import { Toaster as SonnerToaster } from 'sonner';

import { useDarkMode } from '../../theme/useDarkMode';

export default function Toaster() {
  const [dark] = useDarkMode();
  return (
    <SonnerToaster
      position="top-center"
      theme={dark ? 'dark' : 'light'}
      richColors
      closeButton
      duration={3000}
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border shadow-lg dark:shadow-black/40 text-sm font-medium',
        },
      }}
    />
  );
}
