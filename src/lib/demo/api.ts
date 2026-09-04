/**
 * HOUSE-ZEN — Demo DataApi (documented demo mode).
 * Implements the same semantics as the production Supabase path:
 * tenant scoping, availability engine, atomic reservation creation,
 * controlled state machines, immutable issued invoices, idempotent payments.
 * Single-threaded JS gives atomicity; the overlap re-check inside
 * createReservationAtomic mirrors the SQL SERIALIZABLE/locking path.
 */

import {
  DomainError,
  type AvailableRoomType,
  type Notification,
  type Tenant,
  type Payment,
  type Quote,
  type Reservation,
  type TenantPlanCode,
  type UUID,
} from '@/types/domain';
import type {
  AdminStats,
  AuthSession,
  CreateReservationInput,
  DataApi,
  EntityName,
  KPIs,
  ListParams,
  Paginated,
  PublicBookingInput,
  RecordPaymentInput,
} from '@/lib/api/types';
import { dataChangeBus, type RealtimeEventType } from '@/lib/realtime/bus';
import { demoMfaStore } from '@/lib/demo/mfa-store';
import { buildSeed, DEMO_TENANT_ID, type DemoDB, type DemoUser, type Row } from './store';
import {
  addMoney,
  mulMoney,
  nightsBetween,
  percentOf,
  rangesOverlap,
  roundMoney,
  subMoney,
  todayISO,
  addDaysISO,
} from '@/lib/utils/money-dates';
import { normalizeSearch, uuid } from '@/lib/utils';

const BLOCKING_STATUSES: Reservation['status'][] = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

function nowISO(): string {
  return new Date().toISOString();
}

export class DemoDataApi implements DataApi {
  private db: DemoDB;
  private listeners = new Set<(s: AuthSession | null) => void>();
  private static readonly SESSION_KEY = 'house-zen.demo-session';

  constructor(db?: DemoDB) {
    this.db = db ?? buildSeed();
    // Demo-mode session persistence (documented: UI convenience only; production
    // uses Supabase Auth persistSession). sessionStorage = non-critical cache.
    try {
      const uid = sessionStorage.getItem(DemoDataApi.SESSION_KEY);
      if (uid) {
        const user = this.db.users.find((u) => u.id === uid);
        if (user) this.db.sessions.set('current', user);
      }
    } catch {
      /* non-critical */
    }
  }

