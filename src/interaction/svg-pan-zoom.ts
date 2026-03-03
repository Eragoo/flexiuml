import type { ViewportState, PanState } from '../core/types'
import { IDLE_PAN, DEFAULT_VIEWPORT } from '../core/types'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_SENSITIVITY = 0.001

/**
 * Apply the viewport state (pan + zoom) to the SVG's viewBox.
 * The viewBox is computed from the SVG's intrinsic size, zoom level, and pan offset.
 */
export function applyViewport(
  svg: SVGSVGElement,
  viewport: ViewportState,
): void {
  const baseWidth = svg.clientWidth || svg.getBoundingClientRect().width
  const baseHeight = svg.clientHeight || svg.getBoundingClientRect().height

  const viewWidth = baseWidth / viewport.zoom
  const viewHeight = baseHeight / viewport.zoom

  svg.setAttribute(
    'viewBox',
    `${viewport.panX} ${viewport.panY} ${viewWidth} ${viewHeight}`,
  )
}

/**
 * Start a pan gesture. Records the starting client position and current pan offset.
 */
export function startPan(
  clientX: number,
  clientY: number,
  viewport: ViewportState,
): PanState {
  return {
    panning: true,
    startClientX: clientX,
    startClientY: clientY,
    startPanX: viewport.panX,
    startPanY: viewport.panY,
  }
}

/**
 * Continue a pan gesture. Returns the updated viewport state.
 */
export function movePan(
  panState: PanState,
  clientX: number,
  clientY: number,
  viewport: ViewportState,
): ViewportState {
  if (!panState.panning) return viewport

  const dx = (clientX - panState.startClientX) / viewport.zoom
  const dy = (clientY - panState.startClientY) / viewport.zoom

  return {
    ...viewport,
    panX: panState.startPanX - dx,
    panY: panState.startPanY - dy,
  }
}

/**
 * End a pan gesture. Returns idle pan state.
 */
export function endPan(): PanState {
  return { ...IDLE_PAN }
}

/**
 * Handle a wheel event for zooming. Zooms toward the cursor position.
 * Returns the updated viewport state.
 */
export function zoomAtPoint(
  viewport: ViewportState,
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  deltaY: number,
): ViewportState {
  const rect = svg.getBoundingClientRect()
  // Cursor position as fraction of SVG container (guard against zero-size)
  const fractionX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
  const fractionY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5

  const oldZoom = viewport.zoom
  const zoomDelta = -deltaY * ZOOM_SENSITIVITY * oldZoom
  const newZoom = clamp(oldZoom + zoomDelta, MIN_ZOOM, MAX_ZOOM)

  // Adjust pan so the point under the cursor stays fixed
  const oldViewWidth = rect.width / oldZoom
  const oldViewHeight = rect.height / oldZoom
  const newViewWidth = rect.width / newZoom
  const newViewHeight = rect.height / newZoom

  const panX = viewport.panX + (oldViewWidth - newViewWidth) * fractionX
  const panY = viewport.panY + (oldViewHeight - newViewHeight) * fractionY

  return { panX, panY, zoom: newZoom }
}

/**
 * Reset viewport to default (no pan, zoom = 1).
 */
export function resetViewport(): ViewportState {
  return { ...DEFAULT_VIEWPORT }
}

/**
 * Fit the SVG content into the visible area.
 * Computes viewport state that shows the full diagram.
 */
export function fitToView(
  svg: SVGSVGElement,
  padding: number = 20,
): ViewportState {
  const bbox = svg.getBBox()
  const containerWidth = svg.clientWidth || svg.getBoundingClientRect().width
  const containerHeight = svg.clientHeight || svg.getBoundingClientRect().height

  if (bbox.width === 0 || bbox.height === 0) {
    return { ...DEFAULT_VIEWPORT }
  }

  const scaleX = containerWidth / (bbox.width + padding * 2)
  const scaleY = containerHeight / (bbox.height + padding * 2)
  const zoom = clamp(Math.min(scaleX, scaleY), MIN_ZOOM, MAX_ZOOM)

  const viewWidth = containerWidth / zoom
  const viewHeight = containerHeight / zoom

  const panX = bbox.x - (viewWidth - bbox.width) / 2
  const panY = bbox.y - (viewHeight - bbox.height) / 2

  return { panX, panY, zoom }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
