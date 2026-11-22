import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const localEnvPath = resolve(projectRoot, '.env.development.local')
function readDotEnv(path) {
  const result = new Map()
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const name = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (value.startsWith('"')) value = JSON.parse(value)
    else if (value.startsWith("'")) value = value.slice(1, -1)
    result.set(name, value)
  }
  return result
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const env = readDotEnv(localEnvPath)
const baseUrl = new URL(env.get('VITE_SUPABASE_URL') ?? '')
assert(baseUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(baseUrl.hostname) && baseUrl.port === '54321', 'Refusing to run API security checks unless Supabase is the isolated loopback project on port 54321.')
assert(!baseUrl.pathname || baseUrl.pathname === '/', 'VITE_SUPABASE_URL must be the local project root URL.')

const apiUrl = (env.get('VITE_SUPABASE_URL') ?? '').replace(/\/$/, '')
const publishableKey = env.get('VITE_SUPABASE_PUBLISHABLE_KEY')
const password = env.get('VITE_LOCAL_DEV_PASSWORD')
const adminEmail = env.get('VITE_LOCAL_ADMIN_EMAIL')
const viewerEmail = env.get('VITE_LOCAL_VIEWER_EMAIL')
assert(publishableKey && password && adminEmail && viewerEmail, 'Local auth and API settings are incomplete; no request was made.')

const request = async (path, { method = 'GET', token, body, key = publishableKey, prefer } = {}) => {
  const headers = { apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}) }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (prefer) headers.prefer = prefer
  return fetch(`${apiUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
}

async function signIn(email) {
  const response = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  })
  assert(response.ok, `Local password sign-in failed for an allowlisted test role (HTTP ${response.status}); response details suppressed.`)
  return response.json()
}

async function assertProfile(session, expectedRole, roleLabel) {
  const response = await request(`/rest/v1/profiles?id=eq.${session.user.id}&select=id,role,full_name`, { token: session.access_token })
  assert(response.ok, `${roleLabel} profile read failed (HTTP ${response.status}).`)
  const [profile] = await response.json()
  assert(profile?.id === session.user.id && profile.role === expectedRole, `${roleLabel} profile does not have the expected local role.`)
}

async function assertAdminDenied(response, action) {
  assert(!response.ok, `Viewer unexpectedly succeeded at ${action}.`)
  let payload = {}
  try { payload = await response.json() } catch { /* Keep failure output free of backend details. */ }
  assert(/admin/i.test(payload.message ?? payload.msg ?? ''), `Viewer ${action} was rejected without the expected Admin-role guard (HTTP ${response.status}).`)
}

const adminSession = await signIn(adminEmail)
const viewerSession = await signIn(viewerEmail)
await assertProfile(adminSession, 'admin', 'Admin')
await assertProfile(viewerSession, 'viewer', 'Viewer')
console.log('PASS: local Admin and Viewer authenticate and resolve to their expected profiles.')

const adminOrders = await request('/rest/v1/orders?select=id&limit=1', { token: adminSession.access_token })
assert(adminOrders.ok, `Admin could not read orders (HTTP ${adminOrders.status}).`)
const viewerOrders = await request('/rest/v1/orders?select=id&limit=1', { token: viewerSession.access_token })
assert(viewerOrders.ok, `Viewer could not read orders (HTTP ${viewerOrders.status}).`)
console.log('PASS: Admin and Viewer can read the Orders API.')

const viewerPlanInsert = await request('/rest/v1/installment_plans', {
  method: 'POST',
  token: viewerSession.access_token,
  prefer: 'return=minimal',
  body: { name: `Local API QA probe ${randomUUID()}`, total_amount: 1234 },
})
assert([401, 403].includes(viewerPlanInsert.status), `Viewer plan insertion must be rejected by RLS (HTTP ${viewerPlanInsert.status}).`)
console.log('PASS: Viewer installment-plan insertion is denied by local RLS; no row was created.')

const viewerDelete = await request(`/rest/v1/orders?id=eq.${randomUUID()}`, {
  method: 'DELETE',
  token: viewerSession.access_token,
  prefer: 'return=minimal',
})
assert([401, 403].includes(viewerDelete.status), `Authenticated API must deny DELETE for business orders (HTTP ${viewerDelete.status}).`)
console.log('PASS: Viewer cannot issue an Orders DELETE through PostgREST.')

const adminOnlyCalls = [
  ['record_installment_payment', { p_plan_id: randomUUID(), p_paid_at: new Date().toISOString().slice(0, 10), p_amount: 1, p_note: 'Local QA authorization probe' }],
  ['soft_delete_order', { p_order_id: randomUUID() }],
  ['close_billing_cycle', { p_cycle_id: randomUUID() }],
  ['reopen_billing_cycle', { p_cycle_id: randomUUID() }],
]
for (const [rpc, body] of adminOnlyCalls) {
  const response = await request(`/rest/v1/rpc/${rpc}`, { method: 'POST', token: viewerSession.access_token, body })
  await assertAdminDenied(response, `calling ${rpc}`)
}
console.log('PASS: Viewer is rejected by installment, soft-delete, close, and reopen RPC role guards.')

