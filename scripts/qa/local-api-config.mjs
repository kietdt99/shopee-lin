import { readFileSync } from 'node:fs'

const requiredSettings = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_LOCAL_DEV_PASSWORD',
  'VITE_LOCAL_ADMIN_EMAIL',
  'VITE_LOCAL_VIEWER_EMAIL',
]

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export class LocalApiConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LocalApiConfigError'
  }
}

function parseDotEnv(contents) {
  const values = new Map()

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex < 1) continue

    const name = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (value.startsWith('"')) {
      try {
        const parsedValue = JSON.parse(value)
        if (typeof parsedValue !== 'string') throw new Error('Not a string')
        value = parsedValue
      } catch {
        throw new LocalApiConfigError('Local API QA config contains malformed quoted values. Check the local env file syntax without sharing its contents; no API request was made.')
      }
    } else if (value.startsWith("'")) {
      if (!value.endsWith("'") || value.length < 2) {
        throw new LocalApiConfigError('Local API QA config contains malformed quoted values. Check the local env file syntax without sharing its contents; no API request was made.')
      }
      value = value.slice(1, -1)
    }

    values.set(name, value)
  }

  return values
}

export function resolveLocalApiConfig(contents) {
  let values
  try {
    values = parseDotEnv(contents)
  } catch {
    throw new LocalApiConfigError('Local API QA config contains malformed quoted values. Check the local env file syntax without sharing its contents; no API request was made.')
  }

  const missingSettings = requiredSettings.filter((setting) => !values.get(setting))
  if (missingSettings.length > 0) {
    throw new LocalApiConfigError(`Local API QA config is incomplete. Missing setting names: ${missingSettings.join(', ')}. Start the isolated local stack with pnpm supabase:local:start and verify .env.development.local; no API request was made.`)
  }

  let baseUrl
  try {
    baseUrl = new URL(values.get('VITE_SUPABASE_URL'))
  } catch {
    throw new LocalApiConfigError('VITE_SUPABASE_URL is malformed. It must point to isolated local Supabase at http://127.0.0.1:54321; no API request was made.')
  }

  const isLocalSupabase = baseUrl.protocol === 'http:'
    && loopbackHosts.has(baseUrl.hostname)
    && baseUrl.port === '54321'
    && (!baseUrl.pathname || baseUrl.pathname === '/')
    && !baseUrl.username
    && !baseUrl.password
    && !baseUrl.search
    && !baseUrl.hash

  if (!isLocalSupabase) {
    throw new LocalApiConfigError('Refusing API security checks unless VITE_SUPABASE_URL targets isolated loopback Supabase on port 54321, with no path, credentials, query, or fragment. No API request was made.')
  }

  return {
    apiUrl: baseUrl.origin,
    publishableKey: values.get('VITE_SUPABASE_PUBLISHABLE_KEY'),
    password: values.get('VITE_LOCAL_DEV_PASSWORD'),
    adminEmail: values.get('VITE_LOCAL_ADMIN_EMAIL'),
    viewerEmail: values.get('VITE_LOCAL_VIEWER_EMAIL'),
  }
}

export function loadLocalApiConfig(envPath, readFile = readFileSync) {
  let contents
  try {
    contents = readFile(envPath, 'utf8')
  } catch {
    throw new LocalApiConfigError('Local API QA config is missing or unreadable. Start the isolated local stack with pnpm supabase:local:start and verify .env.development.local; no API request was made.')
  }

  return resolveLocalApiConfig(contents)
}
