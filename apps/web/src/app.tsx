import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { AppShell } from "@/components/app-shell";
import { AppErrorBoundary } from "@/components/error-boundary";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { lazyRoute } from "@/lib/lazy-route";
import { RepoProvider } from "@/lib/repo";

// Home is lazy like every route: the shell paints instantly and the findings
// teaser it pulls in (findings engine) stays out of the eager chunk.
const HomeScreen = lazyRoute(() => import("@/screens/home"));
const AuthScreen = lazyRoute(() => import("@/screens/auth"));
const PlanScreen = lazyRoute(() => import("@/screens/plan"));
const YouScreen = lazyRoute(() => import("@/screens/you"));
const ProgressScreen = lazyRoute(() => import("@/screens/progress"));
const ProgramBuilderScreen = lazyRoute(
  () => import("@/screens/program-builder"),
);
const RoutineEditScreen = lazyRoute(() => import("@/screens/routine-edit"));
const ProgramsScreen = lazyRoute(() => import("@/screens/programs"));
const SessionScreen = lazyRoute(() => import("@/screens/session"));
const ExerciseDetailScreen = lazyRoute(
  () => import("@/screens/exercise-detail"),
);
const HistoryScreen = lazyRoute(() => import("@/screens/history"));
const HistoryDetailScreen = lazyRoute(() => import("@/screens/history-detail"));
const MonthlyReportScreen = lazyRoute(() => import("@/screens/monthly-report"));
const YearReviewScreen = lazyRoute(() => import("@/screens/year-review"));
const TipsScreen = lazyRoute(() => import("@/screens/tips"));
const ChangelogScreen = lazyRoute(() => import("@/screens/changelog"));
const NotFoundScreen = lazyRoute(() => import("@/screens/not-found"));

// Dev-only data-kit gallery (J5). Same dead-branch shape as the annotate overlay
// below: folds to `null` in production so Rollup drops the route and its chunk.
// data-kit.tsx renders inside the app router (no MemoryRouter of its own).
const DataKitScreen =
  import.meta.env.DEV || import.meta.env.VITE_E2E === "1"
    ? lazy(() => import("@/dev/data-kit"))
    : null;

/** Redirect that keeps the query string (e.g. /library?new=1 -> /plan?s=library&new=1). */
function RedirectTo({ to, search }: { to: string; search?: string }) {
  const { search: current } = useLocation();
  const extra = new URLSearchParams(current);
  const base = new URLSearchParams(search);
  for (const [k, v] of extra) if (!base.has(k)) base.set(k, v);
  const q = base.toString();
  return <Navigate to={`${to}${q ? `?${q}` : ""}`} replace />;
}

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
                      {/* Four tabs: Today / Plan / Progress / You (redesign §7). */}
                      <Route path="plan" element={<PlanScreen />} />
                      <Route
                        path="plan/build"
                        element={<ProgramBuilderScreen />}
                      />
                      <Route path="progress" element={<ProgressScreen />} />
                      <Route path="you" element={<YouScreen />} />
                      <Route path="you/rules" element={<TipsScreen />} />
                      <Route path="changelog" element={<ChangelogScreen />} />
                      <Route
                        path="routines/new"
                        element={<RoutineEditScreen />}
                      />
                      <Route
                        path="routines/:id/edit"
                        element={<RoutineEditScreen />}
                      />
                      <Route
                        path="programs/:key"
                        element={<ProgramsScreen />}
                      />
                      <Route path="session/:id" element={<SessionScreen />} />
                      <Route
                        path="exercises/:id"
                        element={<ExerciseDetailScreen />}
                      />
                      <Route path="history" element={<HistoryScreen />} />
                      <Route
                        path="history/:id"
                        element={<HistoryDetailScreen />}
                      />
                      <Route
                        path="progress/monthly"
                        element={<MonthlyReportScreen />}
                      />
                      <Route
                        path="progress/year"
                        element={<YearReviewScreen />}
                      />
                      {DataKitScreen && (
                        <Route
                          path="dev/data-kit"
                          element={<DataKitScreen />}
                        />
                      )}
                      {/* Old deep links keep working (§7). */}
                      <Route path="train" element={<RedirectTo to="/" />} />
                      <Route path="trainer" element={<RedirectTo to="/" />} />
                      <Route
                        path="routines"
                        element={<RedirectTo to="/plan" search="s=routines" />}
                      />
                      <Route
                        path="programs"
                        element={<RedirectTo to="/plan" />}
                      />
                      <Route
                        path="library"
                        element={<RedirectTo to="/plan" search="s=library" />}
                      />
                      <Route
                        path="stats"
                        element={<RedirectTo to="/progress" />}
                      />
                      <Route
                        path="stats/monthly"
                        element={<RedirectTo to="/progress/monthly" />}
                      />
                      <Route
                        path="stats/year"
                        element={<RedirectTo to="/progress/year" />}
                      />
                      <Route
                        path="findings"
                        element={<RedirectTo to="/progress" search="s=lab" />}
                      />
                      <Route
                        path="calendar"
                        element={<RedirectTo to="/progress" search="s=lab" />}
                      />
                      <Route
                        path="measures"
                        element={<RedirectTo to="/progress" search="s=body" />}
                      />
                      <Route
                        path="profile"
                        element={<RedirectTo to="/you" />}
                      />
                      <Route
                        path="settings"
                        element={<RedirectTo to="/you" search="s=settings" />}
                      />
                      <Route
                        path="tips"
                        element={<RedirectTo to="/you/rules" />}
                      />
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
