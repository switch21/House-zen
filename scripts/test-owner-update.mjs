/**
 * Test E2E de l'update tenant (devise) avec le JWT owner réel.
 * Reproduit le chemin exact du front: PATCH tenants?id=eq.<id> via PostgREST.
 */
const SB_URL = 'https://nbtbrwjvvxbdsixrzceh.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function main() {
  // 1. Login owner
  const loginRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({
      email: 'owner@house-zen.app',
      password: 'ZM!E@MXHV676Cx3MWk9',
    }),
  });
  const login = await loginRes.json();
  if (!login.access_token) {
    console.error('LOGIN FAILED:', JSON.stringify(login).slice(0, 300));
    process.exit(1);
  }
  const jwt = login.access_token;
  console.log('LOGIN OK, uid =', login.user?.id);

  const authHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };

  // 2. Read tenant (comme le front)
  const tenantsRes = await fetch(`${SB_URL}/rest/v1/tenants?select=*&limit=1`, {
    headers: authHeaders,
  });
  const tenants = await tenantsRes.json();
  console.log('READ tenants:', tenantsRes.status, JSON.stringify(tenants).slice(0, 200));
  const tenant = tenants[0];

  // 3. UPDATE currency (comme le bouton saveGeneral)
  const patchRes = await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${tenant.id}`, {
    method: 'PATCH',
    headers: { ...authHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({ currency: 'XAF', name: tenant.name, timezone: tenant.timezone }),
  });
  const patched = await patchRes.json();
  console.log('PATCH tenants:', patchRes.status, JSON.stringify(patched).slice(0, 400));

  // 4. Read memberships (comme TeamPage)
  const memRes = await fetch(`${SB_URL}/rest/v1/memberships?select=*`, { headers: authHeaders });
  const memberships = await memRes.json();
  console.log('READ memberships:', memRes.status, JSON.stringify(memberships).slice(0, 500));

  // 5. Read profiles (peut-être bloqué par RLS?)
  const profRes = await fetch(`${SB_URL}/rest/v1/profiles?select=id,email,full_name`, { headers: authHeaders });
  const profiles = await profRes.json();
  console.log('READ profiles:', profRes.status, JSON.stringify(profiles).slice(0, 500));

  // 6. Read tax_rates + cancellation_policies
  for (const t of ['tax_rates', 'cancellation_policies']) {
    const r = await fetch(`${SB_URL}/rest/v1/${t}?select=*`, { headers: authHeaders });
    console.log(`READ ${t}:`, r.status, JSON.stringify(await r.json()).slice(0, 200));
  }

  // 7. Test insert tax_rate (comme un futur CRUD taxes)
  const insRes = await fetch(`${SB_URL}/rest/v1/tax_rates`, {
    method: 'POST',
    headers: { ...authHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({ name: '__test_tvq__', rate_percent: 5, is_default: false }),
  });
  const ins = await insRes.json();
  console.log('INSERT tax_rates:', insRes.status, JSON.stringify(ins).slice(0, 300));
  if (insRes.ok && ins[0]?.id) {
    const delRes = await fetch(`${SB_URL}/rest/v1/tax_rates?id=eq.${ins[0].id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    console.log('DELETE test tax_rate:', delRes.status);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
