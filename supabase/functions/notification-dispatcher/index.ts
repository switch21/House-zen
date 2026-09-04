/**
 * HOUSE-ZEN — Notification dispatcher (Supabase Edge Function, Deno).
 *
 * Drains notification_deliveries (migration 038) for the OUTBOUND channels
 * (EMAIL / SMS / WHATSAPP) and pushes each QUEUED delivery to its provider.
 * IN_APP rows are NOT dispatched here — they are written directly by the
 * notification engine and consumed in-app.
 *
 * Deploy:  supabase functions deploy notification-dispatcher
 * Secrets: SUPABASE_DB_URL  (session pooler URI — claim/update transactions)
 *          Optional providers (absent → deliveries fail closed, see below):
 *            RESEND_API_KEY + MAIL_FROM                  → EMAIL (Resend)
 *            TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
 *              + TWILIO_SMS_FROM / TWILIO_WHATSAPP_FROM  → SMS / WHATSAPP (Twilio)
 *          DISPATCHER_LOG_ONLY=1 → staging sink: marks SENT with a `log:`
 *            provider id instead of calling a real provider (explicit opt-in,
 *            never silent: the response reports provider="log").
 *
 * Invoke:  POST /functions/v1/notification-dispatcher
 *          Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>   (or CRON secret)
 *          Body: { "batch_size"?: number }   (default 25, max 100)
 *
 * Semantics (pg-boss style, at-least-once):
 *  - claim:   TX 1 — SELECT … FOR UPDATE SKIP LOCKED, then attempts+1 and a
 *             LEASE (next_retry_at = now()+lease) as visibility timeout; locks
 *             are released BEFORE any provider call (no HTTP inside a DB tx);
 *  - send:    provider REST call outside any transaction, per-delivery
 *             try/catch;
 *  - success: TX 2 — status SENT, guarded `WHERE id=$1 AND status='QUEUED'`;
 *  - failure: next_retry_at = now() + min(2^attempts, 60) minutes backoff;
 *             attempts >= MAX_ATTEMPTS → DEAD_LETTER (ops alert runbook §DLQ);
 *  - crash after claim: the lease expires and another worker re-claims —
 *             at-least-once delivery; a provider MAY see a duplicate after a
 *             worker crash mid-send (documented, same guarantee as pg-boss);
 *  - a crashed final attempt (attempts >= MAX, stuck QUEUED) is swept to
 *             DEAD_LETTER by the janitor clause in the claim query;
 *  - no provider configured for a channel → treated as a failure (fail
 *             closed — the queue NEVER pretends to be sent).
 */

import { Pool } from "npm:pg@8.11.5";

const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const LOG_ONLY = (Deno.env.get("DISPATCHER_LOG_ONLY") ?? "") === "1";

const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MIN = 60;
const DEFAULT_BATCH = 25;
const MAX_BATCH = 100;
const LEASE_SECONDS = 300; // visibility timeout: claimed rows survive a crash

type Channel = "EMAIL" | "SMS" | "WHATSAPP";

interface QueuedDelivery {
  id: string;
  tenant_id: string;
  channel: Channel;
  recipient: string | null;
  title: string;
  body: string;
  attempts: number;
}

interface SendOutcome {
  ok: boolean;
  providerId: string | null;
  error: string | null;
}

interface DispatchResult {
  claimed: number;
  sent: number;
  retried: number;
  dead_lettered: number;
  provider: string;
  errors: string[];
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// DB access (same pool pattern as api-v1 — migration 051 pool hygiene)
// ---------------------------------------------------------------------------
let pool: Pool | null = null;
function getPool(): Pool {
  if (!DB_URL) {
    throw new HttpError(
      503,
      "DISPATCHER_DB_UNCONFIGURED",
      "SUPABASE_DB_URL secret is not configured for the notification dispatcher",
    );
  }
  if (!pool) {
    pool = new Pool({ connectionString: DB_URL, max: 2, idleTimeoutMillis: 20_000 });
  }
  return pool;
}

interface SqlClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

async function withTx<T>(fn: (sql: SqlClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn({
      query: (text, params = []) => client.query(text, params as never[]),
    });
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already broken */
    }
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Provider adapters — one per channel, config-driven, no silent fallbacks.
// ---------------------------------------------------------------------------
interface ProviderAdapter {
  readonly name: string;
  send(d: QueuedDelivery): Promise<SendOutcome>;
}

const resendAdapter: ProviderAdapter = {
  name: "resend",
  async send(d) {
    const key = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("MAIL_FROM");
    if (!key || !from) return { ok: false, providerId: null, error: "PROVIDER_NOT_CONFIGURED" };
    if (!d.recipient) return { ok: false, providerId: null, error: "MISSING_RECIPIENT" };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [d.recipient],
        subject: d.title || "(no subject)",
        text: d.body,
      }),
    });
    if (!res.ok) {
      return { ok: false, providerId: null, error: `RESEND_HTTP_${res.status}` };
    }
    const json = await res.json() as { id?: string };
    return { ok: true, providerId: json.id ?? "resend:accepted", error: null };
  },
};

