/**
 * HOUSE-ZEN — REST API v1 gateway (Supabase Edge Function, Deno).
 *
 * Deploy:  supabase functions deploy api-v1
 * Secrets: SUPABASE_DB_URL (session pooler URI — enables the machine path),
 *          WEBHOOK_SECRET (inbound webhook HMAC), ALLOWED_ORIGINS.
 *
 * Auth (two mutually exclusive modes):
 *  1. API key  `X-API-Key: hz_…`  (machine-to-machine)
 *     - verified against api_keys via hz_verify_api_key (SHA-256 hash, migration 036)
 *     - the gateway enforces key SCOPES (read, write:reservations, write:payments,
 *       write:invoices, write:customers) BEFORE any SQL runs
 *     - business RPCs run through a direct pg transaction with TRANSACTION-LOCAL
 *       GUCs (hz.tenant_id, hz.api_role — migration 051): the SECURITY DEFINER
 *       functions keep their permission checks, scoped to the key's tenant,
 *       with zero cross-request leakage on pooled connections.
 *  2. User JWT `Authorization: Bearer <supabase jwt>` (same routes)
 *     - a user-scoped supabase client is used; PostgreSQL RLS + the same
 *       SECURITY DEFINER functions scope everything server-side.
 *
 * Conventions (docs/api.md): { items, total, page, page_size } pagination,
 * { error: { code, message, request_id } } errors, Idempotency-Key on writes
 * replayed from api_idempotency, X-Request-Id echo, per-key rate limiting.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { Pool } from "npm:pg@8.16.3";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Environment (server-only secrets — NEVER exposed to the frontend bundle)
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
  .split(",").map((s) => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!DB_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: DB_URL, max: 4, idleTimeoutMillis: 20_000 });
  }
  return pool;
}

interface SqlClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/** Machine-path transaction: transaction-local tenant/role context (051). */
async function withTenantTx<T>(
  tenantId: string,
  fn: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  const p = getPool();
  if (!p) {
    throw new HttpError(503, "GATEWAY_DB_UNCONFIGURED", "SUPABASE_DB_URL secret is not configured for the API gateway");
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('hz.tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('hz.api_role', 'receptionist', true)");
    const result = await fn({
      query: (text, params = []) => client.query(text, params as never[]),
    });
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* already closed */ }
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes("*") ? "*" : (ALLOWED_ORIGINS[0] ?? "*"),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-api-key, x-request-id, idempotency-key, x-hz-signature",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

function json(req: Request, requestId: string, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", "X-Request-Id": requestId },
  });
}

function errorJson(req: Request, requestId: string, e: unknown): Response {
  if (e instanceof HttpError) {
    return json(req, requestId, e.status, {
      error: { code: e.code, message: e.message, request_id: requestId },
    });
  }
  const mapped = mapDomainError(e);
  return json(req, requestId, mapped.status, {
    error: { code: mapped.code, message: mapped.message, request_id: requestId },
  });
}

/** SQL/PostgREST error → status + domain code (docs/api.md). */
function mapDomainError(e: unknown): { status: number; code: string; message: string } {
  const raw = e instanceof Error ? e.message : String(e);
  const codeMatch = raw.match(
    /\b(ROOM_UNAVAILABLE|INVALID_DATES|QUOTA_EXCEEDED|BALANCE_DUE|PERMISSION_DENIED|IDEMPOTENCY_CONFLICT|ROOM_NOT_FOUND|NOT_FOUND|INVALID_STATE|VALIDATION)\b/,
  );
  const code = codeMatch?.[1] ?? "INTERNAL_ERROR";
  const statusByCode: Record<string, number> = {
    ROOM_UNAVAILABLE: 409, INVALID_DATES: 409, ROOM_NOT_FOUND: 404, NOT_FOUND: 404,
    QUOTA_EXCEEDED: 402, BALANCE_DUE: 409, PERMISSION_DENIED: 403,
    IDEMPOTENCY_CONFLICT: 422, INVALID_STATE: 409, VALIDATION: 400,
  };
  return { status: statusByCode[code] ?? 400, code, message: raw.slice(0, 400) };
}

