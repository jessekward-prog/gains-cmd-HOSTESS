import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkoutProvider, useWorkout } from './context/WorkoutContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { HeaderMessageProvider } from './context/HeaderMessageContext';
import { TimerProvider } from './context/TimerContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import AppHeader from './components/AppHeader';
import BottomNav from './components/BottomNav';
import GlobalRestTimer from './components/GlobalRestTimer';
import NavIcon from './components/NavIcon';
import ExerciseNameOptions from './components/ExerciseNameOptions';
import AppearanceSync from './components/AppearanceSync';
import AuthPage from './pages/AuthPage';
import PinGate from './components/PinGate';
import { workoutLayout } from './lib/focus';
import ProgramsPage from './pages/ProgramsPage';
import WorkoutPage from './pages/WorkoutPage';
import HistoryPage from './pages/HistoryPage';
import CoachPage from './pages/CoachPage';
import SettingsPage from './pages/SettingsPage';
import RecommendationsPage from './pages/RecommendationsPage';
import AggressionPage from './pages/AggressionPage';

function AppShell() {
  const { activeWorkout } = useWorkout();
  const { tab, navigate } = useNavigation();
  const [navExpanded, setNavExpanded] = useState(false);

  // Auto-switch to workout tab when a workout becomes active while on programs.
  useEffect(() => {
    if (activeWorkout && tab === 'programs') {
      navigate('workout');
    }
  }, [activeWorkout, tab, navigate]);

  const handleNavExpanded = useCallback((v) => setNavExpanded(v), []);

  return (
    <div className="min-h-dvh bg-bg-0">
      <div
        className="flex flex-col h-dvh"
        style={{
          filter: navExpanded ? 'grayscale(1)' : 'grayscale(0)',
          transition: 'filter 0.4s ease',
        }}
      >
        <AppHeader />

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto h-full">
          <AnimatePresence mode="wait">
            {tab === 'programs' && <ProgramsPage key="programs" onNavigate={navigate} />}
            {tab === 'workout' && <WorkoutPage key="workout" onNavigate={navigate} />}
            {tab === 'history' && <HistoryPage key="history" />}
            {tab === 'coach' && <CoachPage key="coach" />}
            {tab === 'recommendations' && <RecommendationsPage key="recommendations" />}
            {tab === 'aggression' && <AggressionPage key="aggression" />}
            {tab === 'settings' && <SettingsPage key="settings" />}
          </AnimatePresence>
          </div>
        </div>
        {/* Spacer matching BottomNav height so flex-1 stops at the nav top on all devices */}
        <div className="flex-shrink-0" style={{ height: 'calc(60px + env(safe-area-inset-bottom, 0px))' }} />
      </div>

      <BottomNav
        activeTab={tab}
        onChange={navigate}
        hasActiveWorkout={!!activeWorkout}
        onExpandedChange={handleNavExpanded}
      />

      <ExerciseNameOptions />
      <AppearanceSync />

      {/* Global rest timer — always mounted, survives page navigation. The
          Focus/Dense card shows rest in-card, so the circle only floats on other tabs. */}
      <GlobalRestTimer hidden={tab === 'workout' && !!activeWorkout && ['focus', 'dense'].includes(workoutLayout())} />
    </div>
  );
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { loading: dataLoading, loadAll } = useWorkout();
  const { showToast } = useToast();

  useEffect(() => {
    if (user && !authLoading) {
      loadAll();
    }
  }, [user, authLoading, loadAll]);

  if (authLoading || (user && dataLoading)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-0">
        <div className="text-center">
          <div className="mb-4 animate-pulse text-text-tertiary">
            <NavIcon id="workout" size={40} />
          </div>
          <div className="font-mono text-sm text-text-tertiary">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <NavigationProvider
      onExitAttempt={() => showToast('Press back again to exit', 'info')}
    >
      <AppShell />
    </NavigationProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <PinGate>
      <AuthProvider>
        <WorkoutProvider>
          <TimerProvider>
            <ToastProvider>
              <HeaderMessageProvider>
                <AppContent />
              </HeaderMessageProvider>
            </ToastProvider>
          </TimerProvider>
        </WorkoutProvider>
      </AuthProvider>
      </PinGate>
    </ThemeProvider>
  );
}
