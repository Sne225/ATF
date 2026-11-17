import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { FeatureCollection, Polygon } from 'geojson'
import { LocateFixed, MapPin, Mountain, RefreshCw, Satellite, Search, X } from 'lucide-react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { quickPlaces, searchPlaces, type Place } from '../lib/api'
import copy from '../i18n/en.json'

export type GPSPosition = { lat: number; lon: number; accuracy: number }

type Props = {
  lat: number
  lng: number
  locationLabel: string
  fieldChosen: boolean
  onLocationChange: (lat: number, lng: number, label?: string) => void
  gpsPosition: GPSPosition | null
  gpsWatching: boolean
  onLocate: () => void
  locationError: string
}

const styles = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
}
const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim()
const wrapLongitude = (lng: number) => ((lng + 180) % 360 + 360) % 360 - 180

function accuracyData(position: GPSPosition | null): FeatureCollection<Polygon> {
  if (!position) return { type: 'FeatureCollection', features: [] }
  const lat = position.lat * Math.PI / 180
  const radius = position.accuracy / 6371008.8
  const coordinates: number[][] = []
  for (let step = 0; step < 64; step++) {
    const bearing = step * 2 * Math.PI / 64
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(radius) + Math.cos(lat) * Math.sin(radius) * Math.cos(bearing))
    const nextLng = Math.atan2(Math.sin(bearing) * Math.sin(radius) * Math.cos(lat), Math.cos(radius) - Math.sin(lat) * Math.sin(nextLat))
    coordinates.push([position.lon + nextLng * 180 / Math.PI, nextLat * 180 / Math.PI])
  }
  coordinates.push(coordinates[0])
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } }],
  }
}

function syncAccuracy(instance: mapboxgl.Map, position: GPSPosition | null, styleReady = false) {
  const source = instance.getSource<mapboxgl.GeoJSONSource>('accuracy-circle')
  if (!source && !styleReady && !instance.isStyleLoaded()) return
  const data = accuracyData(position)
  if (source) source.setData(data)
  else instance.addSource('accuracy-circle', { type: 'geojson', data })
  if (!instance.getLayer('accuracy-circle')) {
    instance.addLayer({
      id: 'accuracy-circle', type: 'fill', source: 'accuracy-circle',
      paint: { 'fill-color': '#2b6cb0', 'fill-opacity': 0.18 },
    })
    instance.addLayer({
      id: 'accuracy-circle-outline', type: 'line', source: 'accuracy-circle',
      paint: { 'line-color': '#2b6cb0', 'line-width': 2 },
    })
  }
}

function outlineBoundaries(instance: mapboxgl.Map) {
  for (const id of ['admin-0-boundary', 'admin-0-boundary-disputed', 'admin-1-boundary']) {
    if (!instance.getLayer(id)) continue
    instance.setPaintProperty(id, 'line-color', '#fff4cf')
    instance.setPaintProperty(id, 'line-opacity', id === 'admin-1-boundary' ? 0.75 : 0.95)
    instance.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 2, 1, 10, 2.5])
  }
  for (const id of ['admin-0-boundary-bg', 'admin-1-boundary-bg']) {
    if (!instance.getLayer(id)) continue
    instance.setPaintProperty(id, 'line-color', '#18251e')
    instance.setPaintProperty(id, 'line-opacity', 0.85)
    instance.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 2, 3, 10, 5])
  }
}

