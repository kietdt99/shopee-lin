import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { loadLocalApiConfig, LocalApiConfigError } from './local-api-config.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const localEnvPath = resolve(projectRoot, '.env.development.local')

function assert(condition, message) {
  if (!condition) throw Object.assign(new Error(message), { safeToDisplay: true })
}

async function runApiSecurityChecks({ apiUrl, publishableKey, password, adminEmail, viewerEmail }) {
  const request = async (path, { method = 'GET', token, body, key = publishableKey, prefer } = {}) => {
    const headers = { apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}) }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (prefer) headers.prefer = prefer
    try {
      return await fetch(`${apiUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
    } catch {
      throw Object.assign(new Error('Could not reach isolated local Supabase. Start the local stack and retry; request details were suppressed.'), { safeToDisplay: true })
    }
  }

  async function signIn(email) {
    const response = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    })
    assert(response.ok, `Local password sign-in failed for an allowlisted test role (HTTP ${response.status}); response details suppressed.`)
    try {
      return await response.json()
    } catch {
      throw Object.assign(new Error('Local password sign-in returned an unreadable response; response details were suppressed.'), { safeToDisplay: true })
    }
  }

  async function assertProfile(session, expectedRole, roleLabel) {
    const response = await request(`/rest/v1/profiles?id=eq.${session.user.id}&select=id,role,full_name`, { token: session.access_token })
    assert(response.ok, `${roleLabel} profile read failed (HTTP ${response.status}).`)
    let profiles
    try {
      profiles = await response.json()
    } catch {
      throw Object.assign(new Error(`${roleLabel} profile read returned an unreadable response; response details were suppressed.`), { safeToDisplay: true })
    }
    const [profile] = profiles
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
}

try {
  await runApiSecurityChecks(loadLocalApiConfig(localEnvPath))
} catch (error) {
  const isSafeError = error instanceof LocalApiConfigError || (error && typeof error === 'object' && error.safeToDisplay === true)
  const safeMessage = isSafeError && error instanceof Error
    ? error.message
    : 'Local API security probe failed; unexpected diagnostic details were suppressed.'
  console.error(safeMessage)
  process.exitCode = 1
}

