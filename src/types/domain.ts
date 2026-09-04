/**
 * HOUSE-ZEN — Domain types (mirror of the PostgreSQL schema, spec §7).
 * Financial amounts: number mapped from NUMERIC(15,2) (spec §8 — never FLOAT in SQL).
 */

export type UUID = string;

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type TenantPlanCode = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';

export interface Tenant {
  id: UUID;
  name: string;
  slug: string;
  status: TenantStatus;
  currency: string;
  timezone: string;
  locale: string;
  /** Establishment branding — printed on documents (invoice header). */
  address_line?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  website?: string | null;
  tax_id?: string | null;
  registration_no?: string | null;
  logo_url?: string | null;
  default_check_in_time?: string | null;
  default_check_out_time?: string | null;
  created_at: string;
}

export interface TeamMember {
  membership_id: UUID;
  user_id: UUID;
  email: string;
  full_name: string;
  role: UserRole;
  joined_at: string;
}

export type UserRole =
  | 'owner' | 'manager' | 'receptionist' | 'accountant'
  | 'housekeeping' | 'maintenance' | 'super_admin';

export interface Profile {
  id: UUID;
  email: string;
  full_name: string;
  locale: string;
  is_super_admin: boolean;
  created_at: string;
}

export interface Membership {
  id: UUID;
  tenant_id: UUID;
  user_id: UUID;
  role: UserRole;
  created_at: string;
}

/* ------------------------- Property structure ------------------------- */

export type PropertyType = 'HOTEL' | 'RESIDENCE' | 'HOSTEL' | 'FURNISHED_APARTMENT' | 'GUESTHOUSE';

export interface Property {
  id: UUID;
  tenant_id: UUID;
  name: string;
  slug: string;
  property_type: PropertyType;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  timezone: string;
  is_published: boolean;
  created_at: string;
}

export interface Building {
  id: UUID;
  tenant_id: UUID;
  property_id: UUID;
  name: string;
  floors: number;
  created_at: string;
}

export type RoomKind = 'ROOM' | 'APARTMENT';

export interface RoomType {
  id: UUID;
  tenant_id: UUID;
  property_id: UUID;
  name: string;
  description: string;
  /** APARTMENT = furnished apartment unit that may contain bedrooms. */
  kind: RoomKind;
  max_occupancy: number;
  base_price: number;
  created_at: string;
}

export type RoomStatus = 'OPERATIONAL' | 'UNDER_MAINTENANCE';
export type HousekeepingState = 'DIRTY' | 'CLEANING' | 'INSPECTED' | 'CLEAN';

export interface Room {
  id: UUID;
  tenant_id: UUID;
  property_id: UUID;
  building_id: UUID | null;
  room_type_id: UUID;
  room_number: string;
  floor: number | null;
  /** For a bedroom inside a furnished apartment: its apartment unit. */
  parent_room_id: UUID | null;
  status: RoomStatus;
  housekeeping_state: HousekeepingState;
  created_at: string;
}

export interface Amenity {
  id: UUID;
  tenant_id: UUID;
  name: string;
  icon: string;
  created_at: string;
}

export interface RoomAmenity {
  room_type_id: UUID;
  amenity_id: UUID;
  tenant_id: UUID;
}

/* ------------------------------ Rates ------------------------------ */

export interface RateSeason {
  id: UUID;
  tenant_id: UUID;
  property_id: UUID;
  name: string;
  start_date: string;
  end_date: string;
  modifier_percent: number;
  created_at: string;
}

export interface Rate {
  id: UUID;
  tenant_id: UUID;
  room_type_id: UUID;
  season_id: UUID | null;
  price: number;
  currency: string;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
}

export interface RateRule {
  id: UUID;
  tenant_id: UUID;
  room_type_id: UUID;
  min_stay_nights: number;
  modifier_percent: number;
  created_at: string;
}

/* ---------------------------- Customers ---------------------------- */