  /**
   * SECURITY DEFINER analog: run fn under a system tenant context (public
   * booking engine). The engine writes tenant-scoped rows exactly as
   * create_reservation_atomic does server-side.
   */
  private async withSystemTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.db.sessions.get('current');
    const systemUser = this.db.users.find((u) => u.id === 'u-superadmin') ?? this.db.users[0];
    this.db.sessions.set('current', { ...systemUser, tenant_id: tenantId, is_super_admin: false } as DemoUser);
    try {
      return await fn();
    } finally {
      if (prev) this.db.sessions.set('current', prev);
      else this.db.sessions.delete('current');
    }
  }

  /** Test seam: expose the raw store (used by isolation tests). */
  getStore(): DemoDB {
    return this.db;
  }

  /* ============================ AUTH ============================ */

  async signIn(email: string, password: string): Promise<AuthSession> {
    const user = this.db.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    if (!user) throw new DomainError('VALIDATION', 'Invalid credentials');
    this.db.sessions.set('current', user);
    try {
      sessionStorage.setItem(DemoDataApi.SESSION_KEY, user.id);
    } catch {
      /* non-critical */
    }
    const session = this.buildSession(user);
    this.listeners.forEach((l) => l(session));
    return session;
  }

  async signOut(): Promise<void> {
    this.db.sessions.delete('current');
    try {
      sessionStorage.removeItem(DemoDataApi.SESSION_KEY);
    } catch {
      /* non-critical */
    }
    this.listeners.forEach((l) => l(null));
  }

  async getSession(): Promise<AuthSession | null> {
    const user = this.db.sessions.get('current');
    return user ? this.buildSession(user) : null;
  }

  onAuthChange(cb: (session: AuthSession | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private buildSession(user: DemoUser): AuthSession {
    const tenantRow = user.tenant_id
      ? this.db.tenants.find((t) => t.id === user.tenant_id)
      : null;
    // MFA mirror: pending when a verified factor exists but the session has
    // not passed a challenge yet (AAL1 < AAL2 in the production path).
    const verifiedFactors = user.is_super_admin || user.tenant_id
      ? demoMfaStore.verifiedFactors(user.id)
      : [];
    const pendingMfa = verifiedFactors.length > 0 && !demoMfaStore.sessionIsAal2();
    return {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isSuperAdmin: user.is_super_admin,
      tenant: (tenantRow as unknown as AuthSession['tenant']) ?? null,
      memberships: user.tenant_id ? [{ tenant_id: user.tenant_id, role: user.role }] : [],
      pendingMfa,
    };
  }

  private currentUser(): DemoUser {
    const user = this.db.sessions.get('current');
    if (!user) throw new DomainError('PERMISSION_DENIED', 'Not signed in');
    return user;
  }

  /** Tenant scope — mirrors RLS: rows are only visible within the user's tenant. */
  private scope(): string {
    const user = this.currentUser();
    if (user.is_super_admin) return user.tenant_id ?? DEMO_TENANT_ID;
    if (!user.tenant_id) throw new DomainError('PERMISSION_DENIED', 'No tenant membership');
    return user.tenant_id;
  }

  private table(entity: EntityName): Row[] {
    const t = this.db as unknown as Record<string, Row[]>;
    const rows = t[entity];
    if (!rows) throw new DomainError('NOT_FOUND', `Unknown entity ${entity}`);
    return rows;
  }

  /* ============================ CRUD ============================ */

  async list<T>(entity: EntityName, params?: ListParams): Promise<Paginated<T>> {
    const user = this.currentUser();
    let rows = this.table(entity).slice();
    const isSuper = user.is_super_admin;
    const scopeTenant = this.scopeSafe(entity, isSuper);
    if (scopeTenant !== null) {
      rows = rows.filter((r) => r.tenant_id === scopeTenant);
    }

    if (params?.filters) {
      for (const [key, value] of Object.entries(params.filters)) {
        if (value === undefined || value === null || value === '') continue;
        rows = rows.filter((r) => r[key] === value);
      }
    }
    if (params?.search) {
      const q = normalizeSearch(params.search);
      rows = rows.filter((r) =>
        Object.values(r).some((v) => typeof v === 'string' && normalizeSearch(v).includes(q)),
      );
    }
    if (params?.sort) {
      for (const [key, dir] of Object.entries(params.sort)) {
        rows.sort((a, b) => {
          const av = a[key];
          const bv = b[key];
          const cmp = av === bv ? 0 : (av as number) > (bv as number) ? 1 : -1;
          return dir === 'desc' ? -cmp : cmp;
        });
      }
    }
    const total = rows.length;
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 100;
    const items = rows.slice((page - 1) * pageSize, page * pageSize);
    return { items: items as T[], total, page, pageSize };
  }

  /** Super admin sees cross-tenant only for admin entities; regular tables stay scoped. */
  private scopeSafe(entity: EntityName, isSuper: boolean): string | null {
    const globalEntities: EntityName[] = ['plans', 'feature_flags'];
    if (isSuper && globalEntities.includes(entity)) return null;
    return this.scope();
  }

  async get<T>(entity: EntityName, id: UUID): Promise<T | null> {
    const rows = await this.list<T>(entity, { filters: { id } });
    return rows.items[0] ?? null;
  }

  async create<T extends { id?: UUID }>(entity: EntityName, data: T): Promise<T> {
    const rec = data as Record<string, unknown>;
    const row: Row = {
      ...rec,
      id: (data.id as UUID | undefined) ?? uuid(),
      tenant_id: (rec.tenant_id as string | null | undefined) ?? this.scope(),
      created_at: (rec.created_at as string | undefined) ?? nowISO(),
    };
    this.table(entity).push(row);
    this.audit(`${entity}.created`, entity, row.id, null, row);
    this.emitChange(entity, 'INSERT', row.id);
    return row as unknown as T;
  }

  async update<T extends Record<string, unknown>>(entity: EntityName, id: UUID, data: T): Promise<T> {
    const rows = this.table(entity);
    const idx = rows.findIndex((r) => r.id === id && r.tenant_id === this.scope());
    if (idx === -1) throw new DomainError('NOT_FOUND', `${entity} ${id} not found in your tenant`);
    const before = { ...rows[idx] };
    rows[idx] = { ...rows[idx], ...data } as Row;
    this.audit(`${entity}.updated`, entity, id, before, rows[idx]);
    this.emitChange(entity, 'UPDATE', id);
    return rows[idx] as unknown as T;
  }

  async remove(entity: EntityName, id: UUID): Promise<void> {
    const rows = this.table(entity);
    const idx = rows.findIndex((r) => r.id === id && r.tenant_id === this.scope());
    if (idx === -1) throw new DomainError('NOT_FOUND', `${entity} ${id} not found`);
    const [removed] = rows.splice(idx, 1);
    this.audit(`${entity}.deleted`, entity, id, removed, null);
    this.emitChange(entity, 'DELETE', id);
  }

  /**
   * PII read path (mirror of migration 052 `hz_read_id_document`): unknown id →
   * null (no existence leak across tenants), known id → stored value. DEMO
   * SIMULATION: values live in memory unencrypted; in production the SQL RPC
   * decrypts at-rest ciphertext and writes pii.id_document.read to audit_logs
   * before returning. Permission enforcement here stays with the same client
   * guards as every other demo method (documented limitation of demo mode).
   */
  async readIdDocument(entity: 'customers' | 'reservation_guests', id: UUID): Promise<string | null> {
    // Mirror SQL order: resolve the auth context FIRST (throws when signed
    // out), then look the row up in the tenant scope.
    const tenant = this.scope();
    const row = this.table(entity).find((r) => r.id === id && r.tenant_id === tenant);
    if (!row) return null;
    return (row.id_document as string | undefined) ?? null;
  }

  /**
   * Realtime mirror: emits on the in-process bus what the SQL path delivers
   * through Supabase Realtime `postgres_changes` (same events, no network).
   */
  private emitChange(entity: EntityName, type: RealtimeEventType, id: string | null): void {
    let tenantId: string | null = null;
    try {
      tenantId = this.scope();
    } catch {
      tenantId = null;
    }
    dataChangeBus.emit({ entity, type, id, tenantId });
  }

  private audit(
    action: string,
    entity: string,
    entityId: string | null,
    before: unknown,
    after: unknown,
  ): void {
    let actor: string | null = null;
    let tenant: string | null = null;
    try {
      actor = this.currentUser().id;
      tenant = this.scope();
    } catch {
      /* public actions */
    }
    this.db.audit_logs.push({
      id: uuid(), tenant_id: tenant, actor_id: actor, action, entity, entity_id: entityId,
      before: before as Record<string, unknown> | null,
      after: after as Record<string, unknown> | null,
      request_id: null, created_at: nowISO(),
    });
  }

  /* ==================== AVAILABILITY (single engine) ==================== */

  /** Blocking reservations overlapping the window for a given room. */
  private roomBlocked(roomId: UUID, checkIn: string, checkOut: string): boolean {
    const itemRoomIds = new Set(
      this.db.reservation_items.filter((ri) => ri.room_id === roomId).map((ri) => ri.reservation_id),
    );
    return this.db.reservations.some(
      (r) =>
        itemRoomIds.has(r.id) &&
        BLOCKING_STATUSES.includes(r.status as Reservation['status']) &&
        rangesOverlap(checkIn, checkOut, r.check_in_date as string, r.check_out_date as string),
    );
  }

  private nightlyRate(roomTypeId: UUID, checkIn: string): number {
    const base = this.db.rates.find((r) => r.room_type_id === roomTypeId);
    let price = (base?.price as number) ?? 0;
    const season = this.db.rate_seasons.find(
      (s) => checkIn >= (s.start_date as string) && checkIn <= (s.end_date as string),
    );
    if (season) price = roundMoney(price * (1 + (season.modifier_percent as number) / 100));
    return price;
  }

  async searchAvailableRoomTypes(
    propertyId: UUID,
    checkIn: string,
    checkOut: string,
    adults: number,
  ): Promise<AvailableRoomType[]> {
    if (checkIn >= checkOut) throw new DomainError('INVALID_DATES', 'check_out must be after check_in');
    const types = this.db.room_types.filter((rt) => rt.property_id === propertyId);
    const result: AvailableRoomType[] = [];
    for (const rt of types) {
      if ((rt.max_occupancy as number) < adults) continue;
      const rooms = this.db.rooms.filter(
        (r) =>
          r.room_type_id === rt.id &&
          r.status === 'OPERATIONAL' &&
          r.tenant_id === this.scopeSafeRoom(),
      );
      const available = rooms.filter((r) => !this.roomBlocked(r.id as UUID, checkIn, checkOut));
      if (available.length === 0) continue;
      const amenityIds = this.db.room_amenities
        .filter((ra) => ra.room_type_id === rt.id)
        .map((ra) => ra.amenity_id as UUID);
      const amenityNames = this.db.amenities
        .filter((a) => amenityIds.includes(a.id as UUID))
        .map((a) => a.name as string);
      const tenant = this.db.tenants.find((t) => t.id === this.scopeSafeRoom());
      result.push({
        room_type_id: rt.id as UUID,
        name: rt.name as string,
        description: rt.description as string,
        max_occupancy: rt.max_occupancy as number,
        available_rooms: available.length,
        nightly_rate: this.nightlyRate(rt.id as UUID, checkIn),
        currency: (tenant?.currency as string) ?? 'XAF',
        amenities: amenityNames,
      });
    }
    return result;
  }

  private scopeSafeRoom(): string {
    try {
      return this.scope();
    } catch {
      return DEMO_TENANT_ID;
    }
  }

  async quote(input: {
    property_id: UUID;
    room_type_id: UUID;
    room_id?: UUID;
    check_in_date: string;
    check_out_date: string;
    services?: { service_id: UUID; quantity: number }[];
  }): Promise<Quote> {
    return this.quoteSync(input);
  }

  /** Synchronous quote — used inside the atomic reservation block. */
  private quoteSync(input: {
    property_id: UUID;
    room_type_id: UUID;
    room_id?: UUID;
    check_in_date: string;
    check_out_date: string;
    services?: { service_id: UUID; quantity: number }[];
  }): Quote {
    const nights = nightsBetween(input.check_in_date, input.check_out_date);
    if (nights <= 0) throw new DomainError('INVALID_DATES', 'Invalid stay length');
    const nightly = this.nightlyRate(input.room_type_id, input.check_in_date);
    const roomTotal = mulMoney(nightly, nights);
    const taxRate = this.db.tax_rates.find((t) => t.tenant_id === this.scopeSafeRoom());
    const taxPercent = (taxRate?.rate_percent as number) ?? 0;
    const roomType = this.db.room_types.find((rt) => rt.id === input.room_type_id);
    const property = this.db.properties.find((p) => p.id === roomType?.property_id);
    const tenantRow = this.db.tenants.find((t) => t.id === property?.tenant_id);
    const currency = (tenantRow?.currency as string) ?? 'XAF';
    const lines: Quote['services'] = [];
    let servicesTotal = 0;
    for (const s of input.services ?? []) {
      const svc = this.db.services.find((x) => x.id === s.service_id);
      if (!svc) continue;
      const total = mulMoney(svc.price as number, s.quantity);
      lines.push({ label: svc.name as string, quantity: s.quantity, unit_price: svc.price as number, total });
      servicesTotal = addMoney(servicesTotal, total);
    }
    const subtotal = addMoney(roomTotal, servicesTotal);
    const taxTotal = percentOf(subtotal, taxPercent);
    return {
      room_type_id: input.room_type_id,
      room_id: input.room_id ?? null,
      nights,
      nightly_rate: nightly,
      room_total: roomTotal,
      tax_percent: taxPercent,
      tax_total: taxTotal,
      services: lines,
      total: addMoney(subtotal, taxTotal),
      currency,
    };
  }

  /* ==================== RESERVATIONS (atomic) ==================== */

  async createReservationAtomic(input: CreateReservationInput): Promise<Reservation> {
    const nights = nightsBetween(input.check_in_date, input.check_out_date);
    if (nights <= 0) throw new DomainError('INVALID_DATES', 'check_out must be after check_in');

    const room = this.db.rooms.find((r) => r.id === input.room_id);
    if (!room || room.tenant_id !== this.scope()) {
      throw new DomainError('NOT_FOUND', 'Room not found in your tenant');
    }
    if (room.status !== 'OPERATIONAL') {
      throw new DomainError('ROOM_UNAVAILABLE', 'Room is under maintenance');
    }
    // Overlap re-check (mirrors the SQL exclusion/locking path).
    if (this.roomBlocked(input.room_id, input.check_in_date, input.check_out_date)) {
      throw new DomainError('ROOM_UNAVAILABLE', 'Room unavailable on these dates');
    }
    // Plan quota check (spec PHASE 12) — fully synchronous (no interleaving).
    const sub = this.db.subscriptions.find((s0) => s0.tenant_id === this.scope());
    const plan = this.db.plans.find((p0) => p0.id === sub?.plan_id);
    if (plan && this.db.rooms.filter((r) => r.tenant_id === this.scope()).length > (plan.max_rooms as number)) {
      throw new DomainError('QUOTA_EXCEEDED', 'Quota rooms exceeded');
    }

    const tenant = this.db.tenants.find((t) => t.id === this.scope());
    // SYNCHRONOUS quote: no await between the overlap re-check and the writes —
    // mirrors the SQL FOR UPDATE + re-check window (true event-loop atomicity).
    const quote = this.quoteSync({
      property_id: input.property_id,
      room_type_id: input.room_type_id,
      room_id: input.room_id,
      check_in_date: input.check_in_date,
      check_out_date: input.check_out_date,
      services: input.services,
    });

    this.db.counters.reservation += 1;
    const reference = `HZ-2026-${String(this.db.counters.reservation).padStart(4, '0')}`;

    const reservation: Row = {
      id: uuid(),
      tenant_id: this.scope(),
      property_id: input.property_id,
      customer_id: input.customer_id,
      reference,
      status: 'CONFIRMED',
      check_in_date: input.check_in_date,
      check_in_time: (input.check_in_time ?? '14:00') + ':00',
      check_out_date: input.check_out_date,
      check_out_time: (input.check_out_time ?? '12:00') + ':00',
      adults: input.adults,
      children: input.children,
      notes: input.notes ?? null,
      total_amount: quote.total,
      currency: (tenant?.currency as string) ?? 'XAF',
      source: input.source,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    const item: Row = {
      id: uuid(), tenant_id: this.scope(), reservation_id: reservation.id,
      room_id: input.room_id, room_type_id: input.room_type_id,
      nightly_rate: quote.nightly_rate, created_at: nowISO(),
    };
    // Atomic write block (synchronous since the overlap check): no interleaving.
    this.db.reservations.push(reservation);
    this.db.reservation_items.push(item);
    const customer = this.db.customers.find((c) => c.id === input.customer_id);
    this.db.reservation_guests.push({
      id: uuid(), tenant_id: this.scope(), reservation_id: reservation.id,
      full_name: (customer?.full_name as string) ?? 'Client', id_document: null, is_primary: true,
    });
    this.db.reservation_status_history.push({
      id: uuid(), tenant_id: this.scope(), reservation_id: reservation.id,
      from_status: null, to_status: 'CONFIRMED', changed_by: this.currentUser().id,
      reason: null, created_at: nowISO(),
    });
    for (const s of input.services ?? []) {
      const svc = this.db.services.find((x) => x.id === s.service_id);
      if (!svc) continue;
      this.db.service_orders.push({
        id: uuid(), tenant_id: this.scope(), reservation_id: reservation.id,
        service_id: svc.id, service_name: svc.name, unit_price: svc.price,
        quantity: s.quantity, total: mulMoney(svc.price as number, s.quantity),
        currency: (tenant?.currency as string) ?? 'XAF', created_at: nowISO(),
      });
    }
    this.notify('reservation.created', `Nouvelle réservation ${reference}`, `${customer?.full_name ?? ''} — ${nights} nuit(s)`);
    this.audit('reservation.created', 'reservations', reservation.id, null, reservation);
    this.emitChange('reservations', 'INSERT', reservation.id);
    return reservation as unknown as Reservation;
  }

  async updateReservationStatus(id: UUID, to: Reservation['status'], reason?: string): Promise<Reservation> {
    const res = this.db.reservations.find(
      (r) => r.id === id && r.tenant_id === this.scope(),
    ) as Row | undefined;
    if (!res) throw new DomainError('NOT_FOUND', 'Reservation not found');
    const from = res.status as Reservation['status'];
    const allowed: Record<Reservation['status'], Reservation['status'][]> = {
      DRAFT: ['PENDING', 'CONFIRMED', 'CANCELLED'],
      PENDING: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
      CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
      CHECKED_IN: ['CHECKED_OUT'],
      CHECKED_OUT: [],
      CANCELLED: [],
      NO_SHOW: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new DomainError('INVALID_STATE', `Transition ${from} → ${to} interdite`);
    }
    res.status = to;
    res.updated_at = nowISO();
    this.db.reservation_status_history.push({
      id: uuid(), tenant_id: this.scope(), reservation_id: id, from_status: from, to_status: to,
      changed_by: this.currentUser().id, reason: reason ?? null, created_at: nowISO(),
    });
    this.audit('reservation.status_changed', 'reservations', id, { status: from }, { status: to });
    this.emitChange('reservations', 'UPDATE', id);
    return res as unknown as Reservation;
  }

  /* ==================== CHECK-IN / CHECK-OUT ==================== */

  async performCheckin(reservationId: UUID): Promise<void> {
    const res = await this.updateReservationStatus(reservationId, 'CHECKED_IN');
    const item = this.db.reservation_items.find((ri) => ri.reservation_id === reservationId);
    this.db.checkins.push({
      id: uuid(), tenant_id: this.scope(), reservation_id: reservationId,
      room_id: (item?.room_id as string) ?? '', actual_checkin_at: nowISO(),
      performed_by: this.currentUser().id, created_at: nowISO(),
    });
    if (item) {
      this.db.rooms.map((r) => {
        if (r.id === item.room_id) r.housekeeping_state = 'DIRTY';
        return r;
      });
      this.emitChange('rooms', 'UPDATE', item.room_id as string | null);
    }
    this.emitChange('checkins', 'INSERT', reservationId);
    this.notify('checkin.completed', `Check-in effectué (${res.reference})`, 'Le client est arrivé.');
  }

  async performCheckout(reservationId: UUID, clearBalance: boolean): Promise<void> {
    const res = this.db.reservations.find(
      (r) => r.id === reservationId && r.tenant_id === this.scope(),
    ) as Row | undefined;
    if (!res) throw new DomainError('NOT_FOUND', 'Reservation not found');
    const invoice = this.db.invoices.find(
      (i) => i.reservation_id === reservationId && i.status !== 'VOID',
    );
    const balance = invoice ? subMoney(invoice.total as number, invoice.amount_paid as number) : 0;
    if (balance > 0 && !clearBalance) {
      throw new DomainError('BALANCE_DUE', `Solde impayé de ${balance} — règlement requis`);
    }
    await this.updateReservationStatus(reservationId, 'CHECKED_OUT');
    const item = this.db.reservation_items.find((ri) => ri.reservation_id === reservationId);
    this.db.checkouts.push({
      id: uuid(), tenant_id: this.scope(), reservation_id: reservationId,
      room_id: (item?.room_id as string) ?? '', actual_checkout_at: nowISO(),
      balance_due: balance, balance_cleared: balance === 0 || clearBalance,
      performed_by: this.currentUser().id, created_at: nowISO(),
    });
    if (item) {
      const room = this.db.rooms.find((r) => r.id === item.room_id);
      if (room) room.housekeeping_state = 'DIRTY';
      this.emitChange('rooms', 'UPDATE', item.room_id as string | null);
    }
    this.emitChange('checkouts', 'INSERT', reservationId);
    this.notify('checkout.completed', `Check-out effectué (${res.reference})`, 'Chambre libérée — ménage à planifier.');
  }

  /* ==================== STATE MACHINES ==================== */

  private static HK_TRANSITIONS: Record<string, string[]> = {
    DIRTY: ['CLEANING'],
    CLEANING: ['INSPECTED', 'DIRTY'],
    INSPECTED: ['CLEAN', 'DIRTY'],
    CLEAN: ['DIRTY'],
  };

  async setRoomHousekeepingState(
    roomId: UUID,
    to: 'DIRTY' | 'CLEANING' | 'INSPECTED' | 'CLEAN',
  ): Promise<void> {
    const room = this.db.rooms.find((r) => r.id === roomId && r.tenant_id === this.scope());
    if (!room) throw new DomainError('NOT_FOUND', 'Room not found');
    const from = room.housekeeping_state as string;
    if (!DemoDataApi.HK_TRANSITIONS[from]?.includes(to)) {
      throw new DomainError('INVALID_STATE', `Ménage: transition ${from} → ${to} interdite`);
    }
    room.housekeeping_state = to;
    this.db.housekeeping_logs.push({
      id: uuid(), tenant_id: this.scope(), task_id: roomId, from_state: from, to_state: to,
      changed_by: this.currentUser().id, created_at: nowISO(),
    });
    this.audit('room.housekeeping_state', 'rooms', roomId, { state: from }, { state: to });
    this.emitChange('rooms', 'UPDATE', roomId);
  }

  async setRoomOperationalStatus(roomId: UUID, to: 'OPERATIONAL' | 'UNDER_MAINTENANCE'): Promise<void> {
    const room = this.db.rooms.find((r) => r.id === roomId && r.tenant_id === this.scope());
    if (!room) throw new DomainError('NOT_FOUND', 'Room not found');
    if (to === 'OPERATIONAL') {
      const activeTicket = this.db.maintenance_tickets.some(
        (t) => t.room_id === roomId && (t.status === 'OPEN' || t.status === 'IN_PROGRESS'),
      );
      if (activeTicket) {
        throw new DomainError('INVALID_STATE', 'Des tickets maintenance sont encore ouverts');
      }
    }
    room.status = to;
    this.audit('room.status', 'rooms', roomId, { status: room.status }, { status: to });
    this.emitChange('rooms', 'UPDATE', roomId);
  }

  /* ==================== FINANCE ==================== */

  async createInvoiceFromReservation(reservationId: UUID): Promise<UUID> {
    const res = this.db.reservations.find(
      (r) => r.id === reservationId && r.tenant_id === this.scope(),
    ) as Row | undefined;
    if (!res) throw new DomainError('NOT_FOUND', 'Reservation not found');
    const existing = this.db.invoices.find(
      (i) => i.reservation_id === reservationId && i.status !== 'VOID',
    );
    if (existing) throw new DomainError('VALIDATION', 'Une facture existe déjà pour cette réservation');
    const orders = this.db.service_orders.filter((o) => o.reservation_id === reservationId);
    const roomSubtotal = res.total_amount as number;
    const servicesSubtotal = orders.reduce((acc, o) => acc + (o.total as number), 0);
    const subtotal = addMoney(roomSubtotal, servicesSubtotal);
    const taxRate = this.db.tax_rates.find((t) => t.tenant_id === this.scope());
    const taxTotal = percentOf(subtotal, (taxRate?.rate_percent as number) ?? 0);
    this.db.counters.invoice += 1;
    const invoice: Row = {
      id: uuid(), tenant_id: this.scope(), reservation_id: reservationId,
      number: `FA-2026-${String(this.db.counters.invoice).padStart(4, '0')}`,
      status: 'DRAFT', subtotal, tax_total: taxTotal, total: addMoney(subtotal, taxTotal),
      amount_paid: 0, currency: res.currency as string, issued_at: null, voided_at: null,
      created_at: nowISO(),
    };
    this.db.invoices.push(invoice);
    this.db.invoice_items.push({
      id: uuid(), tenant_id: this.scope(), invoice_id: invoice.id,
      description: 'Séjour (chambre)', quantity: 1, unit_price: roomSubtotal, total: roomSubtotal,
    });
    for (const o of orders) {
      this.db.invoice_items.push({
        id: uuid(), tenant_id: this.scope(), invoice_id: invoice.id,
        description: `Service — ${o.service_name}`, quantity: o.quantity,
        unit_price: o.unit_price, total: o.total,
      });
    }
    this.audit('invoice.created', 'invoices', invoice.id, null, invoice);
    this.emitChange('invoices', 'INSERT', invoice.id);
    return invoice.id;
  }

  async issueInvoice(invoiceId: UUID): Promise<void> {
    const inv = this.db.invoices.find(
      (i) => i.id === invoiceId && i.tenant_id === this.scope(),
    );
    if (!inv) throw new DomainError('NOT_FOUND', 'Invoice not found');
    if (inv.status !== 'DRAFT') {
      throw new DomainError('INVALID_STATE', 'Seule une facture DRAFT peut être émise');
    }
    inv.status = 'ISSUED';
    inv.issued_at = nowISO();
    this.notify('invoice.issued', `Facture ${inv.number} émise`, `Montant : ${inv.total}`);
    this.audit('invoice.issued', 'invoices', invoiceId, { status: 'DRAFT' }, { status: 'ISSUED' });
    this.emitChange('invoices', 'UPDATE', invoiceId);
  }

  async voidInvoice(invoiceId: UUID, reason: string): Promise<void> {
    const inv = this.db.invoices.find(
      (i) => i.id === invoiceId && i.tenant_id === this.scope(),
    );
    if (!inv) throw new DomainError('NOT_FOUND', 'Invoice not found');
    if (inv.status === 'PAID') {
      throw new DomainError('INVALID_STATE', 'Une facture payée ne peut pas être annulée — passer par un avoir');
    }
    if (inv.status === 'VOID') throw new DomainError('INVALID_STATE', 'Facture déjà annulée');
    inv.status = 'VOID';
    inv.voided_at = nowISO();
    this.notify('invoice.voided', `Facture ${inv.number} annulée`, reason);
    this.audit('invoice.voided', 'invoices', invoiceId, { status: inv.status }, { status: 'VOID', reason });
    this.emitChange('invoices', 'UPDATE', invoiceId);
  }

  async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    // Idempotency (spec §15): same key → same payment, no duplicate.
    if (input.idempotency_key) {
      const existing = this.db.payments.find(
        (p) => p.idempotency_key === input.idempotency_key && p.tenant_id === this.scope(),
      );
      if (existing) return existing as unknown as Payment;
    }
    if (input.amount <= 0) throw new DomainError('VALIDATION', 'Montant invalide');
    const tenant = this.db.tenants.find((t) => t.id === this.scope());
    const payment: Row = {
      id: uuid(), tenant_id: this.scope(), invoice_id: input.invoice_id,
      reservation_id: input.reservation_id, amount: roundMoney(input.amount),
      currency: (tenant?.currency as string) ?? 'XAF', method: input.method,
      status: 'SUCCEEDED', idempotency_key: input.idempotency_key ?? null,
      provider_reference: null, created_at: nowISO(),
    };
    this.db.payments.push(payment);
    if (input.invoice_id) {
      const inv = this.db.invoices.find(
        (i) => i.id === input.invoice_id && i.tenant_id === this.scope(),
      );
      if (inv) {
        this.db.payment_allocations.push({
          id: uuid(), tenant_id: this.scope(), payment_id: payment.id,
          invoice_id: inv.id, amount: roundMoney(input.amount), created_at: nowISO(),
        });
        inv.amount_paid = addMoney(inv.amount_paid as number, input.amount);
        const due = subMoney(inv.total as number, inv.amount_paid as number);
        if (inv.status !== 'DRAFT') {
          inv.status = due <= 0 ? 'PAID' : 'PARTIALLY_PAID';
        }
      }
    }
    this.notify('payment.succeeded', `Paiement de ${input.amount} reçu`, input.method);
    this.audit('payment.created', 'payments', payment.id, null, payment);
    this.emitChange('payments', 'INSERT', payment.id);
    if (input.invoice_id) this.emitChange('invoices', 'UPDATE', input.invoice_id);
    return payment as unknown as Payment;
  }

  /* ==================== KPIs ==================== */

  async kpis(_tenantId: UUID): Promise<KPIs> {
    const tenant = this.scope();
    const today = todayISO();
    const rooms = this.db.rooms.filter((r) => r.tenant_id === tenant);
    const totalRooms = rooms.length || 1;
    const reservations = this.db.reservations.filter((r) => r.tenant_id === tenant);
    const active = reservations.filter((r) =>
      BLOCKING_STATUSES.includes(r.status as Reservation['status']),
    );
    const occupied = active.filter((r) => today >= (r.check_in_date as string) && today < (r.check_out_date as string));

    const revenue30d = this.db.payments
      .filter((p) => p.tenant_id === tenant && p.status === 'SUCCEEDED')
      .reduce((acc, p) => acc + (p.amount as number), 0);
    const expenses30d = this.db.expenses
      .filter((e) => e.tenant_id === tenant)
      .reduce((acc, e) => acc + (e.amount as number), 0);

    const adrBase = occupied.length
      ? occupied.reduce((acc, r) => {
          const item = this.db.reservation_items.find((ri) => ri.reservation_id === r.id);
          const nights = nightsBetween(r.check_in_date as string, r.check_out_date as string) || 1;
          return acc + (item ? (item.nightly_rate as number) : 0) / nights;
        }, 0) / occupied.length
      : 0;
    const adr = roundMoney(adrBase);
    const occupancyRate = Math.round((occupied.length / totalRooms) * 100);
    const revpar = roundMoney((adr * occupancyRate) / 100);

    const revenueSeries: KPIs['revenueSeries'] = [];
    const occupancySeries: KPIs['occupancySeries'] = [];
    for (let i = 13; i >= 0; i--) {
      const date = addDaysISO(today, -i);
      const occ = active.filter(
        (r) => date >= (r.check_in_date as string) && date < (r.check_out_date as string),
      ).length;
      revenueSeries.push({
        date,
        revenue: Math.round(revenue30d / 30 + (occ * adr) / 4),
        expenses: Math.round(expenses30d / 30),
      });
      occupancySeries.push({ date, rate: Math.round((occ / totalRooms) * 100) });
    }

    return {
      occupancyRate,
      adr,
      revpar,
      revenue30d,
      expenses30d,
      arrivalsToday: reservations.filter(
        (r) => r.check_in_date === today && ['PENDING', 'CONFIRMED'].includes(r.status as string),
      ) as unknown as Reservation[],
      departuresToday: reservations.filter(
        (r) => r.check_out_date === today && r.status === 'CHECKED_IN',
      ) as unknown as Reservation[],
      occupiedRooms: occupied.length,
      totalRooms,
      dirtyRooms: rooms.filter((r) => r.housekeeping_state === 'DIRTY').length,
      openTickets: this.db.maintenance_tickets.filter(
        (t) => t.tenant_id === tenant && ['OPEN', 'IN_PROGRESS'].includes(t.status as string),
      ).length,
      revenueSeries,
      occupancySeries,
      recentReservations: reservations
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 6) as unknown as Reservation[],
    };
  }

  /* ==================== NOTIFICATIONS ==================== */

  private notify(eventKey: string, title: string, body: string): void {
    this.db.notifications.unshift({
      id: uuid(), tenant_id: this.scopeSafeRoom(), user_id: null, channel: 'IN_APP',
      event_key: eventKey, title, body, read_at: null, created_at: nowISO(),
    });
  }

  async listMyNotifications(): Promise<Notification[]> {
    const rows = await this.list<Notification>('notifications', { pageSize: 50 });
    return rows.items;
  }

  async markNotificationRead(id: UUID): Promise<void> {
    const n = this.db.notifications.find((x) => x.id === id && x.tenant_id === this.scope());
    if (n) {
      n.read_at = nowISO();
      this.emitChange('notifications', 'UPDATE', id);
    }
  }

  async markAllNotificationsRead(): Promise<void> {
    this.db.notifications
      .filter((n) => n.tenant_id === this.scope() && !n.read_at)
      .forEach((n) => {
        n.read_at = nowISO();
        this.emitChange('notifications', 'UPDATE', n.id);
      });
  }

  /* ==================== SUBSCRIPTION ==================== */

  async getSubscription(): Promise<{
    planCode: TenantPlanCode;
    usage: Record<string, number>;
    limits: Record<string, number>;
  }> {
    const tenant = this.scope();
    const sub = this.db.subscriptions.find((s) => s.tenant_id === tenant);
    const plan = this.db.plans.find((p) => p.id === sub?.plan_id) ?? this.db.plans[0];
    return {
      planCode: (plan?.code as TenantPlanCode) ?? 'FREE',
      usage: {
        properties: this.db.properties.filter((p) => p.tenant_id === tenant).length,
        rooms: this.db.rooms.filter((r) => r.tenant_id === tenant).length,
        users: this.db.users.filter((u) => u.tenant_id === tenant).length,
      },
      limits: {
        properties: plan?.max_properties as number,
        rooms: plan?.max_rooms as number,
        users: plan?.max_users as number,
      },
    };
  }

  async changePlan(planCode: TenantPlanCode): Promise<void> {
    const tenant = this.scope();
    const plan = this.db.plans.find((p) => p.code === planCode);
    if (!plan) throw new DomainError('NOT_FOUND', 'Plan inconnu');
    const sub = this.db.subscriptions.find((s) => s.tenant_id === tenant);
    if (sub) {
      this.audit('subscription.plan_changed', 'subscriptions', sub.id, { plan_id: sub.plan_id }, { plan_id: plan.id });
      sub.plan_id = plan.id;
      sub.status = 'ACTIVE';
    }
  }

  /* ==================== SUPER ADMIN ==================== */

  async adminStats(): Promise<AdminStats> {
    const subs = this.db.subscriptions;
    const countBy = (code: string) =>
      subs.filter((s) => {
        const plan = this.db.plans.find((p) => p.id === s.plan_id);
        return plan?.code === code;
      }).length;
    const mrr = subs.reduce((acc, s) => {
      const plan = this.db.plans.find((p) => p.id === s.plan_id);
      return acc + ((plan?.monthly_price as number) ?? 0);
    }, 0);
    return {
      tenantCount: this.db.tenants.length,
      activeTenants: this.db.tenants.filter((t) => t.status === 'ACTIVE').length,
      subscriptionCount: {
        FREE: countBy('FREE'),
        STARTER: countBy('STARTER'),
        PRO: countBy('PRO'),
        BUSINESS: countBy('BUSINESS'),
        ENTERPRISE: countBy('ENTERPRISE'),
      },
      totalRevenueMrr: mrr,
    };
  }

  async adminListTenants(): Promise<Tenant[]> {
    return this.db.tenants as unknown as Tenant[];
  }

  async adminSetTenantStatus(tenantId: UUID, status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'): Promise<void> {
    const t = this.db.tenants.find((x) => x.id === tenantId);
    if (!t) throw new DomainError('NOT_FOUND', 'Tenant not found');
    this.audit('admin.tenant_status', 'tenants', tenantId, { status: t.status }, { status });
    t.status = status;
  }

  async adminListFeatureFlags(): Promise<{ id: UUID; key: string; enabled: boolean }[]> {
    return this.db.feature_flags.map((f) => ({ id: f.id as UUID, key: f.key as string, enabled: f.enabled as boolean }));
  }

  async adminToggleFeatureFlag(id: UUID): Promise<void> {
    const f = this.db.feature_flags.find((x) => x.id === id);
    if (!f) throw new DomainError('NOT_FOUND', 'Flag not found');
    f.enabled = !f.enabled;
    this.audit('admin.feature_flag_toggled', 'feature_flags', id, null, { enabled: f.enabled });
  }

  /* ==================== PUBLIC BOOKING ==================== */

  async publicProperty(slug: string) {
    const property = this.db.properties.find((p) => p.slug === slug && p.is_published === true);
    if (!property) return null;
    const tenant = this.db.tenants.find((t) => t.id === property.tenant_id);
    return {
      id: property.id as UUID,
      name: property.name as string,
      slug: property.slug as string,
      city: property.city as string,
      country: property.country as string,
      currency: (tenant?.currency as string) ?? 'XAF',
      room_types: this.db.room_types
        .filter((rt) => rt.property_id === property.id)
        .map((rt) => ({
          id: rt.id as UUID,
          name: rt.name as string,
          description: rt.description as string,
          base_price: rt.base_price as number,
          max_occupancy: rt.max_occupancy as number,
        })),
    };
  }

  async publicSearchAvailability(
    slug: string,
    checkIn: string,
    checkOut: string,
    adults: number,
  ): Promise<AvailableRoomType[]> {
    const property = await this.publicProperty(slug);
    if (!property) throw new DomainError('NOT_FOUND', 'Établissement introuvable');
    // Same single availability engine (spec §10/§11).
    return this.searchAvailableRoomTypesForTenant(property.id, checkIn, checkOut, adults, DEMO_TENANT_ID);
  }

  private async searchAvailableRoomTypesForTenant(
    propertyId: UUID,
    checkIn: string,
    checkOut: string,
    adults: number,
    tenantId: string,
  ): Promise<AvailableRoomType[]> {
    if (checkIn >= checkOut) throw new DomainError('INVALID_DATES', 'Dates invalides');
    const types = this.db.room_types.filter((rt) => rt.property_id === propertyId);
    const result: AvailableRoomType[] = [];
    for (const rt of types) {
      if ((rt.max_occupancy as number) < adults) continue;
      const rooms = this.db.rooms.filter(
        (r) => r.room_type_id === rt.id && r.status === 'OPERATIONAL' && r.tenant_id === tenantId,
      );
      const available = rooms.filter((r) => !this.roomBlocked(r.id as UUID, checkIn, checkOut));
      if (available.length === 0) continue;
      const tenant = this.db.tenants.find((t) => t.id === tenantId);
      result.push({
        room_type_id: rt.id as UUID,
        name: rt.name as string,
        description: rt.description as string,
        max_occupancy: rt.max_occupancy as number,
        available_rooms: available.length,
        nightly_rate: this.nightlyRate(rt.id as UUID, checkIn),
        currency: (tenant?.currency as string) ?? 'XAF',
        amenities: [],
      });
    }
    return result;
  }

  async publicCreateBooking(input: PublicBookingInput) {
    const property = await this.publicProperty(input.property_slug);
    if (!property) throw new DomainError('NOT_FOUND', 'Établissement introuvable');
    // Server-side recompute of availability + pricing (never trust the browser).
    const availability = await this.publicSearchAvailability(
      input.property_slug, input.check_in_date, input.check_out_date, input.adults,
    );
    const offer = availability.find((a) => a.room_type_id === input.room_type_id);
    if (!offer || offer.available_rooms < 1) {
      throw new DomainError('ROOM_UNAVAILABLE', 'Type de chambre indisponible');
    }
    // Idempotency on the public path too.
    const existing = this.db.reservations.find((r) =>
      this.db.reservation_guests.some(
        (g) => g.reservation_id === r.id && g.id_document === input.idempotency_key,
      ),
    );
    if (existing) {
      return {
        reference: existing.reference as string,
        reservation_id: existing.id as UUID,
        total: existing.total_amount as number,
      };
    }
    // Find one free room of the type.
    const rooms = this.db.rooms.filter(
      (r) => r.room_type_id === input.room_type_id && r.status === 'OPERATIONAL',
    );
    const freeRoom = rooms.find((r) => !this.roomBlocked(r.id as UUID, input.check_in_date, input.check_out_date));
    if (!freeRoom) throw new DomainError('ROOM_UNAVAILABLE', 'Plus de chambre disponible');

    // Guest without account (spec PHASE 11): create/reuse a lightweight customer.
    let customer = this.db.customers.find(
      (c) => c.tenant_id === property.id && c.email === input.guest.email,
    );
    if (!customer) {
      customer = {
        id: uuid(),
        tenant_id: DEMO_TENANT_ID,
        full_name: input.guest.full_name,
        email: input.guest.email,
        phone: input.guest.phone,
        country: input.guest.country ?? null,
        id_document: input.idempotency_key,
        notes: null,
        created_at: nowISO(),
      };
      this.db.customers.push(customer);
    }
    const reservation = await this.withSystemTenant(DEMO_TENANT_ID, () =>
      this.createReservationAtomic({
        property_id: property.id,
        customer_id: customer.id,
        room_id: freeRoom.id as UUID,
        room_type_id: input.room_type_id,
        check_in_date: input.check_in_date,
        check_out_date: input.check_out_date,
        adults: input.adults,
        children: input.children,
        source: 'PUBLIC_WIDGET',
      }),
    );
    return { reference: reservation.reference, reservation_id: reservation.id, total: reservation.total_amount };
  }
}

