import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLocalApiConfig, resolveLocalApiConfig } from '../../scripts/qa/local-api-config.mjs'

const syntheticKey = 'synthetic-publishable-key'
const syntheticPassword = 'synthetic-local-password'
const syntheticAdmin = 'synthetic-admin@example.test'
const syntheticViewer = 'synthetic-viewer@example.test'

function localEnvText(url = 'http://127.0.0.1:54321') {
  return [
    `VITE_SUPABASE_URL=${url}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${syntheticKey}`,
    `VITE_LOCAL_DEV_PASSWORD=${syntheticPassword}`,
    `VITE_LOCAL_ADMIN_EMAIL=${syntheticAdmin}`,
    `VITE_LOCAL_VIEWER_EMAIL=${syntheticViewer}`,
  ].join('\n')
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('local API QA config resolver', () => {
  it('reports a missing env file safely and gives the local bootstrap command', () => {
    const error = Object.assign(new Error(`Synthetic read error includes ${syntheticPassword}`), { code: 'ENOENT' })
    const readFile = vi.fn(() => { throw error })
    let message = ''

    try {
      loadLocalApiConfig('synthetic-missing-env-path', readFile)
    } catch (caught) {
      message = caught instanceof Error ? caught.message : ''
    }

    expect(message).toMatch(/pnpm supabase:local:start.*\.env\.development\.local.*no API request was made/i)
    expect(message).not.toContain(syntheticPassword)
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledWith('synthetic-missing-env-path', 'utf8')
  })

  it('reports missing setting names without exposing any provided values', () => {
    const incompleteEnv = [
      'VITE_SUPABASE_URL=http://127.0.0.1:54321',
      `VITE_SUPABASE_PUBLISHABLE_KEY=${syntheticKey}`,
    ].join('\n')

    let message = ''
    try {
      resolveLocalApiConfig(incompleteEnv)
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }

    expect(message).toMatch(/VITE_LOCAL_DEV_PASSWORD/)
    expect(message).toMatch(/VITE_LOCAL_ADMIN_EMAIL/)
    expect(message).toMatch(/VITE_LOCAL_VIEWER_EMAIL/)
    expect(message).toMatch(/no API request was made/i)
    expect(message).not.toContain(syntheticKey)
  })

  it('reports malformed quoted settings without echoing their contents', () => {
    const malformedEnv = `${localEnvText()}\nVITE_LOCAL_DEV_PASSWORD="${syntheticPassword}`

    let message = ''
    try {
      resolveLocalApiConfig(malformedEnv)
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }

    expect(message).toMatch(/malformed quoted values.*no API request was made/i)
    expect(message).not.toContain(syntheticPassword)
  })

  it('rejects hosted Supabase URLs without echoing config values', () => {
    let message = ''
    try {
      resolveLocalApiConfig(localEnvText('https://project.supabase.co'))
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }

    expect(message).toMatch(/loopback.*port 54321/i)
    expect(message).toMatch(/no API request was made/i)
    expect(message).not.toContain(syntheticKey)
    expect(message).not.toContain(syntheticPassword)
  })

  it.each([
    'http://127.0.0.1:54322',
    'https://localhost:54321',
    'http://127.0.0.1:54321/rest/v1',
    'http://user:pass@127.0.0.1:54321',
  ])('rejects unsafe local URL variants: %s', (url) => {
    expect(() => resolveLocalApiConfig(localEnvText(url)))
      .toThrow(/loopback.*port 54321.*no API request was made/i)
  })

  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])(
    'accepts complete loopback config at %s',
    (url) => {
      expect(resolveLocalApiConfig(localEnvText(url))).toEqual({
        apiUrl: url,
        publishableKey: syntheticKey,
        password: syntheticPassword,
        adminEmail: syntheticAdmin,
        viewerEmail: syntheticViewer,
      })
    },
  )
})