export type CustomerIdType = 'CNI' | 'PASSEPORT' | 'PERMIS' | 'RECEPISSE';

export interface Customer {
  id: UUID;
  tenant_id: UUID;
  full_name: string;
  email: string | null;
  phone: string;
  country: string | null;
  /** Encrypted document NUMBER (PII, migration 052) — read via audited RPC. */
  id_document: string | null;
  /** Classification metadata: document kind, issue date & place (clear). */
  id_type: CustomerIdType | null;
  id_issue_date: string | null;
  id_issue_place: string | null;
  notes: string | null;
  created_at: string;
}

/* --------------------------- Reservations --------------------------- */

export type ReservationStatus =
  | 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';

export interface Reservation {
  id: UUID;
  tenant_id: UUID;
  property_id: UUID;
  customer_id: UUID;
  reference: string;
  status: ReservationStatus;
  check_in_date: string;
  /** Arrival time, ISO "HH:mm:ss" (hotel-day default 14:00). */
  check_in_time: string;
  check_out_date: string;
  /** Departure time, ISO "HH:mm:ss" (hotel-day default 12:00). */
  check_out_time: string;
  adults: number;
  children: number;
  notes: string | null;
  total_amount: number;
  currency: string;
  source: 'BACK_OFFICE' | 'PUBLIC_WIDGET' | 'API';
  created_at: string;
  updated_at: string;
}

export interface ReservationItem {
  id: UUID;
  tenant_id: UUID;
  reservation_id: UUID;
  room_id: UUID;
  room_type_id: UUID;
  nightly_rate: number;
  created_at: string;
}

export interface ReservationGuest {
  id: UUID;
  tenant_id: UUID;
  reservation_id: UUID;
  full_name: string;
  id_document: string | null;
  is_primary: boolean;
}

export interface ReservationStatusHistory {
  id: UUID;
  tenant_id: UUID;
  reservation_id: UUID;
  from_status: ReservationStatus | null;
  to_status: ReservationStatus;
  changed_by: UUID | null;
  reason: string | null;
  created_at: string;
}

/* --------------------------- Check-in/out --------------------------- */

export interface Checkin {
  id: UUID;
  tenant_id: UUID;
  reservation_id: UUID;
  room_id: UUID;
  actual_checkin_at: string;
  performed_by: UUID | null;
  created_at: string;
}

export interface Checkout {
  id: UUID;
  tenant_id: UUID;
  reservation_id: UUID;
  room_id: UUID;
  actual_checkout_at: string;
  balance_due: number;
  balance_cleared: boolean;
  performed_by: UUID | null;
  created_at: string;
}

/* ----------------------------- Services ----------------------------- */

