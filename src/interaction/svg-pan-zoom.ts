/**
 * Pan/zoom module — transform-based implementation.
 *
 * Pan/zoom is applied as a `transform` attribute on the `g.panZoomLayer` element:
 *   transform="translate(tx, ty) scale(s)"
 *
 * This replaces the previous viewBox-based approach, allowing the SVG viewBox
 * to remain fixed while pan/zoom transforms are isolated to the panZoomLayer.
 */

import type { ViewportState, PanState, Point } from '../core/types'
import { DEFAULT_VIEWPORT, IDLE_PAN } from '../core/types'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 10
export const ZOOM_SENSITIVITY = 0.002

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Apply the viewport state as a transform on the panZoomLayer <g>.
 *
 * The transform is: translate(panX, panY) scale(zoom)
 * This positions and scales all diagram content + interaction visuals together.
 */
export function applyPanZoom(
  panZoomLayer: SVGGElement,
  viewport: ViewportState,
): void {
  panZoomLayer.setAttribute(
    'transform',
    `translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`,
  )
}

/**
 * Convert screen (client) coordinates to world (diagram) coordinates.
 *
 * Uses the panZoomLayer's getScreenCTM() which accounts for the SVG's position
 * on screen plus the panZoomLayer's own transform (translate + scale).
 */
export function screenToWorld(
  svg: SVGSVGElement,
  panZoomLayer: SVGGElement,
  clientX: number,
  clientY: number,
): Point {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = panZoomLayer.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const worldPt = pt.matrixTransform(ctm.inverse())
  return { x: worldPt.x, y: worldPt.y }
}

/**
 * Convert world (diagram) coordinates to screen (client) coordinates.
 */
export function worldToScreen(
  svg: SVGSVGElement,
  panZoomLayer: SVGGElement,
  worldX: number,
  worldY: number,
): Point {
  const pt = svg.createSVGPoint()
  pt.x = worldX
  pt.y = worldY
  const ctm = panZoomLayer.getScreenCTM()
  if (!ctm) return { x: worldX, y: worldY }
  const screenPt = pt.matrixTransform(ctm)
  return { x: screenPt.x, y: screenPt.y }
}

/**
 * Begin a pan gesture.
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
 * Update pan during a gesture.
 *
 * Screen pixel deltas map directly to translate deltas because
 * translate is applied before scale in our transform order.
 */
export function movePan(
  panState: PanState,
  clientX: number,
  clientY: number,
  viewport: ViewportState,
): ViewportState {
  if (!panState.panning) return viewport

  const dx = clientX - panState.startClientX
  const dy = clientY - panState.startClientY

  return {
    ...viewport,
    panX: panState.startPanX + dx,
    panY: panState.startPanY + dy,
  }
}

/**
 * End a pan gesture.
 */
export function endPan(): PanState {
  return { ...IDLE_PAN }
}

/**
 * Zoom at a specific screen point (zoom-to-cursor behavior).
 *
 * The point under the cursor stays fixed. We adjust the translate so that
 * the world point under the cursor maps to the same screen position
 * before and after the zoom change.
 */
export function zoomAtPoint(
  viewport: ViewportState,
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  deltaY: number,
): ViewportState {
  const rect = svg.getBoundingClientRect()

  // Screen position relative to SVG element origin
  const sx = clientX - rect.left
  const sy = clientY - rect.top

  const oldZoom = viewport.zoom
  const zoomDelta = -deltaY * ZOOM_SENSITIVITY * oldZoom
  const newZoom = clamp(oldZoom + zoomDelta, MIN_ZOOM, MAX_ZOOM)

  // Keep the point under cursor fixed:
  // screenPoint = panX + worldPoint * zoom
  //   => worldPoint = (screenPoint - panX) / oldZoom
  // newPanX = screenPoint - worldPoint * newZoom
  const newPanX = sx - ((sx - viewport.panX) / oldZoom) * newZoom
  const newPanY = sy - ((sy - viewport.panY) / oldZoom) * newZoom

  return { panX: newPanX, panY: newPanY, zoom: newZoom }
}

/**
 * Compute a viewport that fits the diagram content within the SVG container.
 *
 * @param svg - The root SVG element (for container size)
 * @param diagramContent - The <g class="diagramContent"> element (for content bounds)
 * @param padding - Padding in screen pixels around the content
 */
export function fitToView(
  svg: SVGSVGElement,
  diagramContent: SVGGElement,
  padding: number = 20,
): ViewportState {
  let bbox: { x: number; y: number; width: number; height: number }
  try {
    bbox = diagramContent.getBBox()
  } catch {
    return { ...DEFAULT_VIEWPORT }
  }

  const containerWidth = svg.clientWidth || svg.getBoundingClientRect().width
  const containerHeight = svg.clientHeight || svg.getBoundingClientRect().height

  if (bbox.width === 0 || bbox.height === 0 || containerWidth === 0 || containerHeight === 0) {
    return { ...DEFAULT_VIEWPORT }
  }

  // Compute zoom to fit content + padding
  const scaleX = (containerWidth - padding * 2) / bbox.width
  const scaleY = (containerHeight - padding * 2) / bbox.height
  const zoom = clamp(Math.min(scaleX, scaleY), MIN_ZOOM, MAX_ZOOM)

  // Center: translate so bbox center maps to screen center
  const panX = containerWidth / 2 - (bbox.x + bbox.width / 2) * zoom
  const panY = containerHeight / 2 - (bbox.y + bbox.height / 2) * zoom

  return { panX, panY, zoom }
}

/**
 * Reset viewport to default (no pan, zoom = 1).
 */
export function resetViewport(): ViewportState {
  return { ...DEFAULT_VIEWPORT }
}
