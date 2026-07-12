import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppShell } from "@/components/app-shell";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { RepoProvider } from "@/lib/repo";

import TrainScreen from "@/screens/train";

const AuthScreen = lazy(() => import("@/screens/auth"));
const SessionScreen = lazy(() => import("@/screens/session"));
const LibraryScreen = lazy(() => import("@/screens/library"));
const HistoryScreen = lazy(() => import("@/screens/history"));
const FindingsScreen = lazy(() => import("@/screens/findings"));
const SettingsScreen = lazy(() => import("@/screens/settings"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 15_000 },
    mutations: { retry: 3 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RepoProvider>
          <BrowserRouter>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/auth" element={<AuthScreen />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppShell />}>
                    <Route index element={<TrainScreen />} />
                    <Route path="session/:id" element={<SessionScreen />} />
                    <Route path="library" element={<LibraryScreen />} />
                    <Route path="history" element={<HistoryScreen />} />
                    <Route path="findings" element={<FindingsScreen />} />
                    <Route path="settings" element={<SettingsScreen />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </RepoProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
