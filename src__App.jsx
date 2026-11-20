import { useEffect, useState, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkoutProvider, useWorkout } from './context/WorkoutContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { HeaderMessageProvider } from './context/HeaderMessageContext';
import { TimerProvider, useGlobalTimer } from './context/TimerContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { RepSensorProvider } from './context/RepSensorContext';
import AppHeader from './components/AppHeader';
import BottomNav from './components/BottomNav';
import GlobalRestTimer from './components/GlobalRestTimer';
import NavIcon from './components/NavIcon';
import ExerciseNameOptions from './components/ExerciseNameOptions';
import QuestTitle from './components/QuestTitle';
import AppearanceSync from './components/AppearanceSync';
import ErrorBoundary from './components/ErrorBoundary';
import PinGate from './components/PinGate';
import WaveBackground from './components/WaveBackground';
import { useTheme } from './context/ThemeContext';
import { workoutLayout } from './lib/focus';
import { observePage } from './lib/fit';
import { moodState } from './lib/mood';
import { stageArt } from './components/QuestStage';
import { warmQuestSprites } from './hooks/useQuestSprites';
import useQuest, { readTint } from './hooks/useQuest';
import ProgramsPage from './pages/ProgramsPage';
import WorkoutPage from './pages/WorkoutPage';
import HistoryPage from './pages/HistoryPage';
import CoachPage from './pages/CoachPage';
import SettingsPage from './pages/SettingsPage';
import RecommendationsPage from './pages/RecommendationsPage';
import AggressionPage from './pages/AggressionPage';
import DeskApp from './desk/DeskApp';

function AppShell() {
  const { activeWorkout } = useWorkout();
  const { tab, navigate } = useNavigation();
  const [navExpanded, setNavExpanded] = useState(false);

  // A rest countdown shouldn't outlive the workout (finish or cancel). This
  // lives here, not in WorkoutPage: cancelling also navigates away, and the
  // page unmounts in the same render the workout clears, so its effect never ran.
  const { stop: stopRestTimer } = useGlobalTimer();
  useEffect(() => { if (!activeWorkout) stopRestTimer(); }, [activeWorkout, stopRestTimer]);

  // Quest Mode has its own look (Settings → Quest), only on the quest screens.
  const { setQuestActive, questSkin } = useTheme();
  const inQuest = tab === 'quest' || (tab === 'workout' && !!activeWorkout?.quest);
  useEffect(() => { setQuestActive(inQuest); }, [inQuest, setQuestActive]);

  // The quest sprites are recoloured once per session and cached. Doing that on
  // arrival put a second of fetching and per-pixel work under the decode wave,
  // so the scene was still black a third of the way through it and landed with a
  // pop. Recolour at idle from whatever screen you're on instead: the cache is
  // keyed on the same skin and jobs, so the stage is painted before the wave starts.
  const { prof, ready } = useQuest();
  useEffect(() => {
    if (inQuest || !ready) return undefined;
    const { K, jobs } = stageArt({ theme: prof.theme, hero: prof.hero, pet: prof.pet, tint: readTint() }, questSkin);
    return warmQuestSprites(K, jobs);
  }, [inQuest, ready, questSkin, prof.theme, prof.hero, prof.pet]); // eslint-disable-line react-hooks/exhaustive-deps

  // The live background brightens as the workout fills up.
  useEffect(() => {
    const sets = (activeWorkout?.exercises || []).flatMap((e) => e.sets || []);
    moodState.inWorkout = !!activeWorkout;
    moodState.progress = sets.length ? sets.filter((s) => s.completed).length / sets.length : 0;
  }, [activeWorkout]);

  // Jump to the workout tab when a workout *becomes* active (started, or
  // found on load) — not every time Programs is opened mid-workout, which made
  // Programs unreachable until the workout ended.
  const hadWorkout = useRef(false);
  useEffect(() => {
    const has = !!activeWorkout;
    if (has && !hadWorkout.current && tab === 'programs') {
      if (activeWorkout.quest) navigate('quest'); // so back from a quest goes to the quest screen
      navigate('workout');
    }
    hadWorkout.current = has;
  }, [activeWorkout, tab, navigate]);

  const handleNavExpanded = useCallback((v) => setNavExpanded(v), []);

  // Every tab shares this one scroll area — start each tab at the top instead
  // of wherever the last page was scrolled to.
  const scrollRef = useRef(null);
  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [tab]);
  // Screens that must fit in one view (the quest stage) size themselves to this.
  useEffect(() => observePage(scrollRef.current), []);

  return (
    <div className="min-h-dvh">
      <div
        // fixed inset-0, not h-dvh: an installed iOS PWA can report dvh short of the screen
        className="fixed inset-0 flex flex-col"
        // Apply filter only when expanded: `transition: filter` promotes this div
        // to its own layer in Chromium, which drops the body background (eg.
        // Sarah's Theme chamomile plates). Setting the whole style conditionally
        // keeps the shell as plain markup when idle.
        style={navExpanded ? { filter: 'grayscale(1)', transition: 'filter 0.4s ease' } : undefined}
      >
        <AppHeader />

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
          {/* A quest battle can go two columns on a wide screen; it keeps itself to max-w-2xl otherwise (FocusWorkout). */}
          <div className={`${tab === 'workout' && activeWorkout?.quest ? 'max-w-4xl' : 'max-w-2xl'} mx-auto h-full`}>
          {/* No AnimatePresence: mode="wait" holds the next tab until the old
              page reports its exit finished, and rapid tab changes (or a page
              swapping its root mid-exit) could leave that report missing — the
              old page then stayed on screen for good while the nav moved on.
              Pages still play their own entrance animation on mount. */}
            {tab === 'programs' && <ProgramsPage key="programs" onNavigate={navigate} />}
            {tab === 'workout' && <WorkoutPage key="workout" onNavigate={navigate} />}
            {tab === 'quest' && <QuestTitle key="quest" onNavigate={navigate} />}
            {tab === 'history' && <HistoryPage key="history" />}
            {tab === 'coach' && <CoachPage key="coach" />}
            {tab === 'recommendations' && <RecommendationsPage key="recommendations" />}
            {tab === 'aggression' && <AggressionPage key="aggression" />}
            {tab === 'settings' && <SettingsPage key="settings" />}
          </div>
        </div>
        {/* Spacer matching BottomNav height so flex-1 stops at the nav top on all devices */}
        <div className="flex-shrink-0" style={{ height: 'calc(60px + env(safe-area-inset-bottom, 0px) * 0.5)' }} />
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
          Focus/Dense/Quest card shows rest in-card, so the circle only floats on other tabs. */}
      <GlobalRestTimer hidden={tab === 'workout' && !!activeWorkout && (activeWorkout?.quest || ['focus', 'dense'].includes(workoutLayout()))} />
    </div>
  );
}

