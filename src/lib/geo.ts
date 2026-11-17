import copy from '../i18n/en.json'

export type Place = { lat: number; lon: number; name: string }

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' })
  let response: Response
  try {
    response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal })
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new Error(copy.searchFailure, { cause: error })
  }
  if (!response.ok) throw new Error(copy.searchFailure)
  const data = await response.json() as { results?: { latitude: number; longitude: number; name: string; admin1?: string; country?: string }[] }
  return (data.results ?? []).map(place => ({
    lat: place.latitude, lon: place.longitude,
    name: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
  }))
}

let lastReverseRequest = 0
let reverseQueue = Promise.resolve()
export async function reversePlace(lat: number, lon: number, signal?: AbortSignal): Promise<string> {
  let resolveRequest!: (name: string) => void
  let rejectRequest!: (reason: unknown) => void
  const request = new Promise<string>((resolve, reject) => {
    resolveRequest = resolve
    rejectRequest = reject
  })
  reverseQueue = reverseQueue.then(async () => {
    if (signal?.aborted) throw new DOMException('Request was cancelled', 'AbortError')
    const wait = Math.max(0, 1000 - (Date.now() - lastReverseRequest))
    if (wait) await new Promise(resolve => setTimeout(resolve, wait))
    if (signal?.aborted) throw new DOMException('Request was cancelled', 'AbortError')
    lastReverseRequest = Date.now()
    const params = new URLSearchParams({ format: 'jsonv2', lat: lat.toFixed(5), lon: lon.toFixed(5), zoom: '10' })
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal })
      if (!response.ok) throw new Error(copy.reverseFailure)
      const data = await response.json() as { name?: string; address?: Record<string, string> }
      resolveRequest(data.name || data.address?.village || data.address?.town || data.address?.city || data.address?.county || '')
    } catch (error) {
      rejectRequest(error)
    }
  }).catch(error => rejectRequest(error))
  return request
}
