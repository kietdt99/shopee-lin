import AxeBuilder from '@axe-core/playwright'
import { test, expect, mockSupabase, signIn } from './fixtures'
import type { Page } from '@playwright/test'

type AccessibilityFinding = { surface: string; id: string; impact: string | undefined; help: string; targets: string[]; failureSummaries: string[] }

async function collectAccessibilityViolations(page: Page, surface: string): Promise<AccessibilityFinding[]> {
  await expect.poll(
    () => page.evaluate(() => document.getAnimations({ subtree: true }).filter(({ playState }) => playState === 'running').length),
    { timeout: 1_000 },
  ).toBe(0)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  return results.violations.map(({ id, impact, help, nodes }) => ({
      surface,
      id,
      impact,
      help,
      targets: nodes.map(({ target }) => target.join(' ')),
      failureSummaries: nodes.map(({ failureSummary }) => failureSummary ?? ''),
    }))
}

test('Login and authenticated application surfaces pass automated accessibility checks', async ({ page }) => {
  const findings: AccessibilityFinding[] = []
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Chọn Tài Khoản' })).toBeVisible()
  findings.push(...await collectAccessibilityViolations(page, 'Local account picker'))

  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')
  findings.push(...await collectAccessibilityViolations(page, 'Admin overview'))

  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await expect(page.getByRole('heading', { name: 'Đơn hàng' })).toBeVisible()
  findings.push(...await collectAccessibilityViolations(page, 'Admin orders'))

  await page.getByRole('button', { name: 'Trả Góp' }).click()
  await expect(page.getByRole('heading', { name: 'Trả Góp' })).toBeVisible()
  findings.push(...await collectAccessibilityViolations(page, 'Admin installments'))

  await page.getByRole('button', { name: 'Báo Cáo' }).click()
  await expect(page.getByRole('heading', { name: 'Báo cáo kỳ' })).toBeVisible()
  findings.push(...await collectAccessibilityViolations(page, 'Admin reports'))

  await page.getByRole('button', { name: 'Tài Khoản' }).click()
  await expect(page.getByRole('heading', { name: 'Quản Lý Tài Khoản' })).toBeVisible()
  findings.push(...await collectAccessibilityViolations(page, 'Admin account management'))

  await page.getByRole('button', { name: 'Hồ Sơ' }).click()
  await expect(page.getByRole('dialog', { name: 'Hồ Sơ' })).toBeVisible()
  findings.push(...await collectAccessibilityViolations(page, 'Profile dialog'))
  expect(findings.map(({ surface, id, impact, help, targets, failureSummaries }) => `${surface}: ${id} (${impact}) — ${help}; selector ${targets.join(', ')}; ${failureSummaries.join(' | ')}`), 'WCAG 2.1 A/AA violations by UI surface').toEqual([])
})

test('Viewer payment and order surfaces pass automated accessibility checks', async ({ page }) => {
  const findings: AccessibilityFinding[] = []
  await page.goto('/')
  await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')

  await page.getByRole('button', { name: 'Thanh toán' }).click()
  await expect(page.getByRole('dialog', { name: 'Thanh toán' })).toBeVisible()
  findings.push(...await collectAccessibilityViolations(page, 'Viewer payment dialog'))
  await page.getByRole('button', { name: 'Đóng' }).click()

  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await expect(page.getByRole('heading', { name: 'Đơn hàng' })).toBeVisible()
  findings.push(...await collectAccessibilityViolations(page, 'Viewer orders'))
  expect(findings.map(({ surface, id, impact, help, targets, failureSummaries }) => `${surface}: ${id} (${impact}) — ${help}; selector ${targets.join(', ')}; ${failureSummaries.join(' | ')}`), 'WCAG 2.1 A/AA violations by UI surface').toEqual([])
})
