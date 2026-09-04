/**
 * HOUSE-ZEN — Super Admin · User management (migration 059).
 * Full CRUD over platform users (profiles ⋈ auth.users) plus tenant
 * assignment. Creating a user provisions the GoTrue auth row (SQL RPC);
 * "super admin" is a profile flag, memberships carry an operational role.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Trash2, Unlink, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import type { AdminUser } from '@/lib/api/types';
import type { UserRole, UUID } from '@/types/domain';

/** Membership roles only — "super_admin" is a profile flag, not a role. */
const ASSIGN_ROLES: Exclude<UserRole, 'super_admin'>[] = [
  'owner',
  'manager',
  'receptionist',
  'accountant',
  'housekeeping',
  'maintenance',
];
const LOCALES = ['fr', 'en', 'es', 'de', 'it', 'sw', 'ar'] as const;

const formatDate = (iso: string | null, locale: string) =>
  iso
    ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

export default function AdminUsersPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'create' | 'edit' | 'password' | 'assign' | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [userLocale, setUserLocale] = useState('fr');
  const [assignTenant, setAssignTenant] = useState<UUID | ''>('');
  const [assignRole, setAssignRole] = useState<Exclude<UserRole, 'super_admin'>>('receptionist');
  const [error, setError] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => getDataApi().adminListUsers(),
  });
  const { data: tenants } = useQuery({
    queryKey: ['admin', 'tenants-overview'],
    queryFn: () => getDataApi().adminTenantsOverview(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const fail = (e: unknown) => setError(String(e).replace(/^Error:\s*/, ''));

  const createUser = useMutation({
    mutationFn: () =>
      getDataApi().adminCreateUser({ email, full_name: fullName, locale: userLocale, password }),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: fail,
  });
  const updateUser = useMutation({
    mutationFn: () => getDataApi().adminUpdateUser(editing!.id, { full_name: fullName, locale: userLocale }),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: fail,
  });
  const setPasswordMut = useMutation({
    mutationFn: () => getDataApi().adminSetUserPassword(editing!.id, password),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: fail,
  });
  const assign = useMutation({
    mutationFn: () => getDataApi().adminAssignUserToTenant(editing!.id, assignTenant, assignRole),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: fail,
  });
  const unassign = useMutation({
    mutationFn: (membershipId: UUID) => getDataApi().adminRemoveUserFromTenant(membershipId),
    onSuccess: invalidate,
    onError: fail,
  });
  const deleteUser = useMutation({
    mutationFn: (id: UUID) => getDataApi().adminDeleteUser(id),
    onSuccess: invalidate,
    onError: fail,
  });

  const openCreate = () => {
    setEmail('');
    setFullName('');
    setPassword('');
    setUserLocale('fr');
    setError(null);
    setDialog('create');
  };
  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setFullName(u.full_name);
    setUserLocale(u.locale || 'fr');
    setError(null);
    setDialog('edit');
  };
  const openPassword = (u: AdminUser) => {
    setEditing(u);
    setPassword('');
    setError(null);
    setDialog('password');
  };
  const openAssign = (u: AdminUser) => {
    setEditing(u);
    setAssignTenant('');
    setAssignRole('receptionist');
    setError(null);
    setDialog('assign');
  };
  const onDelete = (u: AdminUser) => {
    if (!window.confirm(t('admin.deleteUserConfirm'))) return;
    deleteUser.mutate(u.id);
  };

  const busy =
    createUser.isPending || updateUser.isPending || setPasswordMut.isPending || assign.isPending;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('admin.users')}
        description={t('admin.usersHint')}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus size={15} /> {t('admin.newUser')}
          </Button>
        }
      />

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('admin.usersHint')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.email')}</TableHead>
                <TableHead>{t('admin.tenants')}</TableHead>
                <TableHead>{t('admin.created')}</TableHead>
                <TableHead>{t('admin.lastSignIn')}</TableHead>
                <TableHead className="text-end">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.full_name || '—'}
                    {u.is_super_admin ? (
                      <span className="ms-2 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {t('admin.superAdminFlag')}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>
                    {u.memberships.length === 0 ? (
                      <span className="text-xs text-muted-foreground">{t('admin.noMemberships')}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.memberships.map((m) => (
                          <span
                            key={m.membership_id}
                            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
                          >
                            {m.tenant_name} · {m.role}
                            <button
                              type="button"
                              title={t('admin.removeMembership')}
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => unassign.mutate(m.membership_id)}
                            >
                              <Unlink size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(u.created_at, locale)}</TableCell>
                  <TableCell className="text-xs">{formatDate(u.last_sign_in_at, locale)}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openAssign(u)}>
                        <UserPlus size={13} /> {t('admin.assignTenant')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                        <Pencil size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openPassword(u)}>
                        <KeyRound size={13} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(u)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create user */}
      <Dialog open={dialog === 'create'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.newUser')}</DialogTitle>
            <DialogDescription>{t('admin.newUserHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              {t('common.email')}
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              {t('common.name')}
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm">
              {t('admin.password')}
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              {t('admin.locale')}
              <Select value={userLocale} onValueChange={setUserLocale}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={busy || !email.trim() || password.length < 8} onClick={() => createUser.mutate()}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit profile */}
      <Dialog open={dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.editUser')}</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              {t('common.name')}
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm">
              {t('admin.locale')}
              <Select value={userLocale} onValueChange={setUserLocale}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => updateUser.mutate()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={dialog === 'password'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.resetPassword')}</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            {t('admin.newPassword')}
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={busy || password.length < 8} onClick={() => setPasswordMut.mutate()}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign to tenant */}
      <Dialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.assignTenant')}</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              {t('nav.adminTenants')}
              <Select value={assignTenant} onValueChange={setAssignTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(tenants ?? []).map((tn) => (
                    <SelectItem key={tn.id} value={tn.id}>
                      {tn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              {t('admin.role')}
              <Select value={assignRole} onValueChange={(v) => setAssignRole(v as typeof assignRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGN_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={busy || !assignTenant} onClick={() => assign.mutate()}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