// /desk always opens the planner (and remembers that choice); /?phone switches
// this device back to the phone app. With no choice made, a computer (wide
// window, mouse or trackpad) gets the planner at the normal address too.
const DESK_KEY = 'gains-beta-desk';
function wantsDesk() {
  const { pathname, search } = window.location;
  let pref = null;
  try {
    if (pathname.startsWith('/desk')) localStorage.setItem(DESK_KEY, 'desk');
    else if (new URLSearchParams(search).has('phone')) localStorage.setItem(DESK_KEY, 'phone');
    pref = localStorage.getItem(DESK_KEY);
  } catch { /* private mode: fall through to the screen check */ }
  if (pathname.startsWith('/desk')) return true;
  if (pref === 'phone') return false;
  return window.innerWidth >= 1100 && window.matchMedia('(pointer: fine)').matches;
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { loading: dataLoading, loadAll, activeWorkout } = useWorkout();
  const { showToast, dismissTop } = useToast();

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
    return <PinGate />;
  }

  // The desktop planner: same account and data, its own big-screen layout.
  if (wantsDesk()) return <DeskApp />;

  return (
    <NavigationProvider
      onExitAttempt={() => showToast('Press back again to exit', 'info')}
      dismissOverlay={dismissTop}
      pathTo={(t) => (t === 'workout' && activeWorkout?.quest ? ['quest', 'workout'] : [t])}
    >
      <AppShell />
    </NavigationProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <WorkoutProvider>
            <TimerProvider>
              <ToastProvider>
                <HeaderMessageProvider>
                  <RepSensorProvider>
                    {/* The live waves background (was mounted by the Hostess copy's PIN gate) */}
                    <WaveBackground />
                    <AppContent />
                  </RepSensorProvider>
                </HeaderMessageProvider>
              </ToastProvider>
            </TimerProvider>
          </WorkoutProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