function twilioAdapter(kind: "SMS" | "WHATSAPP"): ProviderAdapter {
  return {
    name: `twilio-${kind.toLowerCase()}`,
    async send(d) {
      const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const token = Deno.env.get("TWILIO_AUTH_TOKEN");
      const fromKey = kind === "SMS" ? "TWILIO_SMS_FROM" : "TWILIO_WHATSAPP_FROM";
      const from = Deno.env.get(fromKey);
      if (!sid || !token || !from) {
        return { ok: false, providerId: null, error: "PROVIDER_NOT_CONFIGURED" };
      }
      if (!d.recipient) return { ok: false, providerId: null, error: "MISSING_RECIPIENT" };
      const to = kind === "WHATSAPP" && !d.recipient.startsWith("whatsapp:")
        ? `whatsapp:${d.recipient}`
        : d.recipient;
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: from, To: to, Body: `${d.title}\n${d.body}`.trim() }),
        },
      );
      if (!res.ok) {
        return { ok: false, providerId: null, error: `TWILIO_HTTP_${res.status}` };
      }
      const json = await res.json() as { sid?: string };
      return { ok: true, providerId: json.sid ?? "twilio:accepted", error: null };
    },
  };
}

/** Explicit staging sink — only when DISPATCHER_LOG_ONLY=1. */
const logAdapter: ProviderAdapter = {
  name: "log",
  async send(d) {
    console.log(
      `[dispatcher:log] tenant=${d.tenant_id} channel=${d.channel} to=${d.recipient} subject="${d.title}"`,
    );
    return { ok: true, providerId: "log:simulated-send", error: null };
  },
};

function adapterFor(channel: Channel): ProviderAdapter | null {
  if (LOG_ONLY) return logAdapter;
  switch (channel) {
    case "EMAIL":
      return resendAdapter;
    case "SMS":
      return twilioAdapter("SMS");
    case "WHATSAPP":
      return twilioAdapter("WHATSAPP");
  }
}

// ---------------------------------------------------------------------------
// Worker core
// ---------------------------------------------------------------------------
function backoffSeconds(attempts: number): number {
  // 1st retry after ~2 min, then 4, 8, 16 … capped at 60 min.
  return Math.min(2 ** Math.max(attempts, 1), MAX_BACKOFF_MIN) * 60;
}

async function claimBatch(sql: SqlClient, batchSize: number): Promise<QueuedDelivery[]> {
  // Janitor first: a crash mid-final-attempt leaves rows QUEUED with exhausted
  // attempts and an expired lease — convert them to DEAD_LETTER for ops.
  await sql.query(
    `update notification_deliveries
        set status = 'DEAD_LETTER', next_retry_at = null
      where status = 'QUEUED'
        and attempts >= $1
        and (next_retry_at is null or next_retry_at <= now() - interval '1 hour')`,
    [MAX_ATTEMPTS],
  );

  // Claim + lease in the SAME transaction: attempts+1 and next_retry_at act
  // as the visibility timeout; row locks are released on COMMIT, BEFORE any
  // provider HTTP call happens (SQL UPSERT semantics: one worker per row).
  const { rows } = await sql.query(
    `update notification_deliveries d
        set attempts = d.attempts + 1,
            next_retry_at = now() + ($2 || ' seconds')::interval
       from (
         select id
           from notification_deliveries
          where status = 'QUEUED'
            and channel in ('EMAIL','SMS','WHATSAPP')
            and attempts < $3
            and (next_retry_at is null or next_retry_at <= now())
          order by created_at
          limit $1
          for update skip locked
       ) claimed
      where d.id = claimed.id
      returning d.id, d.tenant_id, d.channel, d.recipient, d.title, d.body, d.attempts`,
    [batchSize, LEASE_SECONDS, MAX_ATTEMPTS],
  );
  return rows as unknown as QueuedDelivery[];
}

