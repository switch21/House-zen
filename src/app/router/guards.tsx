import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/context';
import { can, ROUTE_PERMISSIONS, type Permission } from '@/lib/permissions/rbac';
import { AppLayout } from '@/app/layouts/AppLayout';
import type { ReactNode } from 'react';

/** Blocks until session resolution completes; redirects to /login when anonymous.
 *  Redirects to /mfa-challenge when a verified factor exists but the session
 *  is still at AAL1 (MFA pending). */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.pendingMfa) {
    return <Navigate to="/mfa-challenge" replace state={{ from: location.pathname }} />;
  }
  return <AppLayout>{children ?? <Outlet />}</AppLayout>;
}

/** Route-level RBAC gate (UI layer — PostgreSQL RLS stays the authority). */
export function RequirePermission({ permission }: { permission: Permission }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (!can(session.role, permission)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-semibold">403</p>
        <p className="text-sm text-muted-foreground">errors.forbidden</p>
      </div>
    );
  }
  return <Outlet />;
}

export function permissionForPath(pathname: string): Permission | undefined {
  return ROUTE_PERMISSIONS[pathname];
}

/** Platform back-office gate: profiles.is_super_admin only (migration 059).
 *  Stricter than RequirePermission — membership roles never unlock /admin,
 *  even 'owner': the SQL RPCs reject them anyway, the UI must not tease. */
export function RequireSuperAdmin() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.pendingMfa) {
    return <Navigate to="/mfa-challenge" replace state={{ from: location.pathname }} />;
  }
  if (!session.isSuperAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-semibold">403</p>
        <p className="text-sm text-muted-foreground">errors.forbidden</p>
      </div>
    );
  }
  return <Outlet />;
}
