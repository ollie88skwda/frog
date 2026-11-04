import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ComponentType, lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppShell } from "@/components/app-shell";
import { AppErrorBoundary } from "@/components/error-boundary";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { RepoProvider } from "@/lib/repo";

// Once per tab: a stale-chunk reload already happened, so don't do it again.
const RELOAD_GUARD = "frog.stale-chunk-reloaded";

function claimReload(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_GUARD)) return false;
    sessionStorage.setItem(RELOAD_GUARD, "1");
    return true;
  } catch {
    // No sessionStorage (Safari private mode) means no guard, and an
    // unguarded reload can loop forever. Fail to the error card instead.
    return false;
  }
}

/**
 * `lazy()` for a route, hardened against a chunk that no longer exists.
 *
 * A hashed chunk from a superseded deploy is a real 404 — vercel.json keeps
 * `/assets/` out of the SPA rewrite — so a tab or installed PWA left open
 * across a release fails every route import from then on, and React's answer
 * to that is to unmount the app. Retry once (clears a transient blip), then
 * reload the document exactly once per tab, which fetches the new index.html
 * and with it the live chunk names. When the guard is already spent the error
 * falls through to <AppErrorBoundary>, which offers the reload as a button
 * rather than a blank screen. docs/DECISIONS.md 2026-08-25.
 *
 * The two dev-only lazies further down stay on bare `lazy()`: they never ship,
 * and their dead-branch shape is what scripts/check-bundle.ts gates.
 */
function lazyRoute<T extends ComponentType>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await load();
    } catch {
      try {
        return await load();
      } catch (retryError) {
        if (!claimReload()) throw retryError;
        window.location.reload();
        // The document is being replaced — never resolve, so Suspense holds
        // its fallback instead of flashing the error card on the way out.
        return new Promise<{ default: T }>(() => {});
      }
    }
  });
}

// Home is lazy like every route: the shell paints instantly and the findings
// teaser it pulls in (findings engine) stays out of the eager chunk.
const HomeScreen = lazyRoute(() => import("@/screens/home"));
const AuthScreen = lazyRoute(() => import("@/screens/auth"));
const TrainScreen = lazyRoute(() => import("@/screens/train"));
const RoutinesScreen = lazyRoute(() => import("@/screens/routines"));
const RoutineEditScreen = lazyRoute(() => import("@/screens/routine-edit"));
const ProgramsScreen = lazyRoute(() => import("@/screens/programs"));
const TrainerScreen = lazyRoute(() => import("@/screens/trainer"));
const ProfileScreen = lazyRoute(() => import("@/screens/profile"));
const CalendarScreen = lazyRoute(() => import("@/screens/calendar"));
const SessionScreen = lazyRoute(() => import("@/screens/session"));
const LibraryScreen = lazyRoute(() => import("@/screens/library"));
const ExerciseDetailScreen = lazyRoute(
  () => import("@/screens/exercise-detail"),
);
const HistoryScreen = lazyRoute(() => import("@/screens/history"));
const HistoryDetailScreen = lazyRoute(() => import("@/screens/history-detail"));
const FindingsScreen = lazyRoute(() => import("@/screens/findings"));
const MeasuresScreen = lazyRoute(() => import("@/screens/measures"));
const StatsScreen = lazyRoute(() => import("@/screens/stats"));
const MonthlyReportScreen = lazyRoute(() => import("@/screens/monthly-report"));
const YearReviewScreen = lazyRoute(() => import("@/screens/year-review"));
const SettingsScreen = lazyRoute(() => import("@/screens/settings"));
const TipsScreen = lazyRoute(() => import("@/screens/tips"));
const ChangelogScreen = lazyRoute(() => import("@/screens/changelog"));
const NotFoundScreen = lazyRoute(() => import("@/screens/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 15_000 },
    mutations: { retry: 3 },
  },
});

// Click-to-comment overlay (src/dev/annotate/) — dev-only, off by default,
// toggled with the bare A key or its floating button. Both conditions fold to a
// literal `false` in a production build, so Rollup drops the dynamic import and
// the whole subtree with it. VITE_E2E builds keep it so Playwright can drive the
// real thing; that build is already non-production (it also carries the
// __frog auth bridge). scripts/check-bundle.ts fails the build if it ever
// reaches production.
const AnnotateOverlay =
  import.meta.env.DEV || import.meta.env.VITE_E2E === "1"
    ? lazy(() => import("@/dev/annotate"))
    : null;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Look-and-feel = the Because green tokens in styles/theme.css; the
          day/night mode is set pre-paint by index.html (lib/theme.ts). */}
      <AppErrorBoundary>
        <AuthProvider>
          <RepoProvider>
            <BrowserRouter>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/auth" element={<AuthScreen />} />
                  <Route element={<RequireAuth />}>
                    <Route element={<AppShell />}>
                      <Route index element={<HomeScreen />} />
                      <Route path="train" element={<TrainScreen />} />
                      <Route path="routines" element={<RoutinesScreen />} />
                      <Route
                        path="routines/new"
                        element={<RoutineEditScreen />}
                      />
                      <Route
                        path="routines/:id/edit"
                        element={<RoutineEditScreen />}
                      />
                      <Route path="programs" element={<ProgramsScreen />} />
                      <Route
                        path="programs/:key"
                        element={<ProgramsScreen />}
                      />
                      <Route path="trainer" element={<TrainerScreen />} />
                      <Route path="profile" element={<ProfileScreen />} />
                      <Route path="calendar" element={<CalendarScreen />} />
                      <Route path="session/:id" element={<SessionScreen />} />
                      <Route path="library" element={<LibraryScreen />} />
                      <Route
                        path="exercises/:id"
                        element={<ExerciseDetailScreen />}
                      />
                      <Route path="history" element={<HistoryScreen />} />
                      <Route
                        path="history/:id"
                        element={<HistoryDetailScreen />}
                      />
                      <Route path="findings" element={<FindingsScreen />} />
                      <Route path="measures" element={<MeasuresScreen />} />
                      <Route path="stats" element={<StatsScreen />} />
                      <Route
                        path="stats/monthly"
                        element={<MonthlyReportScreen />}
                      />
                      <Route path="stats/year" element={<YearReviewScreen />} />
                      <Route path="settings" element={<SettingsScreen />} />
                      <Route path="tips" element={<TipsScreen />} />
                      <Route path="changelog" element={<ChangelogScreen />} />
                      <Route path="*" element={<NotFoundScreen />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </RepoProvider>
        </AuthProvider>
      </AppErrorBoundary>
      {AnnotateOverlay && (
        <Suspense fallback={null}>
          <AnnotateOverlay />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
