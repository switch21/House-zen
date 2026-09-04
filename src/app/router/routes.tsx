import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate, Link } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './guards';
import { ROUTE_PERMISSIONS, type Permission } from '@/lib/permissions/rbac';
import { useI18n } from '@/lib/i18n/provider';

// ---------------------------------------------------------------------------
// Route-level code splitting — every page is a separate async chunk so the
// app shell (index.js) stays small and role-specific pages are only fetched
// by users who can actually reach them (perf budget, known-limitations §8).
// Each page module keeps its default export.
// ---------------------------------------------------------------------------
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const MfaChallengePage = lazy(() => import('@/features/auth/MfaChallengePage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const ReservationsPage = lazy(() => import('@/features/reservations/ReservationsPage'));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'));
const CheckinsPage = lazy(() => import('@/features/checkins/CheckinsPages').then((m) => ({ default: m.CheckinsPage })));
const CheckoutsPage = lazy(() => import('@/features/checkins/CheckinsPages').then((m) => ({ default: m.CheckoutsPage })));
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage'));
const HousekeepingPage = lazy(() => import('@/features/housekeeping/HousekeepingPage'));
const MaintenancePage = lazy(() => import('@/features/maintenance/MaintenancePage'));
const ServicesPage = lazy(() => import('@/features/services/ServicesPage'));
const RoomsPage = lazy(() => import('@/features/rooms/RoomsPage'));
const PropertiesPage = lazy(() => import('@/features/properties/PropertiesPage'));
const BuildingsPage = lazy(() => import('@/features/buildings/BuildingsPage'));
const RoomTypesPage = lazy(() => import('@/features/room-types/RoomTypesPage'));
const AmenitiesPage = lazy(() => import('@/features/amenities/AmenitiesPage'));
const RatesPage = lazy(() => import('@/features/rates/RatesPage'));
const InvoicesPage = lazy(() => import('@/features/invoices/InvoicesPage'));
const PaymentsPage = lazy(() => import('@/features/payments/PaymentsPage'));
const ExpensesPage = lazy(() => import('@/features/expenses/ExpensesPage'));
const SuppliersPage = lazy(() => import('@/features/suppliers/SuppliersPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const TeamPage = lazy(() => import('@/features/team/TeamPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const SubscriptionPage = lazy(() => import('@/features/subscriptions/SubscriptionPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const AuditPage = lazy(() => import('@/features/audit/AuditPage'));
const SuperAdminPage = lazy(() => import('@/features/super-admin/SuperAdminPage'));
const PublicBookingPage = lazy(() => import('@/features/public-booking/PublicBookingPage'));

/** Full-viewport loading placeholder shown while an async route chunk loads. */
function PageLoader() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center" role="status" aria-busy="true">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Wraps an async page in the shared Suspense boundary. */
function suspense(element: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p className="text-4xl font-bold">404</p>
      <p className="text-sm text-muted-foreground">{t('errors.notFound')}</p>
      <Link to="/app/dashboard" className="text-sm font-medium text-primary underline">
        {t('nav.dashboard')}
      </Link>
    </div>
  );
}

/**
 * Helper FUNCTION (not a component): called to produce <Route> elements.
 * React Router requires direct children of <Routes> to be <Route> nodes.
 */
function guarded(path: string, element: React.ReactNode) {
  const permission: Permission | undefined = ROUTE_PERMISSIONS[path];
  if (!permission) {
    return <Route key={path} path={path} element={suspense(element)} />;
  }
  return (
    <Route key={path} element={<RequirePermission permission={permission} />}>
      <Route path={path} element={suspense(element)} />
    </Route>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/login" element={suspense(<LoginPage />)} />
      <Route path="/mfa-challenge" element={suspense(<MfaChallengePage />)} />
      <Route path="/book/:propertySlug" element={suspense(<PublicBookingPage />)} />

      {/* App (authenticated + RBAC-guarded) */}
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
        {guarded('/app/dashboard', <DashboardPage />)}
        {guarded('/app/calendar', <CalendarPage />)}
        {guarded('/app/reservations', <ReservationsPage />)}
        {guarded('/app/checkins', <CheckinsPage />)}
        {guarded('/app/checkouts', <CheckoutsPage />)}
        {guarded('/app/customers', <CustomersPage />)}
        {guarded('/app/housekeeping', <HousekeepingPage />)}
        {guarded('/app/maintenance', <MaintenancePage />)}
        {guarded('/app/services', <ServicesPage />)}
        {guarded('/app/rooms', <RoomsPage />)}
        {guarded('/app/properties', <PropertiesPage />)}
        {guarded('/app/buildings', <BuildingsPage />)}
        {guarded('/app/room-types', <RoomTypesPage />)}
        {guarded('/app/amenities', <AmenitiesPage />)}
        {guarded('/app/rates', <RatesPage />)}
        {guarded('/app/invoices', <InvoicesPage />)}
        {guarded('/app/payments', <PaymentsPage />)}
        {guarded('/app/expenses', <ExpensesPage />)}
        {guarded('/app/suppliers', <SuppliersPage />)}
        {guarded('/app/reports', <ReportsPage />)}
        {guarded('/app/team', <TeamPage />)}
        {guarded('/app/settings', <SettingsPage />)}
        {guarded('/app/subscription', <SubscriptionPage />)}
        {guarded('/app/notifications', <NotificationsPage />)}
        {guarded('/app/audit', <AuditPage />)}
        {guarded('/admin', <SuperAdminPage />)}
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