export interface Service {
  id: UUID;
  tenant_id: UUID;
  property_id: UUID | null;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export interface ServiceOrder {
  id: UUID;
  tenant_id: UUID;
  reservation_id: UUID;
  service_id: UUID;
  service_name: string;
  unit_price: number;
  quantity: number;
  total: number;
  currency: string;
  created_at: string;
}

/* ------------------- Housekeeping / Maintenance ------------------- */

export type HousekeepingTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';

export interface HousekeepingTask {
  id: UUID;
  tenant_id: UUID;
  room_id: UUID;
  assigned_to: UUID | null;
  status: HousekeepingTaskStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  notes: string | null;
  scheduled_date: string;
  completed_at: string | null;
  created_at: string;
}

export interface HousekeepingLog {
  id: UUID;
  tenant_id: UUID;
  task_id: UUID;
  from_state: HousekeepingState | null;
  to_state: HousekeepingState;
  changed_by: UUID | null;
  created_at: string;
}

export type MaintenanceTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface MaintenanceTicket {
  id: UUID;
  tenant_id: UUID;
  room_id: UUID;
  title: string;
  description: string | null;
  status: MaintenanceTicketStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  reported_by: UUID | null;
  resolved_at: string | null;
  created_at: string;
}

export interface MaintenanceLog {
  id: UUID;
  tenant_id: UUID;
  ticket_id: UUID;
  message: string;
  changed_by: UUID | null;
  created_at: string;
}

/* ------------------------------ Finance ------------------------------ */

export interface TaxRate {
  id: UUID;
  tenant_id: UUID;
  name: string;
  rate_percent: number;
  is_default: boolean;
  created_at: string;
}

export interface CancellationPolicy {
  id: UUID;
  tenant_id: UUID;
  name: string;
  free_cancellation_hours: number;
  penalty_percent: number;
  created_at: string;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';

export interface Invoice {
  id: UUID;
  tenant_id: UUID;
  reservation_id: UUID | null;
  number: string;
  status: InvoiceStatus;
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  currency: string;
  issued_at: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface InvoiceItem {
  id: UUID;
  tenant_id: UUID;
  invoice_id: UUID;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export type PaymentMethod = 'CASH' | 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
export type PaymentStatus =
  | 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

export interface Payment {
  id: UUID;
  tenant_id: UUID;
  invoice_id: UUID | null;
  reservation_id: UUID | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  idempotency_key: string | null;
  provider_reference: string | null;
  created_at: string;
}

export interface PaymentAllocation {
  id: UUID;
  tenant_id: UUID;
  payment_id: UUID;
  invoice_id: UUID;
  amount: number;
  created_at: string;
}

export interface ExpenseCategory {
  id: UUID;
  tenant_id: UUID;
  name: string;
  created_at: string;
}

export interface Expense {
  id: UUID;
  tenant_id: UUID;
  category_id: UUID | null;
  supplier_id: UUID | null;
  property_id: UUID | null;
  label: string;
  amount: number;
  currency: string;
  spent_at: string;
  created_at: string;
}

export interface Supplier {
  id: UUID;
  tenant_id: UUID;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

/* --------------------- Notifications / Audit --------------------- */

export interface Notification {
  id: UUID;
  tenant_id: UUID;
  user_id: UUID | null;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP';
  event_key: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: UUID;
  tenant_id: UUID | null;
  actor_id: UUID | null;
  action: string;
  entity: string;
  entity_id: UUID | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  request_id: string | null;
  created_at: string;
}

/* ------------------------------- SaaS ------------------------------- */

export interface Plan {
  id: UUID;
  code: TenantPlanCode;
  name: string;
  monthly_price: number;
  currency: string;
  max_properties: number;
  max_rooms: number;
  max_users: number;
  features: string[];
}

export interface Subscription {
  id: UUID;
  tenant_id: UUID;
  plan_id: UUID;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
  current_period_start: string;
  current_period_end: string;
  trial_end: string | null;
  created_at: string;
}

export interface FeatureFlag {
  id: UUID;
  tenant_id: UUID | null;
  key: string;
  enabled: boolean;
}

/* --------------------------- Availability --------------------------- */

export interface AvailableRoomType {
  room_type_id: UUID;
  name: string;
  description: string;
  max_occupancy: number;
  available_rooms: number;
  nightly_rate: number;
  currency: string;
  amenities: string[];
}

export interface QuoteLine {
  label: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Quote {
  room_type_id: UUID | null;
  room_id: UUID | null;
  nights: number;
  nightly_rate: number;
  room_total: number;
  tax_percent: number;
  tax_total: number;
  services: QuoteLine[];
  total: number;
  currency: string;
}

/* ----------------------------- Errors ----------------------------- */

export class DomainError extends Error {
  constructor(
    public code:
      | 'ROOM_UNAVAILABLE'
      | 'INVALID_DATES'
      | 'INVALID_STATE'
      | 'QUOTA_EXCEEDED'
      | 'PERMISSION_DENIED'
      | 'NOT_FOUND'
      | 'VALIDATION'
      | 'IDEMPOTENCY_CONFLICT'
      | 'BALANCE_DUE',
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
