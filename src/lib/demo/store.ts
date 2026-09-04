/**
 * HOUSE-ZEN — Demo in-memory store (seeded).
 * EXPLICIT documented decision (spec §26): backs DataApi when no Supabase env vars.
 * Mirrors production tenant-scoping: every row carries tenant_id; demo access is
 * always scoped to the signed-in user's tenant. Dead code in production builds.
 */

import { addDaysISO, todayISO } from '@/lib/utils/money-dates';

export interface DemoUser {
  id: string;
  email: string;
  password: string;
  full_name: string;
  role: 'owner' | 'manager' | 'receptionist' | 'accountant' | 'housekeeping' | 'maintenance' | 'super_admin';
  tenant_id: string | null;
  is_super_admin: boolean;
}

export interface Row {
  id: string;
  tenant_id: string | null;
  [key: string]: unknown;
}

export interface DemoDB {
  users: DemoUser[];
  sessions: Map<string, DemoUser>;
  tenants: Row[];
  properties: Row[];
  buildings: Row[];
  room_types: Row[];
  rooms: Row[];
  amenities: Row[];
  room_amenities: Row[];
  rate_seasons: Row[];
  rates: Row[];
  rate_rules: Row[];
  customers: Row[];
  reservations: Row[];
  reservation_items: Row[];
  reservation_guests: Row[];
  reservation_status_history: Row[];
  checkins: Row[];
  checkouts: Row[];
  services: Row[];
  service_orders: Row[];
  housekeeping_tasks: Row[];
  housekeeping_logs: Row[];
  maintenance_tickets: Row[];
  maintenance_logs: Row[];
  tax_rates: Row[];
  cancellation_policies: Row[];
  invoices: Row[];
  invoice_items: Row[];
  payments: Row[];
  payment_allocations: Row[];
  expense_categories: Row[];
  expenses: Row[];
  suppliers: Row[];
  notifications: Row[];
  audit_logs: Row[];
  plans: Row[];
  subscriptions: Row[];
  feature_flags: Row[];
  counters: { reservation: number; invoice: number };
}

export const DEMO_TENANT_ID = 't-zen-0001';
export const DEMO_TENANT_B_ID = 't-competitor-01';
type R = Row;

