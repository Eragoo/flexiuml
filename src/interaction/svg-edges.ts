import type { Point } from '../core/types'

/**
 * Mermaid edge path elements have:
 *   - data-id: edge ID like "L_A_B_0" (format: L_<start>_<end>_<counter>)
 *   - data-points: base64-encoded JSON array of {x,y} points (original layout coordinates)
 *   - d: SVG path data with absolute coordinates
 *
 * Edge labels live in a sibling <g class="edgeLabels"> group, with inner
 * <g class="label" data-id="L_A_B_0"> elements.
 */

/** Info about an edge and which node endpoints it connects. */
export interface EdgeInfo {
  /** The Mermaid edge ID (e.g. "L_A_B_0") */
  edgeId: string
  /** The edge path <path> element */
  pathEl: SVGPathElement
  /** The edge label <g> element (or null if no label) */
  labelEl: SVGGElement | null
  /** Node ID at the start of this edge */
  startNodeId: string
  /** Node ID at the end of this edge */
  endNodeId: string
  /** Original layout points decoded from data-points */
  originalPoints: Point[]
}

/** Map from node ID → list of connected edges (both as start and end). */
export type EdgeMap = Map<string, EdgeInfo[]>

/**
 * Parse a Mermaid edge ID to extract start and end node IDs.
 * Format: "L_<start>_<end>_<counter>"
 *
 * However, node IDs themselves can contain underscores, so we need a strategy:
 * we match the known node IDs in the SVG against the edge ID.
 */
export function parseEdgeId(
  edgeId: string,
  knownNodeIds: Set<string>,
): { start: string; end: string } | null {
  // Edge IDs: L_<start>_<end>_<counter>
  // Strip prefix "L_" and suffix "_<number>"
  const withoutPrefix = edgeId.replace(/^L_/, '')
  const withoutSuffix = withoutPrefix.replace(/_\d+$/, '')

  // Try to split into start_end where start and end are known node IDs.
  // First valid split wins. Ambiguity is possible when multiple node IDs
  // contain underscores, but Mermaid-generated IDs are typically simple
  // alphanumeric strings, making this safe in practice.
  for (let i = 1; i < withoutSuffix.length; i++) {
    if (withoutSuffix[i] === '_') {
      const start = withoutSuffix.substring(0, i)
      const end = withoutSuffix.substring(i + 1)
      if (knownNodeIds.has(start) && knownNodeIds.has(end)) {
        return { start, end }
      }
    }
  }

  // Fallback: if we couldn't match known IDs, try simple split
  // (works when node IDs don't contain underscores)
  const parts = withoutSuffix.split('_')
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { start: parts[0], end: parts[1] }
  }

  return null
}

/**
 * Decode the original points from a Mermaid edge's data-points attribute.
 * The value is a base64-encoded JSON array of {x, y} objects.
 */
export function decodeEdgePoints(dataPoints: string): Point[] {
  try {
    const json = atob(dataPoints)
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (p): p is { x: number; y: number } =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as Record<string, unknown>).x === 'number' &&
          typeof (p as Record<string, unknown>).y === 'number',
      )
      .map((p) => ({ x: p.x, y: p.y }))
  } catch {
    return []
  }
}

/**
 * Collect all node IDs present in the SVG (from elements matching nodeSelector).
 */
