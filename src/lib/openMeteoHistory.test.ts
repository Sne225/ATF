import { describe, expect, it } from 'vitest'
import { historyDateRange } from './openMeteoHistory'

describe('historyDateRange', () => {
  it('requests the latest 20 complete July-to-June seasons', () => {
    expect(historyDateRange(new Date('2026-11-17T00:00:00Z'))).toEqual({
      startDate: '2006-07-01',
      endDate: '2026-06-30',
    })
    expect(historyDateRange(new Date('2026-03-17T00:00:00Z'))).toEqual({
      startDate: '2005-07-01',
      endDate: '2025-06-30',
    })
  })
})