export function buildSeed(): DemoDB {
  const today = todayISO();
  const now = new Date().toISOString();
  const T = DEMO_TENANT_ID;

  const tenants: R[] = [
    { id: T, tenant_id: T, name: 'Zen Hôtels & Résidences', slug: 'zen-hotels', status: 'ACTIVE', currency: 'XAF', timezone: 'Africa/Douala', locale: 'fr', created_at: now },
    { id: DEMO_TENANT_B_ID, tenant_id: DEMO_TENANT_B_ID, name: 'Hôtel Concurrence (tenant B)', slug: 'hotel-concurrence', status: 'ACTIVE', currency: 'XAF', timezone: 'Africa/Douala', locale: 'fr', created_at: now },
  ];

  const users: DemoUser[] = [
    { id: 'u-owner', email: 'owner@demo.house-zen.app', password: 'demo1234', full_name: 'Arlette Nkeng', role: 'owner', tenant_id: T, is_super_admin: false },
    { id: 'u-manager', email: 'manager@demo.house-zen.app', password: 'demo1234', full_name: 'Serge Mbarga', role: 'manager', tenant_id: T, is_super_admin: false },
    { id: 'u-reception', email: 'reception@demo.house-zen.app', password: 'demo1234', full_name: 'Clarisse Etoga', role: 'receptionist', tenant_id: T, is_super_admin: false },
    { id: 'u-accountant', email: 'compta@demo.house-zen.app', password: 'demo1234', full_name: 'Patrick Ndongo', role: 'accountant', tenant_id: T, is_super_admin: false },
    { id: 'u-housekeeping', email: 'menage@demo.house-zen.app', password: 'demo1234', full_name: 'Bernadette Oyono', role: 'housekeeping', tenant_id: T, is_super_admin: false },
    { id: 'u-maintenance', email: 'tech@demo.house-zen.app', password: 'demo1234', full_name: 'Idriss Bello', role: 'maintenance', tenant_id: T, is_super_admin: false },
    { id: 'u-superadmin', email: 'admin@house-zen.app', password: 'demo1234', full_name: 'Opérateurs HOUSE-ZEN', role: 'super_admin', tenant_id: null, is_super_admin: true },
  ];

  const properties: R[] = [
    { id: 'p-douala', tenant_id: T, name: 'Zen Palace Douala', slug: 'zen-palace-douala', property_type: 'HOTEL', address: '123 Bd de la Liberté', city: 'Douala', country: 'Cameroun', phone: '+237 690 00 00 01', email: 'palace@zen.cm', timezone: 'Africa/Douala', is_published: true, description: 'Au cœur de Douala, le Zen Palace combine hébergement élégant et art de vivre camerounais : chambres climatisées, wifi fibre, restaurant, piscine, parking sécurisé et réception 24h/24.', photos: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80', 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1600&q=80', 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=80', 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1600&q=80'], created_at: now },
    { id: 'p-bonapriso', tenant_id: T, name: 'Zen Résidences Bonapriso', slug: 'zen-residences-bonapriso', property_type: 'RESIDENCE', address: '8 Rue Njo-Njo', city: 'Douala', country: 'Cameroun', phone: '+237 690 00 00 02', email: 'bonapriso@zen.cm', timezone: 'Africa/Douala', is_published: true, description: 'Appartements meublés haut de gamme au cœur de Bonapriso : séjour lumineux, cuisine équipée, ménage inclus.', photos: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80', 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=80'], created_at: now },
  ];

  const buildings: R[] = [
    { id: 'b-main', tenant_id: T, property_id: 'p-douala', name: 'Aile Principale', floors: 4, created_at: now },
    { id: 'b-annexe', tenant_id: T, property_id: 'p-douala', name: 'Annexe Jardin', floors: 2, created_at: now },
    { id: 'b-res', tenant_id: T, property_id: 'p-bonapriso', name: 'Résidence A', floors: 3, created_at: now },
  ];

  const room_types: R[] = [
    { id: 'rt-standard', tenant_id: T, property_id: 'p-douala', name: 'Chambre Standard', description: 'Confort essentiel, lit queen, climatisation.', kind: 'ROOM', max_occupancy: 2, base_price: 35000, photos: ['https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80'], created_at: now },
    { id: 'rt-deluxe', tenant_id: T, property_id: 'p-douala', name: 'Chambre Deluxe', description: 'Espace généreux, bureau, vue ville.', kind: 'ROOM', max_occupancy: 2, base_price: 55000, photos: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80'], created_at: now },
    { id: 'rt-suite', tenant_id: T, property_id: 'p-douala', name: 'Suite Exécutive', description: 'Salon séparé, kitchenette, service premium.', kind: 'ROOM', max_occupancy: 3, base_price: 95000, photos: ['https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=80', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80'], created_at: now },
    { id: 'rt-family', tenant_id: T, property_id: 'p-douala', name: 'Chambre Familiale', description: 'Deux lits doubles, idéale familles.', kind: 'ROOM', max_occupancy: 4, base_price: 72000, photos: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80'], created_at: now },
    { id: 'rt-t2', tenant_id: T, property_id: 'p-bonapriso', name: 'Appartement T2 Meublé', description: 'Séjour + chambre, cuisine équipée.', kind: 'APARTMENT', max_occupancy: 4, base_price: 120000, photos: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80'], created_at: now },
  ];

  const rooms: R[] = [
    ...[101, 102, 103, 104, 105, 106].map((n) => ({ id: `r-${n}`, tenant_id: T, property_id: 'p-douala', building_id: 'b-main', room_type_id: 'rt-standard', room_number: `${n}`, floor: 1, parent_room_id: null, status: 'OPERATIONAL', housekeeping_state: n <= 103 ? 'CLEAN' : 'DIRTY', created_at: now })),
    ...[201, 202, 203, 204].map((n) => ({ id: `r-${n}`, tenant_id: T, property_id: 'p-douala', building_id: 'b-main', room_type_id: 'rt-deluxe', room_number: `${n}`, floor: 2, parent_room_id: null, status: 'OPERATIONAL', housekeeping_state: 'CLEAN', created_at: now })),
    { id: 'r-301', tenant_id: T, property_id: 'p-douala', building_id: 'b-main', room_type_id: 'rt-suite', room_number: '301', floor: 3, parent_room_id: null, status: 'OPERATIONAL', housekeeping_state: 'CLEAN', created_at: now },
    { id: 'r-302', tenant_id: T, property_id: 'p-douala', building_id: 'b-main', room_type_id: 'rt-suite', room_number: '302', floor: 3, parent_room_id: null, status: 'UNDER_MAINTENANCE', housekeeping_state: 'DIRTY', created_at: now },
    ...[401, 402].map((n) => ({ id: `r-${n}`, tenant_id: T, property_id: 'p-douala', building_id: 'b-annexe', room_type_id: 'rt-family', room_number: `${n}`, floor: 1, parent_room_id: null, status: 'OPERATIONAL', housekeeping_state: 'CLEAN', created_at: now })),
    ...[501, 502, 503].map((n) => ({ id: `r-${n}`, tenant_id: T, property_id: 'p-bonapriso', building_id: 'b-res', room_type_id: 'rt-t2', room_number: `${n}`, floor: 1, parent_room_id: null, status: 'OPERATIONAL', housekeeping_state: 'CLEAN', created_at: now })),
    // Bedrooms composing the furnished apartment unit 501 (T2 = séjour + chambre).
    { id: 'r-501-c1', tenant_id: T, property_id: 'p-bonapriso', building_id: 'b-res', room_type_id: 'rt-t2', room_number: '501 · Chambre 1', floor: 1, parent_room_id: 'r-501', status: 'OPERATIONAL', housekeeping_state: 'CLEAN', created_at: now },
    { id: 'r-501-c2', tenant_id: T, property_id: 'p-bonapriso', building_id: 'b-res', room_type_id: 'rt-t2', room_number: '501 · Chambre 2', floor: 1, parent_room_id: 'r-501', status: 'OPERATIONAL', housekeeping_state: 'CLEAN', created_at: now },
  ];

  const amenities: R[] = [
    { id: 'am-wifi', tenant_id: T, name: 'WiFi haut débit', icon: 'wifi', created_at: now },
    { id: 'am-ac', tenant_id: T, name: 'Climatisation', icon: 'wind', created_at: now },
    { id: 'am-tv', tenant_id: T, name: 'TV satellite', icon: 'tv', created_at: now },
    { id: 'am-parking', tenant_id: T, name: 'Parking sécurisé', icon: 'car', created_at: now },
    { id: 'am-pool', tenant_id: T, name: 'Piscine', icon: 'waves', created_at: now },
    { id: 'am-breakfast', tenant_id: T, name: 'Petit-déjeuner', icon: 'coffee', created_at: now },
    { id: 'am-safe', tenant_id: T, name: 'Coffre-fort', icon: 'lock', created_at: now },
    { id: 'am-kitchen', tenant_id: T, name: 'Cuisine équipée', icon: 'chef-hat', created_at: now },
  ];

  const room_amenities: R[] = [
    ...['rt-standard', 'rt-deluxe', 'rt-suite', 'rt-family'].flatMap((rt) => [
      { id: `ra-${rt}-wifi`, room_type_id: rt, amenity_id: 'am-wifi', tenant_id: T },
      { id: `ra-${rt}-ac`, room_type_id: rt, amenity_id: 'am-ac', tenant_id: T },
      { id: `ra-${rt}-tv`, room_type_id: rt, amenity_id: 'am-tv', tenant_id: T },
      { id: `ra-${rt}-safe`, room_type_id: rt, amenity_id: 'am-safe', tenant_id: T },
    ]),
    { id: 'ra-suite-pool', room_type_id: 'rt-suite', amenity_id: 'am-pool', tenant_id: T },
    { id: 'ra-suite-bf', room_type_id: 'rt-suite', amenity_id: 'am-breakfast', tenant_id: T },
    { id: 'ra-t2-kitchen', room_type_id: 'rt-t2', amenity_id: 'am-kitchen', tenant_id: T },
    { id: 'ra-t2-wifi', room_type_id: 'rt-t2', amenity_id: 'am-wifi', tenant_id: T },
    { id: 'ra-t2-ac', room_type_id: 'rt-t2', amenity_id: 'am-ac', tenant_id: T },
  ];

  const rate_seasons: R[] = [
    { id: 's-high', tenant_id: T, property_id: 'p-douala', name: 'Haute saison', start_date: addDaysISO(today, 30), end_date: addDaysISO(today, 75), modifier_percent: 15, created_at: now },
  ];

  const rates: R[] = room_types.map((rt) => ({
    id: `rate-${rt.id}`, tenant_id: T, room_type_id: rt.id, season_id: null,
    price: rt.base_price, currency: 'XAF', valid_from: today, valid_to: null, created_at: now,
  }));

  const rate_rules: R[] = [
    { id: 'rr-1', tenant_id: T, room_type_id: 'rt-suite', min_stay_nights: 2, modifier_percent: -5, created_at: now },
  ];

  const customers: R[] = [
    { id: 'c-1', tenant_id: T, full_name: 'Jean-Paul Fotso', email: 'jp.fotso@example.cm', phone: '+237 677 11 22 33', country: 'Cameroun', id_document: 'CNI-8812', id_type: 'CNI', id_issue_date: '2019-06-14', id_issue_place: 'Douala', notes: 'Client fidèle — suite si possible.', created_at: now },
    { id: 'c-2', tenant_id: T, full_name: 'Amina Diallo', email: 'amina.diallo@example.sn', phone: '+221 77 555 12 12', country: 'Sénégal', id_document: 'PSP-4402', id_type: 'PASSEPORT', id_issue_date: '2022-03-02', id_issue_place: 'Dakar', notes: null, created_at: now },
    { id: 'c-3', tenant_id: T, full_name: 'Robert Ménard', email: 'r.menard@example.fr', phone: '+33 6 12 34 56 78', country: 'France', id_document: 'PSP-1120', id_type: 'PASSEPORT', id_issue_date: '2021-11-20', id_issue_place: 'Lyon', notes: 'Arrive tard (~23h).', created_at: now },
    { id: 'c-4', tenant_id: T, full_name: 'Grace Ayuk', email: 'grace.ayuk@example.cm', phone: '+237 691 44 55 66', country: 'Cameroun', id_document: 'RC-2024-0887', id_type: 'RECEPISSE', id_issue_date: '2024-01-18', id_issue_place: 'Buea', notes: null, created_at: now },
    { id: 'c-5', tenant_id: T, full_name: 'Kwame Mensah', email: 'kwame.mensah@example.gh', phone: '+233 24 555 88 99', country: 'Ghana', id_document: 'DL-4410-GH', id_type: 'PERMIS', id_issue_date: '2020-07-30', id_issue_place: 'Accra', notes: null, created_at: now },
    { id: 'c-6', tenant_id: T, full_name: 'Fatima Abubakar', email: 'fatima.a@example.ng', phone: '+234 803 555 77 66', country: 'Nigéria', id_document: 'CNI-55219', id_type: 'CNI', id_issue_date: '2018-09-05', id_issue_place: 'Lagos', notes: null, created_at: now },
    { id: 'c-7', tenant_id: T, full_name: 'Lucienne Tabi', email: 'lucienne.tabi@example.cm', phone: '+237 699 22 33 44', country: 'Cameroun', id_document: null, id_type: null, id_issue_date: null, id_issue_place: null, notes: null, created_at: now },
    { id: 'c-8', tenant_id: T, full_name: 'Oumarou Sanda', email: 'oumarou.s@example.cm', phone: '+237 655 66 77 88', country: 'Cameroun', id_document: 'CNI-70345', id_type: 'CNI', id_issue_date: '2023-02-11', id_issue_place: 'Garoua', notes: null, created_at: now },
  ];

  const reservations: R[] = [
    { id: 'res-1', tenant_id: T, property_id: 'p-douala', customer_id: 'c-1', reference: 'HZ-2026-0001', status: 'CHECKED_OUT', check_in_date: addDaysISO(today, -12), check_out_date: addDaysISO(today, -9), adults: 2, children: 0, notes: null, total_amount: 173000, currency: 'XAF', source: 'BACK_OFFICE', created_at: now, updated_at: now },
    { id: 'res-2', tenant_id: T, property_id: 'p-douala', customer_id: 'c-3', reference: 'HZ-2026-0002', status: 'CHECKED_IN', check_in_date: addDaysISO(today, -2), check_out_date: addDaysISO(today, 3), adults: 1, children: 0, notes: 'Arrive tard', total_amount: 285000, currency: 'XAF', source: 'PUBLIC_WIDGET', created_at: now, updated_at: now },
    { id: 'res-3', tenant_id: T, property_id: 'p-douala', customer_id: 'c-2', reference: 'HZ-2026-0003', status: 'CONFIRMED', check_in_date: addDaysISO(today, 1), check_out_date: addDaysISO(today, 4), adults: 2, children: 1, notes: null, total_amount: 165000, currency: 'XAF', source: 'BACK_OFFICE', created_at: now, updated_at: now },
    { id: 'res-4', tenant_id: T, property_id: 'p-bonapriso', customer_id: 'c-5', reference: 'HZ-2026-0004', status: 'CONFIRMED', check_in_date: addDaysISO(today, 2), check_out_date: addDaysISO(today, 9), adults: 3, children: 0, notes: null, total_amount: 840000, currency: 'XAF', source: 'PUBLIC_WIDGET', created_at: now, updated_at: now },
    { id: 'res-5', tenant_id: T, property_id: 'p-douala', customer_id: 'c-4', reference: 'HZ-2026-0005', status: 'PENDING', check_in_date: addDaysISO(today, 5), check_out_date: addDaysISO(today, 7), adults: 2, children: 2, notes: null, total_amount: 144000, currency: 'XAF', source: 'BACK_OFFICE', created_at: now, updated_at: now },
    { id: 'res-6', tenant_id: T, property_id: 'p-douala', customer_id: 'c-6', reference: 'HZ-2026-0006', status: 'CANCELLED', check_in_date: addDaysISO(today, -1), check_out_date: addDaysISO(today, 2), adults: 1, children: 0, notes: 'Vol annulé', total_amount: 105000, currency: 'XAF', source: 'BACK_OFFICE', created_at: now, updated_at: now },
    { id: 'res-7', tenant_id: T, property_id: 'p-douala', customer_id: 'c-7', reference: 'HZ-2026-0007', status: 'NO_SHOW', check_in_date: addDaysISO(today, -3), check_out_date: addDaysISO(today, -1), adults: 2, children: 0, notes: null, total_amount: 70000, currency: 'XAF', source: 'BACK_OFFICE', created_at: now, updated_at: now },
    { id: 'res-8', tenant_id: T, property_id: 'p-bonapriso', customer_id: 'c-8', reference: 'HZ-2026-0008', status: 'CHECKED_IN', check_in_date: addDaysISO(today, -1), check_out_date: addDaysISO(today, 6), adults: 2, children: 1, notes: null, total_amount: 840000, currency: 'XAF', source: 'BACK_OFFICE', created_at: now, updated_at: now },
    { id: 'res-9', tenant_id: T, property_id: 'p-douala', customer_id: 'c-1', reference: 'HZ-2026-0009', status: 'CONFIRMED', check_in_date: addDaysISO(today, 10), check_out_date: addDaysISO(today, 13), adults: 2, children: 0, notes: null, total_amount: 327750, currency: 'XAF', source: 'API', created_at: now, updated_at: now },
    { id: 'res-10', tenant_id: T, property_id: 'p-douala', customer_id: 'c-5', reference: 'HZ-2026-0010', status: 'CHECKED_OUT', check_in_date: addDaysISO(today, -20), check_out_date: addDaysISO(today, -16), adults: 1, children: 0, notes: null, total_amount: 220000, currency: 'XAF', source: 'BACK_OFFICE', created_at: now, updated_at: now },
  ].map((r) => ({
    ...r,
    check_in_time: r.id === 'res-2' ? '23:30:00' : r.id === 'res-4' ? '15:30:00' : '14:00:00',
    check_out_time: r.id === 'res-9' ? '10:00:00' : '12:00:00',
  }));

  const reservation_items: R[] = [
    { id: 'ri-1', tenant_id: T, reservation_id: 'res-1', room_id: 'r-101', room_type_id: 'rt-standard', nightly_rate: 55000, created_at: now },
    { id: 'ri-2', tenant_id: T, reservation_id: 'res-2', room_id: 'r-201', room_type_id: 'rt-deluxe', nightly_rate: 55000, created_at: now },
    { id: 'ri-3', tenant_id: T, reservation_id: 'res-3', room_id: 'r-102', room_type_id: 'rt-standard', nightly_rate: 55000, created_at: now },
    { id: 'ri-4', tenant_id: T, reservation_id: 'res-4', room_id: 'r-501', room_type_id: 'rt-t2', nightly_rate: 120000, created_at: now },
    { id: 'ri-5', tenant_id: T, reservation_id: 'res-5', room_id: 'r-401', room_type_id: 'rt-family', nightly_rate: 72000, created_at: now },
    { id: 'ri-6', tenant_id: T, reservation_id: 'res-6', room_id: 'r-103', room_type_id: 'rt-standard', nightly_rate: 35000, created_at: now },
    { id: 'ri-7', tenant_id: T, reservation_id: 'res-7', room_id: 'r-104', room_type_id: 'rt-standard', nightly_rate: 35000, created_at: now },
    { id: 'ri-8', tenant_id: T, reservation_id: 'res-8', room_id: 'r-502', room_type_id: 'rt-t2', nightly_rate: 120000, created_at: now },
    { id: 'ri-9', tenant_id: T, reservation_id: 'res-9', room_id: 'r-301', room_type_id: 'rt-suite', nightly_rate: 109250, created_at: now },
    { id: 'ri-10', tenant_id: T, reservation_id: 'res-10', room_id: 'r-202', room_type_id: 'rt-deluxe', nightly_rate: 55000, created_at: now },
  ];

  const reservation_guests: R[] = reservations.map((r, i) => ({
    id: `rg-${i + 1}`, tenant_id: T, reservation_id: r.id,
    full_name: String(customers.find((c) => c.id === r.customer_id)?.full_name ?? 'Client'),
    id_document: null, is_primary: true,
  }));

  const reservation_status_history: R[] = reservations.map((r, i) => ({
    id: `rsh-${i + 1}`, tenant_id: T, reservation_id: r.id, from_status: null, to_status: r.status,
    changed_by: 'u-reception', reason: null, created_at: now,
  }));

  const checkins: R[] = [
    { id: 'ck-1', tenant_id: T, reservation_id: 'res-2', room_id: 'r-201', actual_checkin_at: new Date(Date.now() - 2 * 86400000).toISOString(), performed_by: 'u-reception', created_at: now },
    { id: 'ck-2', tenant_id: T, reservation_id: 'res-8', room_id: 'r-502', actual_checkin_at: new Date(Date.now() - 1 * 86400000).toISOString(), performed_by: 'u-reception', created_at: now },
  ];

  const checkouts: R[] = [
    { id: 'co-1', tenant_id: T, reservation_id: 'res-1', room_id: 'r-101', actual_checkout_at: new Date(Date.now() - 9 * 86400000).toISOString(), balance_due: 0, balance_cleared: true, performed_by: 'u-reception', created_at: now },
    { id: 'co-2', tenant_id: T, reservation_id: 'res-10', room_id: 'r-202', actual_checkout_at: new Date(Date.now() - 16 * 86400000).toISOString(), balance_due: 0, balance_cleared: true, performed_by: 'u-reception', created_at: now },
  ];

  const services: R[] = [
    { id: 'sv-1', tenant_id: T, property_id: 'p-douala', name: 'Navette aéroport', description: 'Aller simple, véhicule climatisé.', price: 15000, currency: 'XAF', is_active: true, created_at: now },
    { id: 'sv-2', tenant_id: T, property_id: 'p-douala', name: 'Petit-déjeuner buffet', description: 'Par personne.', price: 5000, currency: 'XAF', is_active: true, created_at: now },
    { id: 'sv-3', tenant_id: T, property_id: 'p-douala', name: 'Blanchissage (panier)', description: 'Service 24h.', price: 8000, currency: 'XAF', is_active: true, created_at: now },
    { id: 'sv-4', tenant_id: T, property_id: 'p-douala', name: 'Massage bien-être', description: '1 heure.', price: 25000, currency: 'XAF', is_active: true, created_at: now },
    { id: 'sv-5', tenant_id: T, property_id: 'p-bonapriso', name: 'Ménage supplémentaire', description: 'Par séance.', price: 6000, currency: 'XAF', is_active: true, created_at: now },
  ];

  const service_orders: R[] = [
    { id: 'so-1', tenant_id: T, reservation_id: 'res-2', service_id: 'sv-1', service_name: 'Navette aéroport', unit_price: 15000, quantity: 1, total: 15000, currency: 'XAF', created_at: now },
    { id: 'so-2', tenant_id: T, reservation_id: 'res-2', service_id: 'sv-2', service_name: 'Petit-déjeuner buffet', unit_price: 5000, quantity: 2, total: 10000, currency: 'XAF', created_at: now },
    { id: 'so-3', tenant_id: T, reservation_id: 'res-1', service_id: 'sv-3', service_name: 'Blanchissage (panier)', unit_price: 8000, quantity: 1, total: 8000, currency: 'XAF', created_at: now },
  ];

  const housekeeping_tasks: R[] = [
    { id: 'hk-1', tenant_id: T, room_id: 'r-104', assigned_to: 'u-housekeeping', status: 'PENDING', priority: 'NORMAL', notes: 'Départ ce matin', scheduled_date: today, completed_at: null, created_at: now },
    { id: 'hk-2', tenant_id: T, room_id: 'r-105', assigned_to: 'u-housekeeping', status: 'IN_PROGRESS', priority: 'HIGH', notes: null, scheduled_date: today, completed_at: null, created_at: now },
    { id: 'hk-3', tenant_id: T, room_id: 'r-106', assigned_to: 'u-housekeeping', status: 'DONE', priority: 'NORMAL', notes: null, scheduled_date: addDaysISO(today, -1), completed_at: now, created_at: now },
    { id: 'hk-4', tenant_id: T, room_id: 'r-302', assigned_to: 'u-housekeeping', status: 'BLOCKED', priority: 'LOW', notes: 'Bloquée par maintenance', scheduled_date: today, completed_at: null, created_at: now },
  ];

  const housekeeping_logs: R[] = [
    { id: 'hl-1', tenant_id: T, task_id: 'hk-3', from_state: 'DIRTY', to_state: 'CLEAN', changed_by: 'u-housekeeping', created_at: now },
  ];

  const maintenance_tickets: R[] = [
    { id: 'mt-1', tenant_id: T, room_id: 'r-302', title: 'Fuite climatisation', description: 'Goutte à goutte au-dessus de la fenêtre.', status: 'IN_PROGRESS', priority: 'HIGH', reported_by: 'u-housekeeping', resolved_at: null, created_at: now },
    { id: 'mt-2', tenant_id: T, room_id: 'r-103', title: 'Ampoule grillée', description: null, status: 'OPEN', priority: 'LOW', reported_by: 'u-reception', resolved_at: null, created_at: now },
    { id: 'mt-3', tenant_id: T, room_id: 'r-201', title: 'Serrure électronique capricieuse', description: 'Carte parfois refusée.', status: 'RESOLVED', priority: 'NORMAL', reported_by: 'u-reception', resolved_at: now, created_at: now },
  ];

  const maintenance_logs: R[] = [
    { id: 'ml-1', tenant_id: T, ticket_id: 'mt-3', message: 'Pile remplacée, test OK.', changed_by: 'u-maintenance', created_at: now },
  ];

  const tax_rates: R[] = [
    { id: 'tx-1', tenant_id: T, name: 'TVA 19,25%', rate_percent: 19.25, is_default: true, created_at: now },
  ];

  const cancellation_policies: R[] = [
    { id: 'cp-1', tenant_id: T, name: 'Standard 24h', free_cancellation_hours: 24, penalty_percent: 20, created_at: now },
  ];

  const invoices: R[] = [
    { id: 'inv-1', tenant_id: T, reservation_id: 'res-1', number: 'FA-2026-0001', status: 'PAID', subtotal: 173000, tax_total: 33303, total: 206303, amount_paid: 206303, currency: 'XAF', issued_at: new Date(Date.now() - 9 * 86400000).toISOString(), voided_at: null, created_at: now },
    { id: 'inv-2', tenant_id: T, reservation_id: 'res-10', number: 'FA-2026-0002', status: 'PAID', subtotal: 220000, tax_total: 42350, total: 262350, amount_paid: 262350, currency: 'XAF', issued_at: new Date(Date.now() - 16 * 86400000).toISOString(), voided_at: null, created_at: now },
    { id: 'inv-3', tenant_id: T, reservation_id: 'res-2', number: 'FA-2026-0003', status: 'ISSUED', subtotal: 285000, tax_total: 54863, total: 339863, amount_paid: 150000, currency: 'XAF', issued_at: now, voided_at: null, created_at: now },
  ];

  const invoice_items: R[] = [
    { id: 'ii-1', tenant_id: T, invoice_id: 'inv-1', description: 'Chambre Standard ×3 nuits', quantity: 3, unit_price: 55000, total: 165000 },
    { id: 'ii-2', tenant_id: T, invoice_id: 'inv-1', description: 'Blanchissage (panier)', quantity: 1, unit_price: 8000, total: 8000 },
    { id: 'ii-3', tenant_id: T, invoice_id: 'inv-2', description: 'Chambre Deluxe ×4 nuits', quantity: 4, unit_price: 55000, total: 220000 },
    { id: 'ii-4', tenant_id: T, invoice_id: 'inv-3', description: 'Chambre Deluxe ×5 nuits', quantity: 5, unit_price: 55000, total: 275000 },
    { id: 'ii-5', tenant_id: T, invoice_id: 'inv-3', description: 'Navette aéroport', quantity: 1, unit_price: 15000, total: 15000 },
  ];

  const payments: R[] = [
    { id: 'pay-1', tenant_id: T, invoice_id: 'inv-1', reservation_id: 'res-1', amount: 206303, currency: 'XAF', method: 'CASH', status: 'SUCCEEDED', idempotency_key: 'seed-pay-1', provider_reference: null, created_at: now },
    { id: 'pay-2', tenant_id: T, invoice_id: 'inv-2', reservation_id: 'res-10', amount: 262350, currency: 'XAF', method: 'MOBILE_MONEY', status: 'SUCCEEDED', idempotency_key: 'seed-pay-2', provider_reference: 'MOMO-9911', created_at: now },
    { id: 'pay-3', tenant_id: T, invoice_id: 'inv-3', reservation_id: 'res-2', amount: 150000, currency: 'XAF', method: 'CARD', status: 'SUCCEEDED', idempotency_key: 'seed-pay-3', provider_reference: null, created_at: now },
  ];

  const payment_allocations: R[] = [
    { id: 'pa-1', tenant_id: T, payment_id: 'pay-1', invoice_id: 'inv-1', amount: 206303, created_at: now },
    { id: 'pa-2', tenant_id: T, payment_id: 'pay-2', invoice_id: 'inv-2', amount: 262350, created_at: now },
    { id: 'pa-3', tenant_id: T, payment_id: 'pay-3', invoice_id: 'inv-3', amount: 150000, created_at: now },
  ];

  const expense_categories: R[] = [
    { id: 'ec-1', tenant_id: T, name: 'Électricité', created_at: now },
    { id: 'ec-2', tenant_id: T, name: 'Personnel', created_at: now },
    { id: 'ec-3', tenant_id: T, name: 'Approvisionnement', created_at: now },
    { id: 'ec-4', tenant_id: T, name: 'Marketing', created_at: now },
  ];

  const suppliers: R[] = [
    { id: 'sup-1', tenant_id: T, name: 'Eneo Cameroun', contact_name: null, phone: null, email: null, created_at: now },
    { id: 'sup-2', tenant_id: T, name: 'Marché Central', contact_name: 'Mme Ada', phone: '+237 690 11 22 33', email: null, created_at: now },
    { id: 'sup-3', tenant_id: T, name: 'ProNetwork SARL', contact_name: 'M. Fouda', phone: '+237 677 99 88 77', email: 'contact@pronetwork.cm', created_at: now },
  ];

  const expenses: R[] = [
    { id: 'ex-1', tenant_id: T, category_id: 'ec-1', supplier_id: 'sup-1', property_id: 'p-douala', label: 'Facture électricité mai', amount: 185000, currency: 'XAF', spent_at: addDaysISO(today, -10), created_at: now },
    { id: 'ex-2', tenant_id: T, category_id: 'ec-2', supplier_id: null, property_id: 'p-douala', label: 'Salaires équipe ménage', amount: 450000, currency: 'XAF', spent_at: addDaysISO(today, -5), created_at: now },
    { id: 'ex-3', tenant_id: T, category_id: 'ec-3', supplier_id: 'sup-2', property_id: 'p-douala', label: 'Produits petit-déjeuner', amount: 95000, currency: 'XAF', spent_at: addDaysISO(today, -3), created_at: now },
    { id: 'ex-4', tenant_id: T, category_id: 'ec-4', supplier_id: 'sup-3', property_id: null, label: 'Campagne réseaux sociaux', amount: 150000, currency: 'XAF', spent_at: addDaysISO(today, -8), created_at: now },
  ];

  const notifications: R[] = [
    { id: 'nt-1', tenant_id: T, user_id: null, channel: 'IN_APP', event_key: 'reservation.created', title: 'Nouvelle réservation HZ-2026-0004', body: 'Kwame Mensah — T2 Bonapriso, 7 nuits.', read_at: null, created_at: now },
    { id: 'nt-2', tenant_id: T, user_id: null, channel: 'IN_APP', event_key: 'payment.succeeded', title: 'Paiement reçu 150 000 XAF', body: 'Facture FA-2026-0003 (partiel).', read_at: null, created_at: now },
    { id: 'nt-3', tenant_id: T, user_id: null, channel: 'IN_APP', event_key: 'housekeeping.task_created', title: 'Tâche ménage chambre 104', body: 'Planifiée aujourd’hui.', read_at: now, created_at: now },
  ];

  const audit_logs: R[] = [
    { id: 'al-1', tenant_id: T, actor_id: 'u-owner', action: 'tenant.created', entity: 'tenants', entity_id: T, before: null, after: { name: 'Zen Hôtels & Résidences' }, request_id: null, created_at: now },
    { id: 'al-2', tenant_id: T, actor_id: 'u-reception', action: 'reservation.created', entity: 'reservations', entity_id: 'res-3', before: null, after: { reference: 'HZ-2026-0003' }, request_id: null, created_at: now },
  ];

  const plans: R[] = [
    { id: 'pl-free', tenant_id: null, code: 'FREE', name: 'Gratuit', monthly_price: 0, currency: 'XAF', max_properties: 1, max_rooms: 5, max_users: 2, features: ['basic_pms'] },
    { id: 'pl-starter', tenant_id: null, code: 'STARTER', name: 'Starter', monthly_price: 15000, currency: 'XAF', max_properties: 1, max_rooms: 20, max_users: 5, features: ['basic_pms', 'public_widget'] },
    { id: 'pl-pro', tenant_id: null, code: 'PRO', name: 'Pro', monthly_price: 35000, currency: 'XAF', max_properties: 3, max_rooms: 100, max_users: 15, features: ['basic_pms', 'public_widget', 'reports', 'api'] },
    { id: 'pl-business', tenant_id: null, code: 'BUSINESS', name: 'Business', monthly_price: 75000, currency: 'XAF', max_properties: 10, max_rooms: 400, max_users: 50, features: ['basic_pms', 'public_widget', 'reports', 'api', 'ota_sync'] },
    { id: 'pl-enterprise', tenant_id: null, code: 'ENTERPRISE', name: 'Entreprise', monthly_price: 0, currency: 'XAF', max_properties: 999, max_rooms: 9999, max_users: 999, features: ['*'] },
  ];

  const subscriptions: R[] = [
    { id: 'sub-1', tenant_id: T, plan_id: 'pl-pro', status: 'ACTIVE', current_period_start: addDaysISO(today, -10), current_period_end: addDaysISO(today, 20), trial_end: null, created_at: now },
    { id: 'sub-b', tenant_id: DEMO_TENANT_B_ID, plan_id: 'pl-free', status: 'ACTIVE', current_period_start: addDaysISO(today, -40), current_period_end: addDaysISO(today, 350), trial_end: null, created_at: now },
  ];

  const feature_flags: R[] = [
    { id: 'ff-1', tenant_id: null, key: 'public_widget', enabled: true },
    { id: 'ff-2', tenant_id: null, key: 'ota_sync', enabled: false },
    { id: 'ff-3', tenant_id: null, key: 'mobile_money_gateway', enabled: true },
  ];

  return {
    users, sessions: new Map(), tenants, properties, buildings, room_types, rooms, amenities,
    room_amenities, rate_seasons, rates, rate_rules, customers, reservations, reservation_items,
    reservation_guests, reservation_status_history, checkins, checkouts, services, service_orders,
    housekeeping_tasks, housekeeping_logs, maintenance_tickets, maintenance_logs, tax_rates,
    cancellation_policies, invoices, invoice_items, payments, payment_allocations,
    expense_categories, expenses, suppliers, notifications, audit_logs, plans, subscriptions,
    feature_flags, counters: { reservation: 10, invoice: 3 },
  };
}