// ---------------------------------------------------------------------------
// Rate limiting (per key — per instance; front the gateway with a CDN/WAF
// budget for global limits — documented in docs/api.md)
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(identity: string): void {
  const now = Date.now();
  const bucket = rateBuckets.get(identity);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(identity, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000);
    throw new HttpError(429, "RATE_LIMITED", `Too many requests — retry in ${retry}s`);
  }
  if (rateBuckets.size > 10_000) {
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Auth contexts
// ---------------------------------------------------------------------------
interface ScopeSpec {
  mode: "key" | "jwt";
  tenantId: string;
  scopes: string[];
  sb: SupabaseClient;
}

function requireScope(ctx: ScopeSpec, required: string): void {
  if (ctx.mode === "jwt") return; // RLS + SQL permissions are the authority
  if (!ctx.scopes.includes("admin") && !ctx.scopes.includes(required)) {
    throw new HttpError(403, "SCOPE_MISSING", `API key missing required scope: ${required}`);
  }
}

async function authenticate(req: Request): Promise<ScopeSpec> {
  const apiKey = req.headers.get("x-api-key");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (apiKey) {
    const { data, error } = await service.rpc("hz_verify_api_key", { p_raw_key: apiKey });
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      throw new HttpError(401, "INVALID_API_KEY", "Unknown or revoked API key");
    }
    const row = (Array.isArray(data) ? data[0] : data) as {
      tenant_id: string; scopes: string[];
    };
    return { mode: "key", tenantId: row.tenant_id, scopes: row.scopes ?? ["read"], sb: service };
  }

  if (bearer) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      throw new HttpError(401, "INVALID_TOKEN", "Invalid or expired bearer token");
    }
    const { data: memberships, error: mErr } = await userClient
      .from("memberships").select("tenant_id").limit(1);
    if (mErr || !memberships || memberships.length === 0) {
      throw new HttpError(403, "NO_TENANT", "No tenant membership for this user");
    }
    return { mode: "jwt", tenantId: memberships[0]!.tenant_id as string, scopes: [], sb: userClient };
  }

  throw new HttpError(401, "UNAUTHENTICATED", "Provide X-API-Key or Authorization: Bearer");
}

// ---------------------------------------------------------------------------
// Idempotency (api_idempotency — migration 035)
// ---------------------------------------------------------------------------
function bodyHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

async function idempotencyReplay(
  tenantId: string, key: string, endpoint: string, hash: string,
): Promise<{ status: number; body: unknown } | null> {
  const { data, error } = await service
    .from("api_idempotency")
    .select("request_hash, response, status_code")
    .eq("tenant_id", tenantId)
    .eq("key", key)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error || !data) return null;
  if (data.request_hash !== hash) {
    throw new HttpError(422, "IDEMPOTENCY_CONFLICT", "Idempotency-Key reused with a different payload");
  }
  return { status: data.status_code ?? 200, body: data.response };
}

async function idempotencyStore(
  tenantId: string, key: string, endpoint: string, hash: string, status: number, body: unknown,
): Promise<void> {
  await service.from("api_idempotency").upsert({
    tenant_id: tenantId, key, endpoint, request_hash: hash,
    response: body as never, status_code: status,
  }, { onConflict: "tenant_id,key" });
}

// ---------------------------------------------------------------------------
// Pagination + generic tenant-scoped list (docs/api.md conventions)
// ---------------------------------------------------------------------------
function pagination(url: URL): { page: number; pageSize: number; from: number; to: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("page_size") ?? 50) || 50));
  return { page, pageSize, from: (page - 1) * pageSize, to: (page - 1) * pageSize + pageSize - 1 };
}

const READ_FILTERS = ["status", "property_id", "room_type_id", "reservation_id", "invoice_id", "customer_id"];

async function tenantList(
  ctx: ScopeSpec, table: string, url: URL, defaultOrder: string,
): Promise<Response> {
  const { page, pageSize, from, to } = pagination(url);
  let query = ctx.sb.from(table).select("*", { count: "exact" }).range(from, to);
  if (ctx.mode === "key") query = query.eq("tenant_id", ctx.tenantId);
  for (const [k, v] of url.searchParams) {
    if (READ_FILTERS.includes(k) && v) query = query.eq(k, v);
  }
  const order = url.searchParams.get("sort") ?? defaultOrder;
  const asc = (url.searchParams.get("order") ?? "desc") === "asc";
  const { data, error, count } = await query.order(order, { ascending: asc });
  if (error) throw new Error(error.message);
  return Response.json({ items: data ?? [], total: count ?? 0, page, page_size: pageSize });
}