async function findPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  if (!token) return searchPlaces(query, signal)
  const params = new URLSearchParams({ access_token: token, limit: '5', language: 'en' })
  const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`, { signal })
  if (!response.ok) throw new Error(copy.searchFailure)
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features)) throw new Error(copy.searchFailure)
  return data.features.map((feature: unknown): Place => {
    if (!feature || typeof feature !== 'object' || !('center' in feature) || !Array.isArray(feature.center)
      || typeof feature.center[0] !== 'number' || !Number.isFinite(feature.center[0])
      || typeof feature.center[1] !== 'number' || !Number.isFinite(feature.center[1])
      || Math.abs(feature.center[0]) > 180 || Math.abs(feature.center[1]) > 90
      || !('place_name' in feature) || typeof feature.place_name !== 'string') throw new Error(copy.searchFailure)
    return { lon: feature.center[0], lat: feature.center[1], name: feature.place_name }
  })
}

export default function FieldMap({ lat, lng, locationLabel, fieldChosen, onLocationChange, gpsPosition, gpsWatching, onLocate, locationError }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const pin = useRef<mapboxgl.Marker | null>(null)
  const gpsMarker = useRef<mapboxgl.Marker | null>(null)
  const initial = useRef({ lat, lng, fieldChosen })
  const onChange = useRef(onLocationChange)
  onChange.current = onLocationChange
  const accuracy = gpsWatching ? gpsPosition : null
  const accuracyRef = useRef(accuracy)
  accuracyRef.current = accuracy
  const [style, setStyle] = useState<keyof typeof styles>('satellite')
  const [mapError, setMapError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const activeStyle = useRef<keyof typeof styles>('satellite')
  const failedSources = useRef(new Set<string>())
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const quickPicksVisible = !fieldChosen || lat < -35 || lat > 37 || lng < -18 || lng > 52
  const banner = !token ? copy.mapTokenMissing : mapError
  const layoutMap = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!token || !host.current) return
    if (!mapboxgl.supported()) { setMapError(copy.mapUnavailable); return }
    let instance: mapboxgl.Map
    try {
      instance = new mapboxgl.Map({
        container: host.current, accessToken: token, style: styles.satellite,
        center: [initial.current.lng, initial.current.lat], zoom: initial.current.fieldChosen ? 8 : 3,
        projection: 'mercator',
      })
    } catch (error) {
      console.error(copy.mapUnavailable, error)
      setMapError(copy.mapUnavailable)
      return
    }
    map.current = instance
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    const element = document.createElement('div')
    element.className = 'field-marker-wrap'
    element.title = copy.fieldMarkerTitle
    element.setAttribute('aria-label', copy.fieldMarkerTitle)
    element.innerHTML = '<div class="pin-drop"><svg viewBox="0 0 42 54" aria-hidden="true"><path d="M21 2C10.5 2 2 10.4 2 20.8 2 35 21 52 21 52s19-17 19-31.2C40 10.4 31.5 2 21 2Z" fill="#1f7a4d" stroke="#fffdf8" stroke-width="2.5"/><circle cx="21" cy="20" r="7" fill="#fffdf8"/></svg></div>'
    const marker = new mapboxgl.Marker({ element, draggable: true, anchor: 'bottom' })
      .setLngLat([initial.current.lng, initial.current.lat]).addTo(instance)
    pin.current = marker
    marker.on('dragend', () => {
      const point = marker.getLngLat()
      onChange.current(point.lat, wrapLongitude(point.lng))
    })
    instance.on('click', event => onChange.current(event.lngLat.lat, wrapLongitude(event.lngLat.lng)))
    instance.on('style.load', () => {
      if (activeStyle.current === 'satellite') outlineBoundaries(instance)
      syncAccuracy(instance, accuracyRef.current, true)
    })
    instance.on('error', event => {
      const error: unknown = event.error
      const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
      if ('sourceId' in event && typeof event.sourceId === 'string') failedSources.current.add(event.sourceId)
      setMapError(status === 429 ? copy.mapRateLimited
        : status === 401 || status === 403 ? copy.mapAccessDenied : copy.mapUnavailable)
    })
    instance.on('sourcedata', event => {
      if (event.sourceDataType !== 'content' || !event.isSourceLoaded || !event.sourceId) return
      if (failedSources.current.delete(event.sourceId) && failedSources.current.size === 0) setMapError('')
    })
    const updateLayout = () => {
      const center = instance.getCenter()
      const zoom = instance.getZoom()
      instance.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
      instance.resize()
      const panel = host.current?.parentElement
      if (!panel) return
      const mobile = window.matchMedia('(max-width: 1023px)').matches
      const hud = panel.querySelector<HTMLElement>('.map-fallback') ?? panel.querySelector<HTMLElement>('.map-layers')
      const bottom = Math.min(mobile && panel.querySelector('.quick-picks') ? 150 : 90, panel.clientHeight / 3)
      const top = Math.max(0, Math.min(mobile && hud ? hud.offsetTop + hud.offsetHeight + 54 : 100, panel.clientHeight - bottom - 64))
      instance.jumpTo({ center, zoom, padding: { top, bottom, left: 20, right: 20 } })
    }
    layoutMap.current = updateLayout
    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(host.current)
    setMapReady(true)
    return () => {
      observer.disconnect()
      gpsMarker.current?.remove()
      gpsMarker.current = null
      marker.remove()
      instance.remove()
      map.current = null
      pin.current = null
      layoutMap.current = null
    }
  }, [])

  useEffect(() => { layoutMap.current?.() }, [banner, quickPicksVisible])

  useEffect(() => {
    pin.current?.setLngLat([lng, lat])
    if (fieldChosen && map.current) {
      map.current.flyTo({ center: [lng, lat], zoom: Math.max(map.current.getZoom(), 8), duration: 350 })
    }
  }, [lat, lng, fieldChosen])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    syncAccuracy(instance, accuracy)
    if (accuracy) {
      if (!gpsMarker.current) {
        const element = document.createElement('span')
        element.className = 'gps-dot'
        element.setAttribute('aria-label', copy.liveLocation)
        gpsMarker.current = new mapboxgl.Marker({ element }).setLngLat([accuracy.lon, accuracy.lat]).addTo(instance)
      } else gpsMarker.current.setLngLat([accuracy.lon, accuracy.lat])
    } else {
      gpsMarker.current?.remove()
      gpsMarker.current = null
    }
  }, [accuracy])

  useEffect(() => {
    setResults([])
    setSearchError('')
    if (search.trim().length < 2) { setSearching(false); return }
    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const places = await findPlaces(search.trim(), controller.signal)
        if (!controller.signal.aborted) setResults(places)
      } catch (error) {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : copy.searchFailureMessage)
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [search])

  const choosePlace = (place: Place) => {
    onLocationChange(place.lat, place.lon, place.name)
    setSearch('')
    setResults([])
  }
  const changeStyle = (next: keyof typeof styles) => {
    if (activeStyle.current === next) return
    activeStyle.current = next
    setStyle(next)
    setMapError('')
    failedSources.current.clear()
    map.current?.setStyle(styles[next])
  }
  const retryMap = () => {
    setMapError('')
    failedSources.current.clear()
    map.current?.setStyle(null)
    map.current?.setStyle(styles[style])
  }

  return <section className={`map-panel${banner ? ' map-unavailable' : ''}`} aria-label={copy.chooseFieldLabel}>
    <div ref={host} className="map-canvas" />
    <div className={`map-title ${fieldChosen ? 'chosen' : 'unchosen'}`}>
      <span className="section-kicker">{copy.fieldKicker}</span>
      <h2>{fieldChosen ? locationLabel.split(',')[0] : copy.africaTitle}</h2>
    </div>
    <div className="map-search">
      <label className="searchbox"><Search size={18} aria-hidden="true" /><input aria-label={copy.searchLabel} placeholder={copy.searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)} /><button aria-label={copy.clearSearch} onClick={() => setSearch('')}><X size={18} aria-hidden="true" /></button></label>
      {search.trim().length > 1 && !searchError && <div className="search-results" aria-live="polite">
        {searching ? <p>{copy.searching}</p> : results.length ? results.map((result, index) => <button key={`${result.lat}-${result.lon}-${index}`} onClick={() => choosePlace(result)}>{result.name}</button>) : <p>{copy.noResults}</p>}
      </div>}
      {(searchError || locationError) && <p className="location-error" role="alert">{searchError || locationError}</p>}
    </div>
    <div className="map-layers" role="group" aria-label={copy.mapLayers}>
      <button aria-pressed={style === 'satellite'} disabled={!mapReady} onClick={() => changeStyle('satellite')}><Satellite size={15} aria-hidden="true" />{copy.satelliteHybrid}</button>
      <button aria-pressed={style === 'outdoors'} disabled={!mapReady} onClick={() => changeStyle('outdoors')}><Mountain size={15} aria-hidden="true" />{copy.terrainOutdoors}</button>
    </div>
    {banner && <div className="map-fallback" role="status"><p>{banner}</p>{token && mapReady && <button onClick={retryMap}><RefreshCw size={15} aria-hidden="true" />{copy.retry}</button>}</div>}
    {!fieldChosen && !banner && <div className="map-prompt unselected"><MapPin size={32} aria-hidden="true" /><div><strong>{copy.mapPrompt}</strong><p>{copy.mapExplain}</p></div></div>}
    {quickPicksVisible && <div className="quick-picks" aria-label={copy.quickPicks}>
      {quickPlaces.map(place => <button key={place.name} onClick={() => choosePlace(place)}>{place.name}</button>)}
    </div>}
    <button className="map-locate" aria-pressed={gpsWatching} onClick={onLocate}><LocateFixed size={18} aria-hidden="true" />{copy.locateMe}</button>
  </section>
}
