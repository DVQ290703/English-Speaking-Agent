import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import App from './App';
import LoginPage from './pages/LoginPage';
import { ProtectedRoute, PublicRoute } from './auth/AuthGuards';
import { FlashcardLayout } from './components/flashcards/FlashcardLayout';
import { MainLayout } from './components/layout/MainLayout';
import Skeleton from './components/ui/Skeleton';

const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const VoiceAgent = lazy(() => import('./pages/VoiceAgent'));
const FlashcardDecksPage = lazy(() => import('./pages/FlashcardDecksPage'));
const FlashcardCardsPage = lazy(() => import('./pages/FlashcardCardsPage'));
const FlashcardStudyPage = lazy(() => import('./pages/FlashcardStudyPage'));

function PageFallback() {
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 px-6 py-10">
      <Skeleton className="h-8 w-64 mb-6" />
      <Skeleton className="h-96 w-full max-w-6xl" rounded="2xl" />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        element: <PublicRoute />,
        children: [
          {
            path: 'login',
            element: <LoginPage />,
          },
          {
            path: 'register',
            element: (
              <Suspense fallback={<PageFallback />}>
                <RegisterPage />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: 'VoiceAgent',
        element: <Navigate to="/chat" replace />,
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <MainLayout />,
            children: [
              {
                path: 'dashboard',
                element: (
                  <Suspense fallback={<PageFallback />}>
                    <DashboardPage />
                  </Suspense>
                ),
              },
              {
                path: 'chat',
                element: (
                  <Suspense fallback={<PageFallback />}>
                    <VoiceAgent />
                  </Suspense>
                ),
              },
              {
                path: 'flashcards',
                element: <FlashcardLayout />,
                children: [
                  {
                    index: true,
                    element: <Navigate to="decks" replace />,
                  },
                  {
                    path: 'decks',
                    element: (
                      <Suspense fallback={<PageFallback />}>
                        <FlashcardDecksPage />
                      </Suspense>
                    ),
                  },
                  {
                    path: 'decks/:deckId/cards',
                    element: (
                      <Suspense fallback={<PageFallback />}>
                        <FlashcardCardsPage />
                      </Suspense>
                    ),
                  },
                  {
                    path: 'decks/:deckId/study',
                    element: (
                      <Suspense fallback={<PageFallback />}>
                        <FlashcardStudyPage />
                      </Suspense>
                    ),
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
], {
  future: {
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_relativeSplatPath: true,
    v7_skipActionErrorRevalidation: true,
  }
});
