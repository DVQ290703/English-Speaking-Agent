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
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));

function PageFallback() {
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 px-6 py-10">
      <Skeleton className="h-8 w-64 mb-6" />
      <Skeleton className="h-96 w-full max-w-6xl" rounded="2xl" />
    </div>
  );
}

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        {
          index: true,
          element: <Navigate to="/chat" replace />,
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
            {
              path: 'auth/callback',
              element: (
                <Suspense fallback={<PageFallback />}>
                  <OAuthCallbackPage />
                </Suspense>
              ),
            },
            {
              path: 'forgot-password',
              element: (
                <Suspense fallback={<PageFallback />}>
                  <ForgotPasswordPage />
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
          path: 'reset-password',
          element: (
            <Suspense fallback={<PageFallback />}>
              <ChangePasswordPage mode="reset" />
            </Suspense>
          ),
        },
        {
          element: <MainLayout />,
          children: [
            {
              path: 'chat',
              element: (
                <Suspense fallback={<PageFallback />}>
                  <VoiceAgent />
                </Suspense>
              ),
            },
            {
              element: <ProtectedRoute />,
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
                {
                  path: 'change-password',
                  element: (
                    <Suspense fallback={<PageFallback />}>
                      <ChangePasswordPage />
                    </Suspense>
                  ),
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
  ],
  {
    future: {
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);
