/**
 * Drag module — LayoutMap-driven group drag.
 *
 * Dragging updates LayoutMap node/container positions for ALL selected elements
 * simultaneously. DOM transforms are applied via setTranslate() — Mermaid is
 * never re-rendered during drag.
 *
 * Coordinate conversion uses screenToWorld from svg-pan-zoom (accounts for
 * the panZoomLayer transform).
 */

import type { DragState, Point } from '../core/types'
import { IDLE_DRAG } from '../core/types'
import type { LayoutMap } from '../core/layout-map'
import { updateNodePositions, updateContainerGeometry } from '../core/layout-map'
import type { DiagramIndex } from '../core/index-diagram'
import { screenToWorld } from './svg-pan-zoom'

// ── Transform utilities (kept from original — still needed) ──────────────────

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
 * Find the closest ancestor (or self) that matches the given selector.
 * Returns null if the element is not inside a matching group.
 */
export function findNodeGroup(
  target: EventTarget | null,
  selector: string,
): SVGGElement | null {
  if (!(target instanceof Element)) return null
  const node = target.closest(selector)
  return node instanceof SVGGElement ? node : null
}

// ── LayoutMap-driven drag operations ─────────────────────────────────────────

/**
 * Begin a drag operation for all currently selected elements.
 *
 * Captures the starting world-coordinate anchor point and a snapshot of
 * each dragged element's current position from the LayoutMap.
 *
 * @param svg - Root SVG element
 * @param panZoomLayer - The panZoomLayer <g> for coordinate conversion
 * @param selectedIds - IDs of all elements being dragged
 * @param layout - Current LayoutMap (positions read from here)
 * @param clientX - Mouse/pointer screen X at drag start
 * @param clientY - Mouse/pointer screen Y at drag start
 */
export function beginDrag(
  svg: SVGSVGElement,
  panZoomLayer: SVGGElement,
  selectedIds: Set<string>,
  layout: LayoutMap,
  clientX: number,
  clientY: number,
): DragState {
  const anchor = screenToWorld(svg, panZoomLayer, clientX, clientY)

  const startPositions = new Map<string, Point>()
  for (const id of selectedIds) {
    const nodeEntry = layout.nodes[id]
    const containerEntry = layout.containers[id]

    if (nodeEntry) {
      startPositions.set(id, { x: nodeEntry.x, y: nodeEntry.y })
    } else if (containerEntry) {
      startPositions.set(id, { x: containerEntry.x, y: containerEntry.y })
    } else {
      // Element not yet in LayoutMap — assume origin
      startPositions.set(id, { x: 0, y: 0 })
    }
  }

  return {
    dragging: true,
    draggedIds: new Set(selectedIds),
    anchorWorldX: anchor.x,
    anchorWorldY: anchor.y,
    startPositions,
  }
}

/**
 * Update drag: compute delta from anchor, update LayoutMap positions, apply to DOM.
 *
 * @returns Updated LayoutMap with new positions for all dragged elements.
 */
export function updateDrag(
  svg: SVGSVGElement,
  panZoomLayer: SVGGElement,
  dragState: DragState,
  diagramIndex: DiagramIndex,
  layout: LayoutMap,
  clientX: number,
  clientY: number,
): LayoutMap {
  if (!dragState.dragging) return layout

  const current = screenToWorld(svg, panZoomLayer, clientX, clientY)
  const dx = current.x - dragState.anchorWorldX
  const dy = current.y - dragState.anchorWorldY

  // Compute new positions for all dragged elements
  const nodeUpdates = new Map<string, { x: number; y: number }>()
  let updatedLayout = layout

  for (const id of dragState.draggedIds) {
    const startPos = dragState.startPositions.get(id)
    if (!startPos) continue

    const newX = startPos.x + dx
    const newY = startPos.y + dy

    // Check if it's a node or container
    if (layout.nodes[id] !== undefined || diagramIndex.nodes.has(id)) {
      nodeUpdates.set(id, { x: newX, y: newY })
    } else if (layout.containers[id] !== undefined || diagramIndex.containers.has(id)) {
      updatedLayout = updateContainerGeometry(updatedLayout, id, { x: newX, y: newY })
    }

    // Apply transform to DOM immediately
    const entry = diagramIndex.nodes.get(id) ?? diagramIndex.containers.get(id)
    if (entry) {
      setTranslate(entry.el, newX, newY)
    }
  }

  if (nodeUpdates.size > 0) {
    updatedLayout = updateNodePositions(updatedLayout, nodeUpdates)
  }

  return updatedLayout
}

/**
 * End a drag operation. Returns idle drag state.
 *
 * The caller is responsible for:
 * - Running edge sync (syncEdges)
 * - Checking reparenting (hitTestContainer)
 * - Persisting the updated LayoutMap
 */
export function endDrag(): DragState {
  return {
    dragging: false,
    draggedIds: new Set(),
    anchorWorldX: 0,
    anchorWorldY: 0,
    startPositions: new Map(),
  }
}

/**
 * Apply all positions from a LayoutMap to DOM elements in the DiagramIndex.
 *
 * Used after loading a layout or after Mermaid re-render to restore positions.
 */
export function applyLayoutToDOM(
  layout: LayoutMap,
  diagramIndex: DiagramIndex,
): void {
  // Apply node positions
  for (const [id, entry] of diagramIndex.nodes) {
    const nodeLayout = layout.nodes[id]
    if (nodeLayout) {
      setTranslate(entry.el, nodeLayout.x, nodeLayout.y)
    }
  }

  // Apply container positions
  for (const [id, entry] of diagramIndex.containers) {
    const containerLayout = layout.containers[id]
    if (containerLayout) {
      setTranslate(entry.el, containerLayout.x, containerLayout.y)
    }
  }
}

/**
 * Seed a LayoutMap from the current DOM positions of indexed elements.
 *
 * For elements not yet in the LayoutMap, reads their current translate transform
 * and adds them. Existing entries are not overwritten.
 */
export function seedLayoutFromDOM(
  layout: LayoutMap,
  diagramIndex: DiagramIndex,
): LayoutMap {
  let updated = { ...layout, nodes: { ...layout.nodes }, containers: { ...layout.containers } }

  // Seed nodes
  for (const [id, entry] of diagramIndex.nodes) {
    if (updated.nodes[id] === undefined) {
      const pos = getTranslate(entry.el)
      updated.nodes[id] = { x: pos.x, y: pos.y }
    }
  }

  // Seed containers
  for (const [id, entry] of diagramIndex.containers) {
    if (updated.containers[id] === undefined) {
      const pos = getTranslate(entry.el)
      let bbox: { width: number; height: number }
      try {
        bbox = entry.el.getBBox()
      } catch {
        bbox = { width: 0, height: 0 }
      }
      updated.containers[id] = {
        x: pos.x,
        y: pos.y,
        width: bbox.width,
        height: bbox.height,
        mode: 'fit',
      }
    }
  }

  return updated
}
