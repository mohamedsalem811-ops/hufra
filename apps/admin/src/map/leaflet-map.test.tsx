import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LeafletMap, type MapPoint } from './leaflet-map'

const points: MapPoint[] = [
  { id: 4, lat: 32.88, lng: 13.19, status: 'reported', title: '#4 · شارع', subtitle: 'جديد' },
  { id: 5, lat: 32.89, lng: 13.2, status: 'fixed', title: '#5 · شارع', subtitle: 'تم الإصلاح' },
]

describe('LeafletMap', () => {
  it('draws one dot per report, reports its view, and opens a report from the popup', () => {
    const onBounds = vi.fn()
    const onPick = vi.fn()
    const { container, rerender, unmount } = render(<LeafletMap points={points} onBounds={onBounds} onPick={onPick} openLabel="فتح البلاغ" label="خريطة" />)
    expect(screen.getByRole('region', { name: 'خريطة' })).toHaveAttribute('dir', 'ltr')
    expect(onBounds).toHaveBeenCalledWith(expect.objectContaining({ south: expect.any(Number), east: expect.any(Number) }))
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(2)

    // Open the first popup and use its button.
    container.querySelector('path.leaflet-interactive')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const open = screen.getByRole('button', { name: 'فتح البلاغ' })
    expect(open.closest('.leaflet-popup')).toHaveTextContent('#4 · شارع')
    open.click()
    expect(onPick).toHaveBeenCalledWith(4)

    rerender(<LeafletMap points={points.slice(1)} onBounds={onBounds} onPick={onPick} openLabel="فتح البلاغ" label="خريطة" focus={{ lat: 32.9, lng: 13.22 }} />)
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(1)
    unmount()
  })
})
