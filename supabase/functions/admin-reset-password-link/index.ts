import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'https://kietdt99.github.io',
])

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins.has(origin)) return Response.json({ error: 'Origin not allowed' }, { status: 403 })

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Authentication required' }, { status: 401, headers: corsHeaders })

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user: requester }, error: authError } = await userClient.auth.getUser()
    if (authError || !requester) return Response.json({ error: 'Invalid session' }, { status: 401, headers: corsHeaders })

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: requesterProfile, error: requesterProfileError } = await adminClient
      .from('profiles').select('role').eq('id', requester.id).single()
    if (requesterProfileError || !requesterProfile || requesterProfile.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders })
    }

    const body = await request.json()
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : ''
    let redirectUrl: URL | null = null
    if (typeof body.redirectUrl === 'string') {
      try { redirectUrl = new URL(body.redirectUrl) } catch { /* reject malformed redirect */ }
    }
    if (!targetUserId || !redirectUrl || !allowedRedirect(redirectUrl)) {
      return Response.json({ error: 'Invalid target account or redirect URL' }, { status: 400, headers: corsHeaders })
    }

    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles').select('email,role').eq('id', targetUserId).single()
    if (targetError || !targetProfile || targetProfile.role !== 'viewer') {
      return Response.json({ error: 'Only Viewer accounts can be reset here' }, { status: 404, headers: corsHeaders })
    }

    redirectUrl.hash = ''
    const expiresAt = new Date(Date.now() + 5 * 60_000)
    const { data, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: targetProfile.email,
      options: { redirectTo: redirectUrl.toString() },
    })
    const actionLink = data?.properties?.action_link
    if (linkError || !actionLink) {
      console.error('Could not generate recovery link', linkError?.message ?? 'Missing action_link')
      return Response.json({ error: 'Could not create a recovery link' }, { status: 502, headers: corsHeaders })
    }

    return Response.json({
      actionLink,
      expiresAt: expiresAt.toISOString(),
    }, { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Recovery link request failed', error instanceof Error ? error.message : 'Unknown error')
    return Response.json({ error: 'Could not create a recovery link' }, { status: 500, headers: corsHeaders })
  }
})

function allowedRedirect(url: URL) {
  if (!allowedOrigins.has(url.origin)) return false
  if (url.origin === 'https://kietdt99.github.io') return url.pathname === '/shopee-lin/'
  return url.pathname === '/'
}
