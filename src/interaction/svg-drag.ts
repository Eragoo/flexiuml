import type { DragState, Point } from '../core/types'
import { IDLE_DRAG } from '../core/types'

/**
 * Parse the current translate(x, y) from an SVG element's transform attribute.
 * Returns {x: 0, y: 0} if no translate is found.
 */
export function getTranslate(el: SVGElement): Point {
  const transform = el.getAttribute('transform') ?? ''
  const match = transform.match(/translate\(\s*([-\d.]+)(?:[,\s]+([-\d.]+))?\s*\)/)
  if (match) {
    return { x: parseFloat(match[1]!), y: match[2] ? parseFloat(match[2]) : 0 }
  }
  return { x: 0, y: 0 }
}

/**
 * Set or update the translate(x, y) on an SVG element's transform attribute.
 * Preserves other transform functions (scale, rotate, etc.).
 */
export function setTranslate(el: SVGElement, x: number, y: number): void {
  const current = el.getAttribute('transform') ?? ''
  const newTranslate = `translate(${x}, ${y})`

  if (/translate\(/.test(current)) {
    el.setAttribute(
      'transform',
      current.replace(/translate\([^)]*\)/, newTranslate),
    )
  } else {
    el.setAttribute('transform', current ? `${newTranslate} ${current}` : newTranslate)
  }
}

/**
 * Find the closest ancestor (or self) that is a draggable node group.
 * Returns null if the element is not inside a Mermaid node.
 */
export function findNodeGroup(
  target: EventTarget | null,
  nodeSelector: string,
): SVGGElement | null {
  if (!(target instanceof Element)) return null
  const node = target.closest(nodeSelector)
  return node instanceof SVGGElement ? node : null
}

/**
 * Convert a client-space mouse position to SVG-space coordinates,
 * accounting for the current viewBox (pan/zoom).
 */
export function clientToSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Point {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const svgPt = pt.matrixTransform(ctm.inverse())
  return { x: svgPt.x, y: svgPt.y }
}

/**
 * Start a drag operation on a node group element.
 */
export function startDrag(
  svg: SVGSVGElement,
  nodeEl: SVGGElement,
  nodeId: string,
  clientX: number,
  clientY: number,
): DragState {
  const svgPt = clientToSvgPoint(svg, clientX, clientY)
  const translate = getTranslate(nodeEl)

  return {
    dragging: true,
    nodeId,
    offsetX: svgPt.x - translate.x,
    offsetY: svgPt.y - translate.y,
    startTranslateX: translate.x,
    startTranslateY: translate.y,
  }
}

/**
 * Continue a drag: compute new translate and apply it to the element.
 * Returns the updated DragState (unchanged object — mutation is on the DOM).
 */
export function moveDrag(
  svg: SVGSVGElement,
  state: DragState,
  nodeEl: SVGGElement,
  clientX: number,
  clientY: number,
): void {
  if (!state.dragging) return

  const svgPt = clientToSvgPoint(svg, clientX, clientY)
  const newX = svgPt.x - state.offsetX
  const newY = svgPt.y - state.offsetY

  setTranslate(nodeEl, newX, newY)
}

/**
 * End a drag operation. Returns idle state.
 */
export function endDrag(): DragState {
  return { ...IDLE_DRAG }
}
