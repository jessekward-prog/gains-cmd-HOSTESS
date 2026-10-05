import { useEffect, useState, useCallback, useRef } from 'react';
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

  // Jump to the workout tab when a workout *becomes* active (started, or
  // found on load) — not every time Programs is opened mid-workout, which made
  // Programs unreachable until the workout ended.
  const hadWorkout = useRef(false);
  useEffect(() => {
    const has = !!activeWorkout;
    if (has && !hadWorkout.current && tab === 'programs') navigate('workout');
    hadWorkout.current = has;
  }, [activeWorkout, tab, navigate]);

  const handleNavExpanded = useCallback((v) => setNavExpanded(v), []);

  // Every tab shares this one scroll area — start each tab at the top instead
  // of wherever the last page was scrolled to.
  const scrollRef = useRef(null);
  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [tab]);

  return (
    <div className="min-h-dvh">
      <div
        className="flex flex-col h-dvh"
        style={{
          filter: navExpanded ? 'grayscale(1)' : 'grayscale(0)',
          transition: 'filter 0.4s ease',
        }}
      >
        <AppHeader />

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto h-full">
          {/* No AnimatePresence: mode="wait" holds the next tab until the old
              page reports its exit finished, and rapid tab changes (or a page
              swapping its root mid-exit) could leave that report missing — the
              old page then stayed on screen for good while the nav moved on.
              Pages still play their own entrance animation on mount. */}
            {tab === 'programs' && <ProgramsPage key="programs" onNavigate={navigate} />}
            {tab === 'workout' && <WorkoutPage key="workout" onNavigate={navigate} />}
            {tab === 'history' && <HistoryPage key="history" />}
            {tab === 'coach' && <CoachPage key="coach" />}
            {tab === 'recommendations' && <RecommendationsPage key="recommendations" />}
            {tab === 'aggression' && <AggressionPage key="aggression" />}
            {tab === 'settings' && <SettingsPage key="settings" />}
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

  // PinGate only lets us mount once the session is signed in, so no user here
  // means the session went away underneath us — locking again re-shows the PIN.
  if (!user) {
    return (
      <div className="g-root min-h-dvh bg-bg-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-[22px] font-extrabold">Session ended</div>
        <button onClick={() => { window.location.href = '/auth/logout'; }}
          className="h-[50px] px-6 rounded-[18px] bg-accent font-extrabold text-[15px]" style={{ color: 'var(--color-on-accent)' }}>
          Enter PIN
        </button>
      </div>
    );
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