export function collectNodeIds(
  svg: SVGSVGElement,
  nodeSelector: string,
  extractNodeId: (el: SVGElement) => string | null,
): Set<string> {
  const ids = new Set<string>()
  const nodes = svg.querySelectorAll(nodeSelector)
  for (const node of nodes) {
    if (!(node instanceof SVGElement)) continue
    const id = extractNodeId(node)
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Build an edge map from the SVG: for each node, which edges connect to/from it.
 * This should be called once after rendering and cached.
 */
export function buildEdgeMap(
  svg: SVGSVGElement,
  knownNodeIds: Set<string>,
): EdgeMap {
  const edgeMap: EdgeMap = new Map()

  // Find all edge paths (they have data-edge="true" or class containing "flowchart-link")
  const edgePaths = svg.querySelectorAll<SVGPathElement>(
    'path[data-id][data-points]',
  )

  for (const pathEl of edgePaths) {
    const edgeId = pathEl.getAttribute('data-id')
    const dataPoints = pathEl.getAttribute('data-points')
    if (!edgeId || !dataPoints) continue

    const parsed = parseEdgeId(edgeId, knownNodeIds)
    if (!parsed) continue

    const originalPoints = decodeEdgePoints(dataPoints)
    if (originalPoints.length === 0) continue

    // Find the corresponding edge label (if any)
    const labelEl = svg.querySelector<SVGGElement>(
      `g.edgeLabel g.label[data-id="${CSS.escape(edgeId)}"]`,
    )

    const info: EdgeInfo = {
      edgeId,
      pathEl,
      labelEl: labelEl?.closest('g.edgeLabel') as SVGGElement | null,
      startNodeId: parsed.start,
      endNodeId: parsed.end,
      originalPoints,
    }

    // Add to start node's edge list
    if (!edgeMap.has(parsed.start)) edgeMap.set(parsed.start, [])
    edgeMap.get(parsed.start)!.push(info)

    // Add to end node's edge list (if different from start)
    if (parsed.start !== parsed.end) {
      if (!edgeMap.has(parsed.end)) edgeMap.set(parsed.end, [])
      edgeMap.get(parsed.end)!.push(info)
    }
  }

  return edgeMap
}

/**
 * Given the original points array and deltas for start/end nodes,
 * compute new points with the relevant endpoints shifted.
 */
export function shiftEdgePoints(
  originalPoints: Point[],
  startDelta: Point,
  endDelta: Point,
): Point[] {
  if (originalPoints.length === 0) return []

  const len = originalPoints.length

  // Single-point edge: apply start delta only
  if (len === 1) {
    return [{ x: originalPoints[0]!.x + startDelta.x, y: originalPoints[0]!.y + startDelta.y }]
  }

  // For a simple 2-point edge, shift start and end directly
  if (len === 2) {
    return [
      { x: originalPoints[0]!.x + startDelta.x, y: originalPoints[0]!.y + startDelta.y },
      { x: originalPoints[1]!.x + endDelta.x, y: originalPoints[1]!.y + endDelta.y },
    ]
  }

  // For multi-point edges: interpolate the shift across intermediate points
  // Start point gets startDelta, end point gets endDelta, middle points are interpolated
  return originalPoints.map((pt, i) => {
    const t = i / (len - 1)
    const dx = startDelta.x * (1 - t) + endDelta.x * t
    const dy = startDelta.y * (1 - t) + endDelta.y * t
    return { x: pt.x + dx, y: pt.y + dy }
  })
}

/**
 * Generate an SVG path "d" attribute from an array of points.
 * Uses cubic Bezier curves for smooth paths (matching Mermaid's curveBasis-like output).
 */
export function pointsToPathD(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0]!.x},${points[0]!.y}`

  if (points.length === 2) {
    return `M${points[0]!.x},${points[0]!.y}L${points[1]!.x},${points[1]!.y}`
  }

  // Use smooth curve through all points
  let d = `M${points[0]!.x},${points[0]!.y}`

  // For 3+ points, use cubic Bezier approximation
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    const next = points[i + 1]!

    // Control points: use midpoints for smooth curve
    const cp1x = (prev.x + curr.x) / 2
    const cp1y = (prev.y + curr.y) / 2
    const cp2x = (curr.x + next.x) / 2
    const cp2y = (curr.y + next.y) / 2

    if (i === 1) {
      d += `C${cp1x},${cp1y} ${curr.x},${curr.y} ${cp2x},${cp2y}`
    } else {
      d += `S${curr.x},${curr.y} ${cp2x},${cp2y}`
    }
  }

  // Final line to last point
  const last = points[points.length - 1]!
  d += `L${last.x},${last.y}`

  return d
}

/**
 * Compute the midpoint of a set of points (for edge label positioning).
 */
export function computeLabelPosition(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { ...points[0]! }

  // Use the midpoint along the polyline
  let totalLength = 0
  const segments: number[] = []
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x
    const dy = points[i]!.y - points[i - 1]!.y
    const len = Math.sqrt(dx * dx + dy * dy)
    segments.push(len)
    totalLength += len
  }

  const halfLength = totalLength / 2
  let accumulated = 0
  for (let i = 0; i < segments.length; i++) {
    if (accumulated + segments[i]! >= halfLength) {
      const remaining = halfLength - accumulated
      const t = segments[i]! > 0 ? remaining / segments[i]! : 0
      return {
        x: points[i]!.x + (points[i + 1]!.x - points[i]!.x) * t,
        y: points[i]!.y + (points[i + 1]!.y - points[i]!.y) * t,
      }
    }
    accumulated += segments[i]!
  }

  // Fallback: return last point
  return { ...points[points.length - 1]! }
}

/**
 * Get the current translate delta of a node from its original position.
 * This is just the node's current translate transform.
 */
export function getNodeDelta(
  svg: SVGSVGElement,
  nodeId: string,
  getTranslate: (el: SVGElement) => Point,
): Point {
  const nodeEl = svg.querySelector(`[data-id="${CSS.escape(nodeId)}"]`)
  if (!nodeEl || !(nodeEl instanceof SVGElement)) return { x: 0, y: 0 }
  return getTranslate(nodeEl)
}

/**
 * Update all edges connected to a specific node.
 * Called during drag to keep edges attached to their endpoints.
 */
export function updateEdgesForNode(
  svg: SVGSVGElement,
  nodeId: string,
  edgeMap: EdgeMap,
  getTranslate: (el: SVGElement) => Point,
): void {
  const edges = edgeMap.get(nodeId)
  if (!edges) return

  // Track which edges we've already updated (an edge may appear twice if
  // the node is both start and end, e.g., self-loops)
  const updated = new Set<string>()

  // Cache node deltas to avoid repeated DOM queries for the same node
  const deltaCache = new Map<string, Point>()
  function getCachedDelta(nid: string): Point {
    let d = deltaCache.get(nid)
    if (d === undefined) {
      d = getNodeDelta(svg, nid, getTranslate)
      deltaCache.set(nid, d)
    }
    return d
  }

  for (const edge of edges) {
    if (updated.has(edge.edgeId)) continue
    updated.add(edge.edgeId)

    // Get current translate delta for both endpoints
    const startDelta = getCachedDelta(edge.startNodeId)
    const endDelta = getCachedDelta(edge.endNodeId)

    // Compute new points
    const newPoints = shiftEdgePoints(edge.originalPoints, startDelta, endDelta)

    // Update the path's d attribute
    const newD = pointsToPathD(newPoints)
    edge.pathEl.setAttribute('d', newD)

    // Update the edge label position (if present)
    if (edge.labelEl) {
      const labelPos = computeLabelPosition(newPoints)
      edge.labelEl.setAttribute(
        'transform',
        `translate(${labelPos.x}, ${labelPos.y})`,
      )
    }
  }
}
