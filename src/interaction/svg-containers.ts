/**
 * Container support module.
 *
 * Handles detection, movement, resize, and fit/manual modes for
 * flowchart subgraphs and C4 boundaries.
 */

import type { LayoutMap } from '../core/layout-map'
import type { DiagramIndex } from '../core/index-diagram'
import type { Point } from '../core/types'
import { getTranslate } from './svg-drag'

const SVG_NS = 'http://www.w3.org/2000/svg'

const HANDLE_SIZE = 8
const HANDLE_FILL = '#3b82f6'
const HANDLE_STROKE = '#1e40af'
const FIT_PADDING = 20

export interface ResizeState {
  containerId: string
  handle: 'nw' | 'ne' | 'sw' | 'se'
  startWorldX: number
  startWorldY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

/**
 * Get the IDs of all nodes that are children of a container (by parentId).
 */
export function getContainerChildren(
  containerId: string,
  layout: LayoutMap,
): string[] {
  const children: string[] = []
  for (const [nodeId, entry] of Object.entries(layout.nodes)) {
    if (entry.parentId === containerId) {
      children.push(nodeId)
    }
  }
  return children
}

/**
 * Compute the bounding box that fits all children of a container, plus padding.
 *
 * Returns null if the container has no children.
 */
export function computeContainerFit(
  containerId: string,
  layout: LayoutMap,
  diagramIndex: DiagramIndex,
  padding: number = FIT_PADDING,
): { x: number; y: number; width: number; height: number } | null {
  const children = getContainerChildren(containerId, layout)
  if (children.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const childId of children) {
    const entry = diagramIndex.nodes.get(childId)
    if (!entry) continue

    const translate = getTranslate(entry.el)
    let bbox: { x: number; y: number; width: number; height: number }
    try {
      bbox = entry.el.getBBox()
    } catch {
      continue
    }

    const x = bbox.x + translate.x
    const y = bbox.y + translate.y
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + bbox.width)
    maxY = Math.max(maxY, y + bbox.height)
  }

  if (!isFinite(minX)) return null

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

/**
 * Render resize handles for a selected container in the interactionLayer.
 *
 * Draws small squares at the four corners of the container.
 */
export function renderResizeHandles(
  interactionLayer: SVGGElement,
  containerId: string,
  containerBbox: { x: number; y: number; width: number; height: number },
): void {
  // Clear existing handles for this container
  clearResizeHandles(interactionLayer, containerId)

  const corners: Array<{ pos: 'nw' | 'ne' | 'sw' | 'se'; x: number; y: number }> = [
    { pos: 'nw', x: containerBbox.x, y: containerBbox.y },
    { pos: 'ne', x: containerBbox.x + containerBbox.width, y: containerBbox.y },
    { pos: 'sw', x: containerBbox.x, y: containerBbox.y + containerBbox.height },
    { pos: 'se', x: containerBbox.x + containerBbox.width, y: containerBbox.y + containerBbox.height },
  ]

  for (const corner of corners) {
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(corner.x - HANDLE_SIZE / 2))
    rect.setAttribute('y', String(corner.y - HANDLE_SIZE / 2))
    rect.setAttribute('width', String(HANDLE_SIZE))
    rect.setAttribute('height', String(HANDLE_SIZE))
    rect.setAttribute('fill', HANDLE_FILL)
    rect.setAttribute('stroke', HANDLE_STROKE)
    rect.setAttribute('stroke-width', '1')
    rect.setAttribute('data-resize-handle', corner.pos)
    rect.setAttribute('data-container-id', containerId)
    rect.style.cursor = corner.pos === 'nw' || corner.pos === 'se' ? 'nwse-resize' : 'nesw-resize'

    interactionLayer.appendChild(rect)
  }
}

/**
 * Clear resize handles for a specific container (or all if containerId is omitted).
 */
export function clearResizeHandles(
  interactionLayer: SVGGElement,
  containerId?: string,
): void {
  const selector = containerId
    ? `[data-resize-handle][data-container-id="${CSS.escape(containerId)}"]`
    : '[data-resize-handle]'
  const handles = interactionLayer.querySelectorAll(selector)
  for (const handle of handles) {
    handle.remove()
  }
}

/**
 * Start a container resize operation.
 */
export function startResize(
  handle: 'nw' | 'ne' | 'sw' | 'se',
  containerId: string,
  layout: LayoutMap,
  worldX: number,
  worldY: number,
): ResizeState {
  const containerLayout = layout.containers[containerId]
  return {
    containerId,
    handle,
    startWorldX: worldX,
    startWorldY: worldY,
    startX: containerLayout?.x ?? 0,
    startY: containerLayout?.y ?? 0,
    startWidth: containerLayout?.width ?? 100,
    startHeight: containerLayout?.height ?? 100,
  }
}

/**
 * Update a container resize during pointer move.
 *
 * Returns updated resize state and layout map.
 */
export function updateResize(
  state: ResizeState,
  layout: LayoutMap,
  worldX: number,
  worldY: number,
): { state: ResizeState; layout: LayoutMap } {
  const dx = worldX - state.startWorldX
  const dy = worldY - state.startWorldY

  let x = state.startX
  let y = state.startY
  let width = state.startWidth
  let height = state.startHeight

  const minSize = 20

  switch (state.handle) {
    case 'se':
      width = Math.max(minSize, state.startWidth + dx)
      height = Math.max(minSize, state.startHeight + dy)
      break
    case 'sw':
      width = Math.max(minSize, state.startWidth - dx)
      height = Math.max(minSize, state.startHeight + dy)
      x = state.startX + (state.startWidth - width)
      break
    case 'ne':
      width = Math.max(minSize, state.startWidth + dx)
      height = Math.max(minSize, state.startHeight - dy)
      y = state.startY + (state.startHeight - height)
      break
    case 'nw':
      width = Math.max(minSize, state.startWidth - dx)
      height = Math.max(minSize, state.startHeight - dy)
      x = state.startX + (state.startWidth - width)
      y = state.startY + (state.startHeight - height)
      break
  }

  const existing = layout.containers[state.containerId] ?? {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    mode: 'manual' as const,
  }

  const newLayout: LayoutMap = {
    ...layout,
    containers: {
      ...layout.containers,
      [state.containerId]: { ...existing, x, y, width, height, mode: 'manual' },
    },
  }

  return { state, layout: newLayout }
}

/**
 * End a container resize.
 */
export function endResize(state: ResizeState): null {
  return null
}
