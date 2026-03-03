/**
 * Element indexing module.
 *
 * After Mermaid renders, this module enumerates all nodes and containers
 * in the SVG and builds stable ID → DOM reference maps.
 *
 * ID extraction strategy (never relies on DOM order):
 *   1. data-id attribute (highest priority)
 *   2. extractNodeId / extractContainerId logic (parses Mermaid id patterns)
 *   3. Content-based deterministic fallback (text hash)
 */

import { extractNodeId, extractContainerId, NODE_SELECTOR, CONTAINER_SELECTOR } from './mermaid-config'

export interface IndexedElement {
  /** Stable logical ID for this element */
  id: string
  /** Reference to the SVG group element */
  el: SVGGElement
  /** Bounding box at index time (in diagram-content coordinate space) */
  bbox: { x: number; y: number; width: number; height: number }
}

export interface DiagramIndex {
  /** Map of node ID → indexed node info */
  nodes: Map<string, IndexedElement>
  /** Map of container ID → indexed container info */
  containers: Map<string, IndexedElement>
}

/**
 * Get the bounding box of an SVG element safely.
 * Falls back to zero-size if getBBox() throws (e.g., element not yet laid out).
 */
function safeBBox(el: SVGGraphicsElement): { x: number; y: number; width: number; height: number } {
  try {
    const b = el.getBBox()
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
}

/**
 * Index all diagram elements (nodes + containers) from the SVG content layer.
 *
 * @param diagramContent - The <g class="diagramContent"> element containing Mermaid SVG
 * @returns A DiagramIndex with maps for nodes and containers
 */
export function indexDiagramElements(
  diagramContent: SVGGElement,
): DiagramIndex {
  const nodes = new Map<string, IndexedElement>()
  const containers = new Map<string, IndexedElement>()

  // Track container element references so we can exclude them from nodes
  const containerEls = new Set<SVGGElement>()

  // 1. Index containers first (subgraphs, boundaries)
  const containerElements = diagramContent.querySelectorAll(CONTAINER_SELECTOR)
  for (const el of containerElements) {
    if (!(el instanceof SVGGElement)) continue

    const id = extractContainerId(el)
    if (!id) continue
    if (containers.has(id)) continue // skip duplicates

    containerEls.add(el)
    containers.set(id, {
      id,
      el,
      bbox: safeBBox(el),
    })

    // Ensure data-id is set for lookup consistency
    if (!el.getAttribute('data-id')) {
      el.setAttribute('data-id', id)
    }
  }

  // 2. Index nodes (exclude elements that are containers)
  const nodeElements = diagramContent.querySelectorAll(NODE_SELECTOR)
  for (const el of nodeElements) {
    if (!(el instanceof SVGGElement)) continue
    if (containerEls.has(el)) continue // don't double-index as node

    const id = extractNodeId(el)
    if (!id) continue
    if (nodes.has(id)) continue // skip duplicates

    nodes.set(id, {
      id,
      el,
      bbox: safeBBox(el),
    })

    // Ensure data-id is set for lookup consistency
    if (!el.getAttribute('data-id')) {
      el.setAttribute('data-id', id)
    }
  }

  return { nodes, containers }
}

/**
 * Refresh the bounding boxes in an existing DiagramIndex.
 * Useful after transforms have been applied.
 */
export function refreshBBoxes(index: DiagramIndex): void {
  for (const entry of index.nodes.values()) {
    entry.bbox = safeBBox(entry.el)
  }
  for (const entry of index.containers.values()) {
    entry.bbox = safeBBox(entry.el)
  }
}
