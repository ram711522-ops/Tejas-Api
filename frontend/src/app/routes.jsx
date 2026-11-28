import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingState } from '../components/feedback/LoadingState';
import { AppShell } from '../components/layout/AppShell';

const OverviewDashboardPage = lazy(() =>
  import('../pages/OverviewDashboardPage').then((m) => ({ default: m.OverviewDashboardPage }))
);
const PlantsPage = lazy(() =>
  import('../pages/PlantsPage').then((m) => ({ default: m.PlantsPage }))
);
const PlantDetailsPage = lazy(() =>
  import('../pages/PlantDetailsPage').then((m) => ({ default: m.PlantDetailsPage }))
);
const ForecastsPage = lazy(() =>
  import('../pages/ForecastsPage').then((m) => ({ default: m.ForecastsPage }))
);
const ActualReadingsPage = lazy(() =>
  import('../pages/ActualReadingsPage').then((m) => ({ default: m.ActualReadingsPage }))
);
const AnalyticsPage = lazy(() =>
  import('../pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);
const AlertsPage = lazy(() =>
  import('../pages/AlertsPage').then((m) => ({ default: m.AlertsPage }))
);
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

function LazyRoute({ children }) {
  return (
    <Suspense fallback={<LoadingState variant="skeleton" rows={5} message="Loading sector..." />}>
      {children}
    </Suspense>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<Navigate to="/" replace />} />

      <Route path="/" element={<AppShell />}>
        <Route
          index
          element={
            <LazyRoute>
              <OverviewDashboardPage />
            </LazyRoute>
          }
        />
        <Route
          path="plants"
          element={
            <LazyRoute>
              <PlantsPage />
            </LazyRoute>
          }
        />
        <Route
          path="plants/:plantId"
          element={
            <LazyRoute>
              <PlantDetailsPage />
            </LazyRoute>
          }
        />
        <Route
          path="forecasts"
          element={
            <LazyRoute>
              <ForecastsPage />
            </LazyRoute>
          }
        />
        <Route
          path="readings"
          element={
            <LazyRoute>
              <ActualReadingsPage />
            </LazyRoute>
          }
        />
        <Route
          path="analytics"
          element={
            <LazyRoute>
              <AnalyticsPage />
            </LazyRoute>
          }
        />
        <Route
          path="alerts"
          element={
            <LazyRoute>
              <AlertsPage />
            </LazyRoute>
          }
        />
        <Route
          path="settings"
          element={
            <LazyRoute>
              <SettingsPage />
            </LazyRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
