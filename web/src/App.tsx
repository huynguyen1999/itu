import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from './shared/auth/AuthProvider';
import { Layout } from './shared/ui/Layout';
import { AuthPage } from './features/auth';
import { DecksPage, DeckDetailPage } from './features/decks';
import { ProfilePage } from './features/profile';
import { ReviewPage } from './features/review';
import { SessionHistoryPage } from './features/history';
import { TrashPage } from './features/trash';
import { SettingsPage } from './features/settings';
import { TodayPage } from './features/today';
import { StatisticsPage } from './features/statistics';
import { PlanningPage, MatrixPage, PlanningSidebar } from './features/planning';
import { FocusAudioProvider, FocusPage, GlobalFocusTimer } from './features/focus';
import { HabitsPage } from './features/habits';
import { LearnWorkspace } from './features/learn';
import { GrowthPage } from './features/growth';
import { PlanningProvider } from './features/planning/PlanningContext';
import { GrowthRewardReceiptHost } from './features/growth/components/growth-reward-receipt';

import { Brain } from 'lucide-react';

function Protected() {
  const auth = useAuth();
  if (auth.isLoading) {
    return (
      <div className="grid min-h-screen place-content-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Brain className="h-5 w-5 animate-pulse" />
          </div>
          <p className="text-xs font-medium">Loading iTu...</p>
        </div>
      </div>
    );
  }
  if (!auth.isAuthenticated) return <Navigate to="/auth" replace />;
  return (
    <PlanningProvider>
      <FocusAudioProvider>
        <Layout planningSidebar={<PlanningSidebar />} globalFocusTimer={<GlobalFocusTimer />} />
      </FocusAudioProvider>
    </PlanningProvider>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<Protected />}>
          <Route index element={<TodayPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/plan" element={<PlanningPage />} />
          <Route path="/plan/today" element={<PlanningPage view="today" />} />
          <Route path="/inbox" element={<PlanningPage view="inbox" />} />
          <Route path="/upcoming" element={<PlanningPage view="upcoming" />} />
          <Route path="/matrix" element={<MatrixPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/habits" element={<HabitsPage />} />
          <Route path="/growth" element={<Navigate to="/growth/attributes" replace />} />
          <Route path="/growth/attributes" element={<GrowthPage tab="attributes" />} />
          <Route path="/growth/skills" element={<GrowthPage tab="skills" />} />
          <Route path="/growth/shop" element={<GrowthPage tab="shop" />} />
          <Route path="/growth/ledger" element={<GrowthPage tab="ledger" />} />
          <Route path="/growth/settings" element={<Navigate to="/settings" replace />} />
          <Route path="/learn" element={<LearnWorkspace />}>
            <Route index element={<Navigate to="/learn/decks" replace />} />
            <Route path="decks" element={<DecksPage />} />
            <Route path="decks/:deckId" element={<DeckDetailPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="history" element={<SessionHistoryPage />} />
          </Route>
          <Route path="/decks" element={<Navigate to="/learn/decks" replace />} />
          <Route path="/decks/:deckId" element={<DeckDetailRedirect />} />
          <Route path="/history" element={<Navigate to="/learn/history" replace />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/review" element={<Navigate to="/learn/review" replace />} />
        </Route>
      </Routes>
      <GrowthRewardReceiptHost />
    </>
  );
}

function DeckDetailRedirect() {
  const { deckId } = useParams();
  return <Navigate to={`/learn/decks/${deckId}`} replace />;
}
