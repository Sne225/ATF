import { describe, expect, it } from 'vitest'
import { crops } from './advisor/crops'
import type { Advisory } from './advisor/rules'
import { buildShareMessage } from './share'

describe('buildShareMessage', () => {
  it('keeps the crop, place, date, verdict, reason, confidence and link under 300 characters', () => {
    const advisory: Advisory = {
      verdict: 'plant',
      confidence: 'high',
      reasons: [],
      metrics: { rainLast3: 32, rainNext7: 39, longestDrySpell: 2, heatStressDays: 0, heavyRainDays: 0 },
      sowingDay: 14,
      dryStartDay: 15,
      dryLength: 2,
    }
    const url = 'https://mvula.example/?lat=-13.970&lon=33.790&crop=maize'
    const message = buildShareMessage(crops[0]!, 'Lilongwe, Malawi', '2026-11-17', advisory, url)
    expect(message.length).toBeLessThan(300)
    expect(message).toContain(crops[0]!.name)
    expect(message).toContain('Lilongwe')
    expect(message).toContain('2026-11-17')
    expect(message).toContain('Plant this week')
    expect(message).toContain('32mm rain')
    expect(message).toContain('high')
    expect(message).toContain(url)
  })
})