async function markSent(sql: SqlClient, d: QueuedDelivery, result: DispatchResult): Promise<void> {
  const { rowCount } = await sql.query(
    `update notification_deliveries
        set status = 'SENT', sent_at = now(), next_retry_at = null
      where id = $1 and status = 'QUEUED'`,
    [d.id],
  );
  if (rowCount) result.sent += 1;
}

async function markFailure(
  sql: SqlClient,
  d: QueuedDelivery,
  error: string,
  result: DispatchResult,
): Promise<void> {
  if (d.attempts >= MAX_ATTEMPTS) {
    const { rowCount } = await sql.query(
      `update notification_deliveries
          set status = 'DEAD_LETTER', next_retry_at = null
        where id = $1 and status = 'QUEUED'`,
      [d.id],
    );
    if (rowCount) result.dead_lettered += 1;
    result.errors.push(`${d.id}: ${error} (dead-lettered after ${d.attempts} attempts)`);
    return;
  }

  const { rowCount } = await sql.query(
    `update notification_deliveries
        set next_retry_at = now() + ($2 || ' seconds')::interval
      where id = $1 and status = 'QUEUED'`,
    [d.id, backoffSeconds(d.attempts)],
  );
  if (rowCount) result.retried += 1;
  result.errors.push(`${d.id}: ${error} (retry after attempt ${d.attempts}/${MAX_ATTEMPTS})`);
}

async function settle(
  sql: SqlClient,
  d: QueuedDelivery,
  outcome: SendOutcome,
  result: DispatchResult,
): Promise<void> {
  if (outcome.ok) {
    await markSent(sql, d, result);
    return;
  }
  await markFailure(sql, d, outcome.error ?? "PROVIDER_ERROR", result);
}

async function dispatchBatch(batchSize: number): Promise<DispatchResult> {
  const result: DispatchResult = {
    claimed: 0,
    sent: 0,
    retried: 0,
    dead_lettered: 0,
    provider: LOG_ONLY ? "log" : "mixed",
    errors: [],
  };

  // TX 1 — claim + lease; locks released before any provider call.
  const batch = await withTx((sql) => claimBatch(sql, batchSize));
  result.claimed = batch.length;

  // Provider calls OUTSIDE any DB transaction.
  const outcomes: { d: QueuedDelivery; outcome: SendOutcome }[] = [];
  for (const d of batch) {
    const adapter = adapterFor(d.channel);
    let outcome: SendOutcome;
    if (!adapter) {
      outcome = { ok: false, providerId: null, error: "PROVIDER_NOT_CONFIGURED" };
    } else {
      try {
        outcome = await adapter.send(d);
      } catch (e) {
        outcome = { ok: false, providerId: null, error: `PROVIDER_THROW:${String(e)}` };
      }
    }
    outcomes.push({ d, outcome });
  }

  // TX 2 — settle the whole batch (guarded updates).
  await withTx(async (sql) => {
    for (const { d, outcome } of outcomes) {
      await settle(sql, d, outcome, result);
    }
    return result;
  });

  return result;
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });

  try {
    if (req.method !== "POST") {
      return json(405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST only", request_id: requestId } });
    }

    // Service-role/CRON only: the dispatcher is infrastructure, never user-facing.
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("DISPATCHER_CRON_SECRET") ?? "";
    const authorized = (serviceKey && token === serviceKey) || (cronSecret && token === cronSecret);
    if (!authorized) {
      return json(401, { error: { code: "UNAUTHORIZED", message: "service role or cron secret required", request_id: requestId } });
    }

    let batchSize = DEFAULT_BATCH;
    try {
      const body = await req.json() as { batch_size?: number };
      if (typeof body.batch_size === "number") {
        batchSize = Math.min(Math.max(Math.trunc(body.batch_size), 1), MAX_BATCH);
      }
    } catch {
      /* empty body → default batch */
    }

    const result = await dispatchBatch(batchSize);
    return json(200, { ...result, request_id: requestId });
  } catch (e) {
    if (e instanceof HttpError) {
      return json(e.status, { error: { code: e.code, message: e.message, request_id: requestId } });
    }
    console.error(`[dispatcher] unhandled: ${String(e)}`);
    return json(500, { error: { code: "INTERNAL", message: "dispatcher failure", request_id: requestId } });
  }
});
