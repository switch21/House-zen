import { Route, Routes, Navigate, Link } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './guards';
import { ROUTE_PERMISSIONS, type Permission } from '@/lib/permissions/rbac';
import { useI18n } from '@/lib/i18n/provider';

import LoginPage from '@/features/auth/LoginPage';
import MfaChallengePage from '@/features/auth/MfaChallengePage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import ReservationsPage from '@/features/reservations/ReservationsPage';
import CalendarPage from '@/features/calendar/CalendarPage';
import { CheckinsPage, CheckoutsPage } from '@/features/checkins/CheckinsPages';
import CustomersPage from '@/features/customers/CustomersPage';
import HousekeepingPage from '@/features/housekeeping/HousekeepingPage';
import MaintenancePage from '@/features/maintenance/MaintenancePage';
import ServicesPage from '@/features/services/ServicesPage';
import RoomsPage from '@/features/rooms/RoomsPage';
import PropertiesPage from '@/features/properties/PropertiesPage';
import BuildingsPage from '@/features/buildings/BuildingsPage';
import RoomTypesPage from '@/features/room-types/RoomTypesPage';
import AmenitiesPage from '@/features/amenities/AmenitiesPage';
import RatesPage from '@/features/rates/RatesPage';
import InvoicesPage from '@/features/invoices/InvoicesPage';
import PaymentsPage from '@/features/payments/PaymentsPage';
import ExpensesPage from '@/features/expenses/ExpensesPage';
import SuppliersPage from '@/features/suppliers/SuppliersPage';
import ReportsPage from '@/features/reports/ReportsPage';
import TeamPage from '@/features/team/TeamPage';
import SettingsPage from '@/features/settings/SettingsPage';
import SubscriptionPage from '@/features/subscriptions/SubscriptionPage';
import NotificationsPage from '@/features/notifications/NotificationsPage';
import AuditPage from '@/features/audit/AuditPage';
import SuperAdminPage from '@/features/super-admin/SuperAdminPage';
import PublicBookingPage from '@/features/public-booking/PublicBookingPage';

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
    return <Route key={path} path={path} element={element} />;
  }
  return (
    <Route key={path} element={<RequirePermission permission={permission} />}>
      <Route path={path} element={element} />
    </Route>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa-challenge" element={<MfaChallengePage />} />
      <Route path="/book/:propertySlug" element={<PublicBookingPage />} />

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
