export type BillingCycleRange = {
  starts_on: string
  ends_on: string
}

export function billingCycleLabel(placedAt: string): string {
  const [year, month, day] = placedAt.split('-').map(Number)
  const endingMonth = new Date(Date.UTC(year, month - 1 + (day >= 21 ? 1 : 0), 1))
  const monthLabel = String(endingMonth.getUTCMonth() + 1).padStart(2, '0')
  return `${monthLabel}.${endingMonth.getUTCFullYear()}`
}

export function billingCycleRange(label: string): BillingCycleRange {
  const [month, year] = label.split('.').map(Number)
  const startsOn = new Date(Date.UTC(year, month - 2, 21))
  const endsOn = new Date(Date.UTC(year, month - 1, 20))
  const toIsoDate = (date: Date) => {
    const monthLabel = String(date.getUTCMonth() + 1).padStart(2, '0')
    const dayLabel = String(date.getUTCDate()).padStart(2, '0')
    return `${date.getUTCFullYear()}-${monthLabel}-${dayLabel}`
  }

  return { starts_on: toIsoDate(startsOn), ends_on: toIsoDate(endsOn) }
}
