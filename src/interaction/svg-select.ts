import type { SelectionState } from '../core/types'
import { extractNodeId } from '../core/mermaid-config'

const SELECTED_CLASS = 'fleximaid-selected'
const SELECTED_STROKE = '#3b82f6'
const SELECTED_STROKE_WIDTH = '3'

/**
 * Toggle selection of a node. If multi is true, add/remove from selection.
 * Otherwise, replace selection with just this node.
 */
export function toggleSelect(
  state: SelectionState,
  nodeId: string,
  multi: boolean,
): SelectionState {
  const newIds = new Set(state.selectedIds)

  if (multi) {
    if (newIds.has(nodeId)) {
      newIds.delete(nodeId)
    } else {
      newIds.add(nodeId)
    }
  } else {
    if (newIds.size === 1 && newIds.has(nodeId)) {
      // Clicking the only selected node deselects it
      newIds.clear()
    } else {
      newIds.clear()
      newIds.add(nodeId)
    }
  }

  return { selectedIds: newIds }
}

/**
 * Clear all selections.
 */
export function clearSelection(): SelectionState {
  return { selectedIds: new Set() }
}

/**
 * Apply visual selection highlights to SVG node elements.
 * Adds/removes a CSS class and adjusts stroke styling.
 */
export function applySelectionStyles(
  svg: SVGSVGElement,
  state: SelectionState,
  nodeSelector: string,
): void {
  const allNodes = svg.querySelectorAll(nodeSelector)

  for (const node of allNodes) {
    if (!(node instanceof SVGElement)) continue

    const nodeId = extractNodeId(node)
    if (!nodeId) continue

    const isSelected = state.selectedIds.has(nodeId)

    if (isSelected) {
      node.classList.add(SELECTED_CLASS)
      applyHighlight(node)
    } else {
      node.classList.remove(SELECTED_CLASS)
      removeHighlight(node)
    }
  }
}

/**
 * Apply a selection highlight to a node element.
 * Finds the primary shape (rect, circle, polygon, path) and sets stroke.
 */
function applyHighlight(node: SVGElement): void {
  const shape = node.querySelector('rect, circle, polygon, path, ellipse')
  if (!shape) return

  // Store original values for removal (use hasAttribute to handle empty-string originals)
  if (!shape.hasAttribute('data-orig-stroke')) {
    shape.setAttribute('data-orig-stroke', shape.getAttribute('stroke') ?? '')
    shape.setAttribute('data-orig-stroke-width', shape.getAttribute('stroke-width') ?? '')
  }

  shape.setAttribute('stroke', SELECTED_STROKE)
  shape.setAttribute('stroke-width', SELECTED_STROKE_WIDTH)
}

/**
 * Remove the selection highlight from a node element.
 */
function removeHighlight(node: SVGElement): void {
  const shape = node.querySelector('rect, circle, polygon, path, ellipse')
  if (!shape) return

  const origStroke = shape.getAttribute('data-orig-stroke')
  const origWidth = shape.getAttribute('data-orig-stroke-width')

  if (origStroke !== null) {
    if (origStroke) {
      shape.setAttribute('stroke', origStroke)
    } else {
      shape.removeAttribute('stroke')
    }
    shape.removeAttribute('data-orig-stroke')
  }

  if (origWidth !== null) {
    if (origWidth) {
      shape.setAttribute('stroke-width', origWidth)
    } else {
      shape.removeAttribute('stroke-width')
    }
    shape.removeAttribute('data-orig-stroke-width')
  }
}
