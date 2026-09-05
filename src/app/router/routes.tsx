import { Suspense } from 'react';
import { lazyRetry } from './lazyRetry';
import { Route, Routes, Navigate, Link } from 'react-router-dom';
import { RequireAuth, RequirePermission, RequireSuperAdmin } from './guards';
import { ROUTE_PERMISSIONS, type Permission } from '@/lib/permissions/rbac';
import { useI18n } from '@/lib/i18n/provider';
import { useAuth } from '@/lib/auth/context';

// ---------------------------------------------------------------------------
// Route-level code splitting — every page is a separate async chunk so the
// app shell (index.js) stays small and role-specific pages are only fetched
// by users who can actually reach them (perf budget, known-limitations §8).
// Each page module keeps its default export.
// lazyRetry() adds one auto-reload when a chunk 404s after a redeploy
// (stale tab + immutable /assets caching) instead of crashing to white screen.
// ---------------------------------------------------------------------------
const LoginPage = lazyRetry(() => import('@/features/auth/LoginPage'));
const MfaChallengePage = lazyRetry(() => import('@/features/auth/MfaChallengePage'));
const DashboardPage = lazyRetry(() => import('@/features/dashboard/DashboardPage'));
const ReservationsPage = lazyRetry(() => import('@/features/reservations/ReservationsPage'));
const CalendarPage = lazyRetry(() => import('@/features/calendar/CalendarPage'));
const CheckinsPage = lazyRetry(() => import('@/features/checkins/CheckinsPages').then((m) => ({ default: m.CheckinsPage })));
const CheckoutsPage = lazyRetry(() => import('@/features/checkins/CheckinsPages').then((m) => ({ default: m.CheckoutsPage })));
const CustomersPage = lazyRetry(() => import('@/features/customers/CustomersPage'));
const CustomerDetailPage = lazyRetry(() => import('@/features/customers/CustomerDetailPage'));
const HousekeepingPage = lazyRetry(() => import('@/features/housekeeping/HousekeepingPage'));
const MaintenancePage = lazyRetry(() => import('@/features/maintenance/MaintenancePage'));
const ServicesPage = lazyRetry(() => import('@/features/services/ServicesPage'));
const RoomsPage = lazyRetry(() => import('@/features/rooms/RoomsPage'));
const PropertiesPage = lazyRetry(() => import('@/features/properties/PropertiesPage'));
const BuildingsPage = lazyRetry(() => import('@/features/buildings/BuildingsPage'));
const RoomTypesPage = lazyRetry(() => import('@/features/room-types/RoomTypesPage'));
const AmenitiesPage = lazyRetry(() => import('@/features/amenities/AmenitiesPage'));
const RatesPage = lazyRetry(() => import('@/features/rates/RatesPage'));
const InvoicesPage = lazyRetry(() => import('@/features/invoices/InvoicesPage'));
const PaymentsPage = lazyRetry(() => import('@/features/payments/PaymentsPage'));
const ExpensesPage = lazyRetry(() => import('@/features/expenses/ExpensesPage'));
const SuppliersPage = lazyRetry(() => import('@/features/suppliers/SuppliersPage'));
const ReportsPage = lazyRetry(() => import('@/features/reports/ReportsPage'));
const TeamPage = lazyRetry(() => import('@/features/team/TeamPage'));
const SettingsPage = lazyRetry(() => import('@/features/settings/SettingsPage'));
const SubscriptionPage = lazyRetry(() => import('@/features/subscriptions/SubscriptionPage'));
const NotificationsPage = lazyRetry(() => import('@/features/notifications/NotificationsPage'));
const AuditPage = lazyRetry(() => import('@/features/audit/AuditPage'));
const AdminLayout = lazyRetry(() => import('@/features/super-admin/AdminLayout'));
const AdminDashboardPage = lazyRetry(() => import('@/features/super-admin/AdminDashboardPage'));
const AdminTenantsPage = lazyRetry(() => import('@/features/super-admin/AdminTenantsPage'));
const AdminUsersPage = lazyRetry(() => import('@/features/super-admin/AdminUsersPage'));
const AdminPlansPage = lazyRetry(() => import('@/features/super-admin/AdminPlansPage'));
const AdminSecurityPage = lazyRetry(() => import('@/features/super-admin/AdminSecurityPage'));
const PublicBookingPage = lazyRetry(() => import('@/features/public-booking/PublicBookingPage'));

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

/**
 * Entry redirect: authenticated users land where their session makes sense.
 * Platform super admins (no tenant) go straight to the back-office; MFA-pending
 * sessions are routed to the challenge first; anonymous visitors to /login.
 */
function HomeRedirect() {
  const { session, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (session.pendingMfa) return <Navigate to="/mfa-challenge" replace />;
  if (session.isSuperAdmin && !session.tenant) return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/app/dashboard" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={suspense(<LoginPage />)} />
      <Route path="/mfa-challenge" element={suspense(<MfaChallengePage />)} />
      <Route path="/book/:propertySlug" element={suspense(<PublicBookingPage />)} />

      {/* App (authenticated + RBAC-guarded) */}
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<HomeRedirect />} />
        {guarded('/app/dashboard', <DashboardPage />)}
        {guarded('/app/calendar', <CalendarPage />)}
        {guarded('/app/reservations', <ReservationsPage />)}
        {guarded('/app/checkins', <CheckinsPage />)}
        {guarded('/app/checkouts', <CheckoutsPage />)}
        {guarded('/app/customers', <CustomersPage />)}
        {guarded('/app/customers/:id', <CustomerDetailPage />)}
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

        {/* Platform back-office — profiles.is_super_admin only (spec §31). */}
        <Route path="/admin" element={<RequireSuperAdmin />}>
          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={suspense(<AdminDashboardPage />)} />
            <Route path="tenants" element={suspense(<AdminTenantsPage />)} />
            <Route path="users" element={suspense(<AdminUsersPage />)} />
            <Route path="plans" element={suspense(<AdminPlansPage />)} />
            <Route path="security" element={suspense(<AdminSecurityPage />)} />
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
