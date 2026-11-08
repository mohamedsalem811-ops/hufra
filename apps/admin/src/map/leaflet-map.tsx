import 'leaflet/dist/leaflet.css'

import type { PotholeStatus } from '@hufra/contracts'
import L from 'leaflet'
import { useEffect, useRef } from 'react'

export type MapPoint = { id: number; lat: number; lng: number; status: PotholeStatus; title: string; subtitle: string }
export type Bounds = { south: number; west: number; north: number; east: number }

/** Pin colours from the brand tokens (packages/brand), one per status. */
const PIN: Record<PotholeStatus, string> = {
  reported: 'var(--color-status-reported-pin)',
  verified: 'var(--color-status-verified-pin)',
  under_repair: 'var(--color-status-under-repair-pin)',
  fixed: 'var(--color-status-fixed-pin)',
}

/** Greater Tripoli. */
const START: [number, number] = [32.8872, 13.1913]

/**
 * A plain Leaflet map: tiles from our own cached proxy, one circle per report.
 * Kept small and imperative so the page around it stays easy to test.
 */
export function LeafletMap({
  points,
  onBounds,
  onPick,
  openLabel,
  label,
  focus,
}: {
  points: MapPoint[]
  onBounds: (b: Bounds) => void
  onPick: (id: number) => void
  openLabel: string
  label: string
  focus?: { lat: number; lng: number } | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const latest = useRef({ onBounds, onPick })
  latest.current = { onBounds, onPick }

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { center: START, zoom: 12, minZoom: 9, maxZoom: 19 })
    L.tileLayer('/tiles/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    const report = () => {
      const b = m.getBounds()
      latest.current.onBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() })
    }
    m.on('moveend', report)
    report()
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (map.current && focus) map.current.setView([focus.lat, focus.lng], Math.max(map.current.getZoom(), 14))
  }, [focus])

  useEffect(() => {
    const group = layer.current
    if (!group) return
    group.clearLayers()
    const style = getComputedStyle(document.documentElement)
    const colour = (s: PotholeStatus) => style.getPropertyValue(PIN[s].slice(4, -1)).trim() || '#0B4A6F'
    for (const p of points) {
      const popup = document.createElement('div')
      popup.dir = 'auto'
      const title = popup.appendChild(document.createElement('strong'))
      title.textContent = p.title
      popup.appendChild(document.createElement('br'))
      const sub = popup.appendChild(document.createElement('span'))
      sub.textContent = p.subtitle
      popup.appendChild(document.createElement('br'))
      const open = popup.appendChild(document.createElement('button'))
      open.type = 'button'
      open.textContent = openLabel
      open.style.cssText = 'margin-top:6px;font:inherit;font-weight:600;color:#0B5C8C;background:none;border:0;padding:0;cursor:pointer'
      open.addEventListener('click', () => latest.current.onPick(p.id))
      L.circleMarker([p.lat, p.lng], { radius: 8, color: '#FFFFFF', weight: 2, fillColor: colour(p.status), fillOpacity: 1 })
        .bindPopup(popup)
        .bindTooltip(p.title)
        .addTo(group)
    }
  }, [points, openLabel])

  return <div ref={box} dir="ltr" role="region" aria-label={label} className="h-[min(70vh,640px)] min-h-[360px] w-full overflow-hidden rounded-lg border border-default" />
}
