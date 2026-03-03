/**
 * Selection module — interactionLayer overlay approach.
 *
 * Selection visuals (highlight rectangles, box select rubber band) are drawn
 * in the interactionLayer <g>, NEVER modifying Mermaid DOM directly.
 *
 * Supports: single click, shift+click toggle, rubber-band box select.
 */

import type { SelectionState, BoxSelectState, Point } from '../core/types'
import { IDLE_BOX_SELECT } from '../core/types'
import type { DiagramIndex, IndexedElement } from '../core/index-diagram'
import { getTranslate } from './svg-drag'

const SVG_NS = 'http://www.w3.org/2000/svg'

const SELECTION_STROKE = '#3b82f6'
const SELECTION_STROKE_WIDTH = 2
const SELECTION_STROKE_DASHARRAY = '6 3'
const SELECTION_FILL = 'rgba(59, 130, 246, 0.08)'
const BOX_SELECT_STROKE = '#3b82f6'
const BOX_SELECT_FILL = 'rgba(59, 130, 246, 0.1)'

// ── Selection state manipulation ─────────────────────────────────────────────

/**
 * Toggle selection of a node. If multi is true, add/remove from current selection.
 * Otherwise, replace selection with just this node.
 */
export function toggleNodeSelect(
  state: SelectionState,
  nodeId: string,
  multi: boolean,
): SelectionState {
  const newNodeIds = new Set(state.selectedNodeIds)

  if (multi) {
    if (newNodeIds.has(nodeId)) {
      newNodeIds.delete(nodeId)
    } else {
      newNodeIds.add(nodeId)
    }
  } else {
    if (newNodeIds.size === 1 && newNodeIds.has(nodeId) && state.selectedContainerIds.size === 0) {
      newNodeIds.clear()
    } else {
      newNodeIds.clear()
      newNodeIds.add(nodeId)
    }
  }

  return {
    selectedNodeIds: newNodeIds,
    selectedContainerIds: multi ? new Set(state.selectedContainerIds) : new Set(),
  }
}

/**
 * Toggle selection of a container.
 */
export function toggleContainerSelect(
  state: SelectionState,
  containerId: string,
  multi: boolean,
): SelectionState {
  const newContainerIds = new Set(state.selectedContainerIds)

  if (multi) {
    if (newContainerIds.has(containerId)) {
      newContainerIds.delete(containerId)
    } else {
      newContainerIds.add(containerId)
    }
  } else {
    if (newContainerIds.size === 1 && newContainerIds.has(containerId) && state.selectedNodeIds.size === 0) {
      newContainerIds.clear()
    } else {
      newContainerIds.clear()
      newContainerIds.add(containerId)
    }
  }

  return {
    selectedNodeIds: multi ? new Set(state.selectedNodeIds) : new Set(),
    selectedContainerIds: newContainerIds,
  }
}

/**
 * Clear all selections.
 */
export function clearSelection(): SelectionState {
  return { selectedNodeIds: new Set(), selectedContainerIds: new Set() }
}

/**
 * Get all selected IDs (nodes + containers) as a single set.
 * Useful for drag operations that treat all selected elements uniformly.
 */
export function allSelectedIds(state: SelectionState): Set<string> {
  const all = new Set(state.selectedNodeIds)
  for (const id of state.selectedContainerIds) {
    all.add(id)
  }
  return all
}

// ── Selection overlay rendering (interactionLayer) ───────────────────────────

/**
 * Render selection highlight overlays in the interactionLayer.
 *
 * Draws dashed blue rectangles over each selected node/container bbox.
 * Clears previous overlays first.
 */
export function renderSelectionOverlays(
  interactionLayer: SVGGElement,
  diagramIndex: DiagramIndex,
  selection: SelectionState,
): void {
  // Remove existing selection overlays
  clearSelectionOverlays(interactionLayer)

  // Draw overlays for selected nodes
  for (const nodeId of selection.selectedNodeIds) {
    const entry = diagramIndex.nodes.get(nodeId)
    if (entry) {
      drawSelectionRect(interactionLayer, entry)
    }
  }

  // Draw overlays for selected containers
  for (const containerId of selection.selectedContainerIds) {
    const entry = diagramIndex.containers.get(containerId)
    if (entry) {
      drawSelectionRect(interactionLayer, entry)
    }
  }
}

/**
 * Draw a selection rectangle overlay for a single indexed element.
 */
function drawSelectionRect(
  interactionLayer: SVGGElement,
  entry: IndexedElement,
): void {
  // Get the element's current bounding box in diagram space
  let bbox: DOMRect
  try {
    bbox = entry.el.getBBox()
  } catch {
    return
  }

  // Account for the element's transform (translate)
  const { x: tx, y: ty } = getTranslate(entry.el)

  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', String(bbox.x + tx))
  rect.setAttribute('y', String(bbox.y + ty))
  rect.setAttribute('width', String(bbox.width))
  rect.setAttribute('height', String(bbox.height))
  rect.setAttribute('stroke', SELECTION_STROKE)
  rect.setAttribute('stroke-width', String(SELECTION_STROKE_WIDTH))
  rect.setAttribute('stroke-dasharray', SELECTION_STROKE_DASHARRAY)
  rect.setAttribute('fill', SELECTION_FILL)
  rect.setAttribute('pointer-events', 'none')
  rect.setAttribute('data-selection-overlay', 'true')

  interactionLayer.appendChild(rect)
}

