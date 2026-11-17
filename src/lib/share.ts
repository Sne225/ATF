import type { Advisory } from './advisor/rules'
import type { Crop } from './advisor/crops'
import copy from '../i18n/en.json'

export function buildShareMessage(crop: Crop, place: string, date: string, advisory: Advisory, url: string): string {
  const reason = advisory.verdict === 'plant'
    ? copy.sharePlantRain.replace('{amount}', String(advisory.metrics.rainLast3))
    : advisory.verdict === 'false_start'
      ? copy.shareFalseStart.replace('{days}', String(advisory.metrics.longestDrySpell))
      : advisory.verdict === 'wait_window' && advisory.window
        ? copy.shareWindow.replace('{date}', advisory.window.start)
        : advisory.verdict === 'too_cold'
          ? copy.shareTooCold.replace('{temperature}', String(Math.round(advisory.metrics.soilTempC ?? 0)))
          : copy.shareNoRain
  const title = advisory.verdict === 'wait_window' && advisory.window
    ? copy.verdicts.wait_window.replace('{date}', advisory.window.start)
    : copy.verdicts[advisory.verdict]
  const shortPlace = place.length > 36 ? `${place.slice(0, 33)}…` : place
  const message = `${crop.name} · ${shortPlace} · ${date}: ${title}. ${reason}. ${advisory.confidence} confidence. ${copy.shareAdviceDisclaimer} ${url}`
  if (message.length <= 299) return message
  const compactTitle = title.length > 42 ? title.slice(0, 42) : title
  const compact = `${crop.name} · ${shortPlace.slice(0, 20)} · ${date}: ${compactTitle}. ${reason}. ${advisory.confidence}. ${url}`
  if (compact.length <= 299) return compact
  const placeLength = Math.max(0, 299 - url.length - crop.name.length - date.length - compactTitle.length - reason.length - advisory.confidence.length - 12)
  const minimal = `${crop.name} · ${shortPlace.slice(0, placeLength)} · ${date}: ${compactTitle}. ${reason}. ${advisory.confidence}. ${url}`
  return minimal.length <= 299 ? minimal : `${crop.name} ${date}: ${compactTitle}. ${reason}. ${advisory.confidence}. ${url}`
}

export async function shareMessage(message: string, title?: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try { await navigator.share({ ...(title ? { title } : {}), text: message }); return 'shared' }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      throw error
    }
  }
  await navigator.clipboard.writeText(message)
  return 'copied'
}
