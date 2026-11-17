import type { Place } from '../../geo'
import copy from '../../../i18n/en.json'

// Curated places used by the mock geocoding and reverse-geocoding providers,
// and as the quick-pick suggestions shown on the map.
export type QuickPlace = Place

export const quickPlaces: QuickPlace[] = [
  { name: copy.quickLilongwe, lat: -13.9626, lon: 33.7741 },
  { name: copy.quickPolokwane, lat: -23.9045, lon: 29.4689 },
  { name: copy.quickKisumu, lat: -0.0917, lon: 34.768 },
  { name: copy.quickKano, lat: 12.0022, lon: 8.592 },
  { name: copy.quickTamale, lat: 9.4034, lon: -0.8424 },
]

// A slightly larger fixed gazetteer for the mock place search.
const placeIndex: Place[] = [
  ...quickPlaces,
  { name: 'Blantyre, Southern Region, Malawi', lat: -15.7861, lon: 35.0058 },
  { name: 'Mzuzu, Northern Region, Malawi', lat: -11.4656, lon: 34.0207 },
  { name: 'Lusaka, Lusaka Province, Zambia', lat: -15.3875, lon: 28.3228 },
  { name: 'Harare, Harare Province, Zimbabwe', lat: -17.8252, lon: 31.0335 },
  { name: 'Maputo, Maputo Province, Mozambique', lat: -25.9692, lon: 32.5732 },
  { name: 'Dar es Salaam, Dar es Salaam, Tanzania', lat: -6.7924, lon: 39.2083 },
  { name: 'Kampala, Central Region, Uganda', lat: 0.3476, lon: 32.5825 },
  { name: 'Nairobi, Nairobi County, Kenya', lat: -1.2921, lon: 36.8219 },
  { name: 'Kaduna, Kaduna State, Nigeria', lat: 10.5105, lon: 7.4165 },
  { name: 'Accra, Greater Accra, Ghana', lat: 5.6037, lon: -0.187 },
]

export function mockSearchPlaces(query: string): Place[] {
  const normalized = query.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
  if (!normalized) return []
  return placeIndex
    .filter(place => place.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(normalized))
    .slice(0, 5)
}

export function mockReversePlace(lat: number, lon: number): string {
  let nearest: Place | undefined
  let best = Infinity
  for (const place of placeIndex) {
    const distance = (place.lat - lat) ** 2 + (place.lon - lon) ** 2
    if (distance < best) {
      best = distance
      nearest = place
    }
  }
  if (!nearest) return ''
  // Beyond roughly 2° the pin is no longer "near" a known place.
  if (best > 4) return ''
  return `${nearest.name.split(',')[0]} area`
}
