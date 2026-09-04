/**
 * HOUSE-ZEN — Data layer contracts.
 * Two implementations: src/lib/supabase/api.ts (production) and src/lib/demo/api.ts
 * (documented demo mode). Features only ever consume DataApi.
 */

import type {
  AvailableRoomType,
  Notification,
  Payment,
  PaymentMethod,
  Quote,
  Reservation,
  ReservationStatus,
  Tenant,
  TenantPlanCode,
  UserRole,
  UUID,
} from '@/types/domain';

export const ENTITIES = [
  'tenants', 'profiles', 'memberships', 'properties', 'buildings', 'room_types', 'rooms',
  'amenities', 'room_amenities', 'rate_seasons', 'rates', 'rate_rules', 'customers',
  'reservations', 'reservation_items', 'reservation_guests', 'reservation_status_history',
  'checkins', 'checkouts', 'services', 'service_orders', 'housekeeping_tasks', 'housekeeping_logs',
  'maintenance_tickets', 'maintenance_logs', 'tax_rates', 'cancellation_policies', 'invoices',
  'invoice_items', 'payments', 'payment_allocations', 'expense_categories', 'expenses',
  'suppliers', 'notifications', 'audit_logs', 'plans', 'subscriptions', 'feature_flags',
] as const;

export type EntityName = (typeof ENTITIES)[number];

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  filters?: Record<string, string | number | boolean | null | undefined>;
  sort?: Record<string, 'asc' | 'desc'>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthSession {
  userId: UUID;
  email: string;
  fullName: string;
  role: UserRole;
  isSuperAdmin: boolean;
  tenant: Tenant | null;
  memberships: { tenant_id: UUID; role: UserRole }[];
  /**
   * True when the user owns a verified MFA factor but the current session is
   * still at AAL1 (multi-factor required before entering the app).
   * Production: derived from Supabase Auth AAL levels; demo: documented mirror.
   */
  pendingMfa?: boolean;
}

export interface KPIs {
  occupancyRate: number;
  adr: number;
  revpar: number;
  revenue30d: number;
  expenses30d: number;
  arrivalsToday: Reservation[];
  departuresToday: Reservation[];
  occupiedRooms: number;
  totalRooms: number;
  dirtyRooms: number;
  openTickets: number;
  revenueSeries: { date: string; revenue: number; expenses: number }[];
  occupancySeries: { date: string; rate: number }[];
  recentReservations: Reservation[];
}

export interface AdminStats {
  tenantCount: number;
  activeTenants: number;
  subscriptionCount: Record<TenantPlanCode, number>;
  totalRevenueMrr: number;
}

export interface CreateReservationInput {
  property_id: UUID;
  customer_id: UUID;
  room_id: UUID;
  room_type_id: UUID;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  notes?: string;
  source: Reservation['source'];
  services?: { service_id: UUID; quantity: number }[];
}

export interface PublicBookingInput {
  property_slug: string;
  room_type_id: UUID;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  guest: { full_name: string; email: string; phone: string; country?: string };
  idempotency_key: string;
}

export interface RecordPaymentInput {
  invoice_id: UUID | null;
  reservation_id: UUID | null;
  amount: number;
  method: PaymentMethod;
  idempotency_key?: string;
}

export interface DataApi {
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  onAuthChange(cb: (session: AuthSession | null) => void): () => void;

  list<T>(entity: EntityName, params?: ListParams): Promise<Paginated<T>>;
  get<T>(entity: EntityName, id: UUID): Promise<T | null>;
  create<T extends { id?: UUID }>(entity: EntityName, data: T): Promise<T>;
  update<T extends Record<string, unknown>>(entity: EntityName, id: UUID, data: T): Promise<T>;
  remove(entity: EntityName, id: UUID): Promise<void>;

  searchAvailableRoomTypes(
    propertyId: UUID, checkIn: string, checkOut: string, adults: number,
  ): Promise<AvailableRoomType[]>;
  quote(input: {
    property_id: UUID;
    room_type_id: UUID;
    room_id?: UUID;
    check_in_date: string;
    check_out_date: string;
    services?: { service_id: UUID; quantity: number }[];
  }): Promise<Quote>;
  createReservationAtomic(input: CreateReservationInput): Promise<Reservation>;
  updateReservationStatus(id: UUID, to: ReservationStatus, reason?: string): Promise<Reservation>;

  performCheckin(reservationId: UUID): Promise<void>;
  performCheckout(reservationId: UUID, clearBalance: boolean): Promise<void>;

  setRoomHousekeepingState(roomId: UUID, to: 'DIRTY' | 'CLEANING' | 'INSPECTED' | 'CLEAN'): Promise<void>;
  setRoomOperationalStatus(roomId: UUID, to: 'OPERATIONAL' | 'UNDER_MAINTENANCE'): Promise<void>;

  createInvoiceFromReservation(reservationId: UUID): Promise<UUID>;
  issueInvoice(invoiceId: UUID): Promise<void>;
  voidInvoice(invoiceId: UUID, reason: string): Promise<void>;
  recordPayment(input: RecordPaymentInput): Promise<Payment>;

  kpis(tenantId: UUID): Promise<KPIs>;

  listMyNotifications(): Promise<Notification[]>;
  markNotificationRead(id: UUID): Promise<void>;
  markAllNotificationsRead(): Promise<void>;

  getSubscription(): Promise<{ planCode: TenantPlanCode; usage: Record<string, number>; limits: Record<string, number> }>;
  changePlan(planCode: TenantPlanCode): Promise<void>;

  adminStats(): Promise<AdminStats>;
  adminListTenants(): Promise<Tenant[]>;
  adminSetTenantStatus(tenantId: UUID, status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'): Promise<void>;
  adminListFeatureFlags(): Promise<{ id: UUID; key: string; enabled: boolean }[]>;
  adminToggleFeatureFlag(id: UUID): Promise<void>;

  publicProperty(slug: string): Promise<{
    id: UUID;
    name: string;
    slug: string;
    city: string;
    country: string;
    currency: string;
    room_types: { id: UUID; name: string; description: string; base_price: number; max_occupancy: number }[];
  } | null>;
  publicSearchAvailability(
    slug: string, checkIn: string, checkOut: string, adults: number,
  ): Promise<AvailableRoomType[]>;
  publicCreateBooking(input: PublicBookingInput): Promise<{ reference: string; reservation_id: UUID; total: number }>;
}
