/**
 * Reparenting module.
 *
 * On drag end, checks if a node's center is inside a container's bounding box
 * and updates the LayoutMap's parentId accordingly.
 *
 * Does NOT mutate Mermaid DOM structure — parenting is managed purely in LayoutMap
 * and applied via transforms.
 */

import type { Point } from '../core/types'
import type { LayoutMap } from '../core/layout-map'
import { setNodeParent } from '../core/layout-map'
import type { DiagramIndex } from '../core/index-diagram'
import { getTranslate } from './svg-drag'

/**
 * Find which container (if any) contains the given world-coordinate point.
 *
 * Tests containers from smallest to largest (by area) so that nested
 * containers take priority over their parents.
 *
 * @param worldCenter - The point to test (typically a node's bbox center in world coords)
 * @param layout - Current LayoutMap
 * @param diagramIndex - Current diagram index with DOM references
 * @returns The container ID that contains the point, or null if none.
 */
export function hitTestContainer(
  worldCenter: Point,
  layout: LayoutMap,
  diagramIndex: DiagramIndex,
): string | null {
  // Build list of containers with their effective bounding boxes
  const candidates: Array<{ id: string; x: number; y: number; width: number; height: number; area: number }> = []

  for (const [id, entry] of diagramIndex.containers) {
    const containerLayout = layout.containers[id]

    let x: number, y: number, width: number, height: number

    if (containerLayout) {
      // Use stored dimensions
      const translate = getTranslate(entry.el)
      let bbox: { x: number; y: number; width: number; height: number }
      try {
        bbox = entry.el.getBBox()
      } catch {
        continue
      }
      x = bbox.x + translate.x
      y = bbox.y + translate.y
      width = containerLayout.width || bbox.width
      height = containerLayout.height || bbox.height
    } else {
      // Fall back to DOM bbox
      const translate = getTranslate(entry.el)
      let bbox: { x: number; y: number; width: number; height: number }
      try {
        bbox = entry.el.getBBox()
      } catch {
        continue
      }
      x = bbox.x + translate.x
      y = bbox.y + translate.y
      width = bbox.width
      height = bbox.height
    }

    candidates.push({ id, x, y, width, height, area: width * height })
  }

  // Sort by area ascending (smallest first — inner containers win)
  candidates.sort((a, b) => a.area - b.area)

  for (const c of candidates) {
    if (
      worldCenter.x >= c.x &&
      worldCenter.x <= c.x + c.width &&
      worldCenter.y >= c.y &&
      worldCenter.y <= c.y + c.height
    ) {
      return c.id
    }
  }

  return null
}

/**
 * Set the parent of a node. If newParentId is null, the node is unparented.
 *
 * Returns an updated LayoutMap (immutable).
 */
export function reparentNode(
  nodeId: string,
  newParentId: string | null,
  layout: LayoutMap,
): LayoutMap {
  return setNodeParent(layout, nodeId, newParentId)
}
