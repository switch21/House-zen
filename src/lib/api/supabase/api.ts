/**
 * HOUSE-ZEN — Production DataApi over Supabase.
 * All authorization is delegated to PostgreSQL RLS; mutations go through
 * SECURITY DEFINER RPCs (atomic reservation, check-in/out, finance) so business
 * rules cannot be bypassed by a modified client.
 */

import { getSupabaseClient } from '@/lib/supabase/client';
import type { DataApi, ListParams, Paginated } from '../types';
import type {
  AvailableRoomType,
  Notification,
  Payment,
  Quote,
  Reservation,
  ReservationStatus,
  Tenant,
  TenantPlanCode,
  UUID,
} from '@/types/domain';

type AnyRow = Record<string, unknown>;

export class SupabaseDataApi implements DataApi {
  private sb = getSupabaseClient();

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  }

  /* ============================ AUTH ============================ */

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return (await this.getSession())!;
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  async getSession() {
    const { data } = await this.sb.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const { data: profile } = await this.sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle<AnyRow>();
    const { data: memberships } = await this.sb
      .from('memberships')
      .select('tenant_id, role')
      .eq('user_id', user.id);
    const first = memberships?.[0];
    let tenant: Tenant | null = null;
    if (first) {
      const { data: t } = await this.sb
        .from('tenants')
        .select('*')
        .eq('id', first.tenant_id)
        .maybeSingle<AnyRow>();
      tenant = (t as unknown as Tenant) ?? null;
    }
    // AAL: a user owning a verified factor but sitting at AAL1 must complete
    // a TOTP challenge before reaching the app (Supabase Auth MFA).
    let pendingMfa = false;
    try {
      const { data: aal } = await this.sb.auth.mfa.getAuthenticatorAssuranceLevel();
      pendingMfa = aal?.currentLevel !== 'aal2' && aal?.nextLevel === 'aal2';
    } catch {
      pendingMfa = false;
    }
    return {
      userId: user.id,
      email: user.email ?? '',
      fullName: (profile?.full_name as string) ?? (user.email ?? ''),
      role: (first?.role as never) ?? 'receptionist',
      isSuperAdmin: Boolean(profile?.is_super_admin),
      tenant,
      memberships: (memberships ?? []) as { tenant_id: UUID; role: never }[],
      pendingMfa,
    };
  }

  onAuthChange(cb: (session: never) => void): () => void {
    // ⚠ Re-entrancy hazard (auth-js): auth events are emitted while the client
    // holds its internal navigator lock. Calling getSession() — which itself
    // calls auth.getUser()/mfa.getAuthenticatorAssuranceLevel() → acquireLock —
    // from INSIDE the callback deadlocks (the emitter waits for the callback,
    // the callback waits for the lock). Defer to a macrotask so the lock is
    // guaranteed released before we re-enter the auth API.
    const { data } = this.sb.auth.onAuthStateChange(() => {
      setTimeout(() => {
        this.getSession()
          .then((s) => cb(s as never))
          .catch((err) => console.error('[hz] onAuthChange getSession failed:', err?.message ?? err));
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }

  /* ============================ CRUD ============================ */

  async list<T>(entity: never, params?: ListParams): Promise<Paginated<T>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 100;
    let query = this.sb.from(entity).select('*', { count: 'exact' });
    for (const [key, value] of Object.entries(params?.filters ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      query = query.eq(key, value);
    }
    for (const [key, dir] of Object.entries(params?.sort ?? {})) {
      query = query.order(key, { ascending: dir === 'asc' });
    }
    const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(`${String(entity)}: ${error.message}`);
    return { items: (data ?? []) as T[], total: count ?? data?.length ?? 0, page, pageSize };
  }

  async get<T>(entity: never, id: UUID): Promise<T | null> {
    const { data } = await this.sb.from(entity).select('*').eq('id', id).maybeSingle<AnyRow>();
    return (data as T) ?? null;
  }

  async create<T extends { id?: UUID }>(entity: never, data: T): Promise<T> {
    const { data: created, error } = await this.sb
      .from(entity)
      .insert(data as never)
      .select('*')
      .maybeSingle<AnyRow>();
    if (error) throw new Error(`${String(entity)}: ${error.message}`);
    return created as T;
  }

  async update<T extends AnyRow>(entity: never, id: UUID, data: T): Promise<T> {
    const { data: updated, error } = await this.sb
      .from(entity)
      .update(data as never)
      .eq('id', id)
      .select('*')
      .maybeSingle<AnyRow>();
    if (error) throw new Error(`${String(entity)}: ${error.message}`);
    return updated as T;
  }

  async remove(entity: never, id: UUID): Promise<void> {
    const { error } = await this.sb.from(entity).delete().eq('id', id);
    if (error) throw new Error(`${String(entity)}: ${error.message}`);
  }

  /**
   * PII read path (migration 052): plaintext ID documents ONLY via the audited
   * RPC `hz_read_id_document` — RLS-protected, permission-checked
   * (customers.read / reservations.read), every access written to audit_logs.
   */
  readIdDocument(entity: 'customers' | 'reservation_guests', id: UUID): Promise<string | null> {
    return this.rpc<string | null>('hz_read_id_document', { p_entity: entity, p_id: id });
  }

  /* ==================== AVAILABILITY & RESERVATIONS ==================== */

  searchAvailableRoomTypes(
    propertyId: UUID,
    checkIn: string,
    checkOut: string,
    adults: number,
  ): Promise<AvailableRoomType[]> {
    return this.rpc<AvailableRoomType[]>('search_available_room_types', {
      p_property_id: propertyId,
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_adults: adults,
    });
  }

  quote(input: {
    property_id: UUID;
    room_type_id: UUID;
    room_id?: UUID;
    check_in_date: string;
    check_out_date: string;
    services?: { service_id: UUID; quantity: number }[];
  }): Promise<Quote> {
    return this.rpc<Quote>('compute_quote', {
      p_property_id: input.property_id,
      p_room_type_id: input.room_type_id,
      p_room_id: input.room_id ?? null,
      p_check_in: input.check_in_date,
      p_check_out: input.check_out_date,
      p_services: input.services ?? [],
    });
  }

  createReservationAtomic(input: Parameters<DataApi['createReservationAtomic']>[0]): Promise<Reservation> {
    return this.rpc<Reservation>('create_reservation_atomic', {
      p_property_id: input.property_id,
      p_customer_id: input.customer_id,
      p_room_id: input.room_id,
      p_room_type_id: input.room_type_id,
      p_check_in: input.check_in_date,
      p_check_out: input.check_out_date,
      p_adults: input.adults,
      p_children: input.children,
      p_notes: input.notes ?? null,
      p_source: input.source,
      p_services: input.services ?? [],
    });
  }

  updateReservationStatus(id: UUID, to: ReservationStatus, reason?: string): Promise<Reservation> {
    return this.rpc<Reservation>('update_reservation_status', {
      p_reservation_id: id,
      p_to_status: to,
      p_reason: reason ?? null,
    });
  }

  async performCheckin(reservationId: UUID): Promise<void> {
    await this.rpc('perform_checkin', { p_reservation_id: reservationId });
  }

  async performCheckout(reservationId: UUID, clearBalance: boolean): Promise<void> {
    await this.rpc('perform_checkout', { p_reservation_id: reservationId, p_clear_balance: clearBalance });
  }

  async setRoomHousekeepingState(roomId: UUID, to: 'DIRTY' | 'CLEANING' | 'INSPECTED' | 'CLEAN'): Promise<void> {
    await this.rpc('set_room_housekeeping_state', { p_room_id: roomId, p_to_state: to });
  }

  async setRoomOperationalStatus(roomId: UUID, to: 'OPERATIONAL' | 'UNDER_MAINTENANCE'): Promise<void> {
    await this.rpc('set_room_status', { p_room_id: roomId, p_to_status: to });
  }

  async createInvoiceFromReservation(reservationId: UUID): Promise<UUID> {
    return this.rpc<UUID>('create_invoice_from_reservation', { p_reservation_id: reservationId });
  }

  async issueInvoice(invoiceId: UUID): Promise<void> {
    await this.rpc('issue_invoice', { p_invoice_id: invoiceId });
  }

  async voidInvoice(invoiceId: UUID, reason: string): Promise<void> {
    await this.rpc('void_invoice', { p_invoice_id: invoiceId, p_reason: reason });
  }

  recordPayment(input: {
    invoice_id: UUID | null;
    reservation_id: UUID | null;
    amount: number;
    method: Payment['method'];
    idempotency_key?: string;
  }): Promise<Payment> {
    return this.rpc<Payment>('record_payment', {
      p_invoice_id: input.invoice_id,
      p_reservation_id: input.reservation_id,
      p_amount: input.amount,
      p_method: input.method,
      p_idempotency_key: input.idempotency_key ?? null,
    });
  }

  async kpis(_tenantId: UUID) {
    return this.rpc<never>('dashboard_kpis', {});
  }

  async listMyNotifications(): Promise<Notification[]> {
    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Notification[];
  }

  async markNotificationRead(id: UUID): Promise<void> {
    await this.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  }

  getSubscription(): Promise<{
    planCode: TenantPlanCode;
    usage: Record<string, number>;
    limits: Record<string, number>;
  }> {
    return this.rpc('get_subscription_context', {});
  }

  async changePlan(planCode: TenantPlanCode): Promise<void> {
    await this.rpc('change_plan', { p_plan_code: planCode });
  }

  async adminStats() {
    return this.rpc<never>('admin_stats', {});
  }

  async adminListTenants(): Promise<Tenant[]> {
    const { data, error } = await this.sb.from('tenants').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []) as Tenant[];
  }

  async adminSetTenantStatus(tenantId: UUID, status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'): Promise<void> {
    await this.rpc('admin_set_tenant_status', { p_tenant_id: tenantId, p_status: status });
  }

  async adminListFeatureFlags(): Promise<{ id: UUID; key: string; enabled: boolean }[]> {
    const { data, error } = await this.sb.from('feature_flags').select('id,key,enabled');
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: UUID; key: string; enabled: boolean }[];
  }

  async adminToggleFeatureFlag(id: UUID): Promise<void> {
    await this.rpc('admin_toggle_feature_flag', { p_flag_id: id });
  }

  publicProperty(slug: string) {
    return this.rpc<never>('public_property_details', { p_slug: slug });
  }

  publicSearchAvailability(
    slug: string,
    checkIn: string,
    checkOut: string,
    adults: number,
  ): Promise<AvailableRoomType[]> {
    return this.rpc<AvailableRoomType[]>('public_search_availability', {
      p_slug: slug,
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_adults: adults,
    });
  }

  publicCreateBooking(input: Parameters<DataApi['publicCreateBooking']>[0]) {
    return this.rpc<{ reference: string; reservation_id: UUID; total: number }>(
      'public_create_booking',
      {
        p_slug: input.property_slug,
        p_room_type_id: input.room_type_id,
        p_check_in: input.check_in_date,
        p_check_out: input.check_out_date,
        p_adults: input.adults,
        p_children: input.children,
        p_guest: input.guest,
        p_idempotency_key: input.idempotency_key,
      },
    );
  }
}