/**
 * Remove all selection overlay elements from the interactionLayer.
 */
export function clearSelectionOverlays(interactionLayer: SVGGElement): void {
  const overlays = interactionLayer.querySelectorAll('[data-selection-overlay]')
  for (const overlay of overlays) {
    overlay.remove()
  }
}

// ── Box select (rubber band) ─────────────────────────────────────────────────

/**
 * Start a box selection.
 */
export function startBoxSelect(
  worldX: number,
  worldY: number,
): BoxSelectState {
  return {
    active: true,
    startWorldX: worldX,
    startWorldY: worldY,
    currentWorldX: worldX,
    currentWorldY: worldY,
  }
}

/**
 * Update the box selection rectangle during pointer move.
 */
export function updateBoxSelect(
  state: BoxSelectState,
  worldX: number,
  worldY: number,
): BoxSelectState {
  if (!state.active) return state
  return {
    ...state,
    currentWorldX: worldX,
    currentWorldY: worldY,
  }
}

/**
 * Render the box selection rectangle in the interaction layer.
 */
export function renderBoxSelectRect(
  interactionLayer: SVGGElement,
  state: BoxSelectState,
): void {
  // Remove existing box select rect
  clearBoxSelectRect(interactionLayer)

  if (!state.active) return

  const x = Math.min(state.startWorldX, state.currentWorldX)
  const y = Math.min(state.startWorldY, state.currentWorldY)
  const width = Math.abs(state.currentWorldX - state.startWorldX)
  const height = Math.abs(state.currentWorldY - state.startWorldY)

  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', String(x))
  rect.setAttribute('y', String(y))
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(height))
  rect.setAttribute('stroke', BOX_SELECT_STROKE)
  rect.setAttribute('stroke-width', '1')
  rect.setAttribute('stroke-dasharray', '4 2')
  rect.setAttribute('fill', BOX_SELECT_FILL)
  rect.setAttribute('pointer-events', 'none')
  rect.setAttribute('data-box-select', 'true')

  interactionLayer.appendChild(rect)
}

/**
 * Remove the box selection rectangle.
 */
export function clearBoxSelectRect(interactionLayer: SVGGElement): void {
  const rects = interactionLayer.querySelectorAll('[data-box-select]')
  for (const rect of rects) {
    rect.remove()
  }
}

/**
 * End a box selection and compute which elements fall inside the selection rectangle.
 *
 * An element is selected if its bbox center falls inside the selection box.
 */
export function endBoxSelect(
  state: BoxSelectState,
  diagramIndex: DiagramIndex,
): SelectionState {
  if (!state.active) {
    return { selectedNodeIds: new Set(), selectedContainerIds: new Set() }
  }

  const minX = Math.min(state.startWorldX, state.currentWorldX)
  const maxX = Math.max(state.startWorldX, state.currentWorldX)
  const minY = Math.min(state.startWorldY, state.currentWorldY)
  const maxY = Math.max(state.startWorldY, state.currentWorldY)

  const selectedNodeIds = new Set<string>()
  const selectedContainerIds = new Set<string>()

  // Test nodes
  for (const [id, entry] of diagramIndex.nodes) {
    const center = getElementCenter(entry)
    if (center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY) {
      selectedNodeIds.add(id)
    }
  }

  // Test containers
  for (const [id, entry] of diagramIndex.containers) {
    const center = getElementCenter(entry)
    if (center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY) {
      selectedContainerIds.add(id)
    }
  }

  return { selectedNodeIds, selectedContainerIds }
}

/**
 * Get the center point of an indexed element in world coordinates.
 * Accounts for the element's translate transform.
 */
function getElementCenter(entry: IndexedElement): Point {
  let bbox: { x: number; y: number; width: number; height: number }
  try {
    bbox = entry.el.getBBox()
  } catch {
    bbox = entry.bbox
  }

  const { x: tx, y: ty } = getTranslate(entry.el)

  return {
    x: bbox.x + bbox.width / 2 + tx,
    y: bbox.y + bbox.height / 2 + ty,
  }
}

/**
 * Reset box select state to idle.
 */
export function resetBoxSelect(): BoxSelectState {
  return { ...IDLE_BOX_SELECT }
}

/**
 * Merge box selection results with existing selection (for shift+box select).
 */
export function mergeSelections(
  existing: SelectionState,
  additional: SelectionState,
): SelectionState {
  const nodeIds = new Set(existing.selectedNodeIds)
  for (const id of additional.selectedNodeIds) {
    nodeIds.add(id)
  }

  const containerIds = new Set(existing.selectedContainerIds)
  for (const id of additional.selectedContainerIds) {
    containerIds.add(id)
  }

  return { selectedNodeIds: nodeIds, selectedContainerIds: containerIds }
}