/** RPC on both paths: JWT → user client (RLS); API key → tenant tx (GUC 051). */
async function rpc<T>(ctx: ScopeSpec, fn: string, args: Record<string, unknown>): Promise<T> {
  if (ctx.mode === "jwt") {
    const { data, error } = await ctx.sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  return withTenantTx(ctx.tenantId, async (sql) => {
    const params = Object.values(args);
    const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await sql.query(`select * from ${fn}(${placeholders})`, params);
    return (rows[0] ?? null) as T;
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------
const API_PREFIX = "/api/v1";

async function handle(req: Request, url: URL, requestId: string): Promise<Response> {
  const path = url.pathname.replace(API_PREFIX, "") || "/";
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") return new Response("ok", { status: 204, headers: corsHeaders() });
  if (path === "/health") {
    return json(req, requestId, 200, { ok: true, service: "house-zen-api", version: "1.0.0" });
  }

  const ctx = await authenticate(req);
  rateLimit(`${ctx.mode}:${ctx.tenantId}`);

  // ---- Reads ------------------------------------------------------------
  if (method === "GET") {
    requireScope(ctx, "read");
    if (path === "/properties") return tenantList(ctx, "properties", url, "created_at");
    if (path === "/rooms") return tenantList(ctx, "rooms", url, "room_number");
    if (path === "/customers") return tenantList(ctx, "customers", url, "created_at");
    if (path === "/invoices") return tenantList(ctx, "invoices", url, "created_at");
    if (path === "/availability") {
      const propertyId = url.searchParams.get("property_id");
      const checkIn = url.searchParams.get("check_in");
      const checkOut = url.searchParams.get("check_out");
      const adults = Number(url.searchParams.get("adults") ?? 1);
      if (!propertyId || !checkIn || !checkOut) {
        throw new HttpError(400, "VALIDATION", "property_id, check_in, check_out are required");
      }
      const rows = await rpc<Record<string, unknown>[]>(ctx, "search_available_room_types", {
        p_property_id: propertyId, p_check_in: checkIn, p_check_out: checkOut, p_adults: adults,
      });
      return json(req, requestId, 200, { items: rows ?? [] });
    }
    if (path === "/reports/kpis") {
      const kpis = await rpc<Record<string, unknown>>(ctx, "dashboard_kpis", {});
      return json(req, requestId, 200, kpis);
    }
  }

  // ---- Reservations ------------------------------------------------------
  if (method === "POST" && path === "/reservations") {
    requireScope(ctx, "write:reservations");
    const body = await req.json();
    const idemKey = req.headers.get("idempotency-key");
    if (!idemKey) throw new HttpError(400, "VALIDATION", "Idempotency-Key header is required");
    const hash = bodyHash(body);
    const replay = await idempotencyReplay(ctx.tenantId, idemKey, path, hash);
    if (replay) return json(req, requestId, replay.status, replay.body);
    for (const field of ["property_id", "customer_id", "room_id", "room_type_id", "check_in_date", "check_out_date"]) {
      if (!body[field]) throw new HttpError(400, "VALIDATION", `${field} is required`);
    }
    const created = await rpc<Record<string, unknown>>(ctx, "create_reservation_atomic", {
      p_property_id: body.property_id,
      p_customer_id: body.customer_id,
      p_room_id: body.room_id,
      p_room_type_id: body.room_type_id,
      p_check_in: body.check_in_date,
      p_check_out: body.check_out_date,
      p_adults: Number(body.adults ?? 1),
      p_children: Number(body.children ?? 0),
      p_notes: body.notes ?? null,
      p_source: body.source ?? "API",
      p_services: JSON.stringify(body.services ?? []),
    });
    const payload = {
      reservation: created,
      reference: (created as { reference?: string })?.reference ?? null,
    };
    await idempotencyStore(ctx.tenantId, idemKey, path, hash, 201, payload);
    return json(req, requestId, 201, payload);
  }

  const reservationAction = path.match(/^\/reservations\/([\w-]+)\/(checkin|checkout)$/);
  if (method === "POST" && reservationAction) {
    requireScope(ctx, "write:reservations");
    const [, id, action] = reservationAction;
    if (action === "checkin") {
      await rpc(ctx, "perform_checkin", { p_reservation_id: id });
      return json(req, requestId, 200, { ok: true });
    }
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const result = await rpc<Record<string, unknown>>(ctx, "perform_checkout", {
      p_reservation_id: id,
      p_clear_balance: Boolean((body as { clear_balance?: boolean }).clear_balance),
    });
    return json(req, requestId, 200, result ?? { ok: true });
  }

  const statusAction = path.match(/^\/reservations\/([\w-]+)\/status$/);
  if (method === "PATCH" && statusAction) {
    requireScope(ctx, "write:reservations");
    const [, id] = statusAction;
    const body = await req.json();
    const updated = await rpc<Record<string, unknown>>(ctx, "update_reservation_status", {
      p_reservation_id: id, p_to_status: body.to, p_reason: body.reason ?? null,
    });
    return json(req, requestId, 200, { reservation: updated });
  }

  // ---- Customers ---------------------------------------------------------
  if (method === "POST" && path === "/customers") {
    requireScope(ctx, "write:customers");
    const body = await req.json();
    const { data, error } = await ctx.sb.from("customers").insert({
      ...body, tenant_id: ctx.tenantId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return json(req, requestId, 201, data);
  }

  const customerPatch = path.match(/^\/customers\/([\w-]+)$/);
  if (method === "PATCH" && customerPatch) {
    requireScope(ctx, "write:customers");
    const body = await req.json();
    let query = ctx.sb.from("customers").update(body);
    if (ctx.mode === "key") query = query.eq("tenant_id", ctx.tenantId);
    const { data, error } = await query.eq("id", customerPatch[1]!).select("*").single();
    if (error) throw new Error(error.message);
    return json(req, requestId, 200, data);
  }

  // ---- Invoices ----------------------------------------------------------
  if (method === "POST" && path === "/invoices") {
    requireScope(ctx, "write:invoices");
    const body = await req.json();
    if (!body.reservation_id) throw new HttpError(400, "VALIDATION", "reservation_id is required");
    const idempotencyKey = req.headers.get("idempotency-key");
    const hash = bodyHash(body);
    if (idempotencyKey) {
      const replay = await idempotencyReplay(ctx.tenantId, idempotencyKey, path, hash);
      if (replay) return json(req, requestId, replay.status, replay.body);
    }
    const invoiceId = await rpc<string>(ctx, "create_invoice_from_reservation", {
      p_reservation_id: body.reservation_id,
    });
    const payload = { invoice_id: invoiceId };
    if (idempotencyKey) await idempotencyStore(ctx.tenantId, idempotencyKey, path, hash, 201, payload);
    return json(req, requestId, 201, payload);
  }

  const invoiceAction = path.match(/^\/invoices\/([\w-]+)\/(issue|void)$/);
  if (method === "POST" && invoiceAction) {
    requireScope(ctx, "write:invoices");
    const [, id, action] = invoiceAction;
    if (action === "issue") {
      await rpc(ctx, "issue_invoice", { p_invoice_id: id });
    } else {
      const body = await req.json();
      await rpc(ctx, "void_invoice", { p_invoice_id: id, p_reason: body.reason ?? null });
    }
    return json(req, requestId, 200, { ok: true });
  }

  // ---- Payments ----------------------------------------------------------
  if (method === "POST" && path === "/payments") {
    requireScope(ctx, "write:payments");
    const body = await req.json();
    const idemKey = req.headers.get("idempotency-key") ?? body.idempotency_key;
    if (!idemKey) throw new HttpError(400, "VALIDATION", "Idempotency-Key is required");
    const hash = bodyHash(body);
    const replay = await idempotencyReplay(ctx.tenantId, idemKey, path, hash);
    if (replay) return json(req, requestId, replay.status, replay.body);
    const payment = await rpc<Record<string, unknown>>(ctx, "record_payment", {
      p_invoice_id: body.invoice_id ?? null,
      p_reservation_id: body.reservation_id ?? null,
      p_amount: Number(body.amount),
      p_method: body.method,
      p_idempotency_key: idemKey,
    });
    await idempotencyStore(ctx.tenantId, idemKey, path, hash, 201, { payment });
    return json(req, requestId, 201, { payment });
  }

  // ---- Inbound webhook (payment provider → HOUSE-ZEN) --------------------
  if (method === "POST" && path === "/webhooks/payment") {
    const raw = await req.text();
    const signature = req.headers.get("x-hz-signature") ?? "";
    if (!WEBHOOK_SECRET) throw new HttpError(503, "WEBHOOK_UNCONFIGURED", "WEBHOOK_SECRET is not set");
    const expected = createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
    const a = new TextEncoder().encode(expected);
    const b = new TextEncoder().encode(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpError(401, "INVALID_SIGNATURE", "Webhook signature mismatch");
    }
    const event = JSON.parse(raw) as {
      reference: string; amount: number; method: string; idempotency_key: string;
    };
    const idemKey = `webhook:${event.idempotency_key}`;
    const replay = await idempotencyReplay(ctx.tenantId, idemKey, path, bodyHash(event));
    if (replay) return json(req, requestId, replay.status, replay.body);
    // Tenant derived server-side from the reservation reference — never from the payload.
    const { data: reservation, error: resErr } = await service
      .from("reservations").select("id, tenant_id").eq("reference", event.reference).maybeSingle();
    if (resErr || !reservation) throw new HttpError(404, "NOT_FOUND", "Unknown reservation reference");
    const row = reservation as { id: string; tenant_id: string };
    const payment = await withTenantTx(row.tenant_id, async (sql) => {
      const { rows } = await sql.query(
        "select * from record_payment($1, $2, $3, $4::payment_method, $5)",
        [null, row.id, event.amount, event.method, idemKey],
      );
      return rows[0];
    });
    const payload = { processed: true, payment };
    await idempotencyStore(ctx.tenantId, idemKey, path, bodyHash(event), 200, payload);
    return json(req, requestId, 200, payload);
  }

  throw new HttpError(404, "NOT_FOUND", `No route for ${method} ${path}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const url = new URL(req.url);
  try {
    return await handle(req, url, requestId);
  } catch (e) {
    return errorJson(req, requestId, e);
  }
});
