/**
 * Persistent layout model for diagram elements.
 *
 * LayoutMap stores node and container positions/sizes separately from Mermaid text.
 * Mermaid text is NEVER modified to store coordinates — all manual layout lives here.
 */

export interface NodeLayoutEntry {
  x: number
  y: number
  parentId?: string
  locked?: boolean
}

export interface ContainerLayoutEntry {
  x: number
  y: number
  width: number
  height: number
  mode: 'fit' | 'manual'
  locked?: boolean
}

export interface LayoutMap {
  version: number
  mermaidHash?: string
  nodes: Record<string, NodeLayoutEntry>
  containers: Record<string, ContainerLayoutEntry>
}

const CURRENT_VERSION = 1

export function createEmptyLayout(): LayoutMap {
  return {
    version: CURRENT_VERSION,
    nodes: {},
    containers: {},
  }
}

/**
 * Simple deterministic hash of Mermaid text for staleness detection.
 * Uses DJB2 algorithm — fast and collision-resistant enough for our purposes.
 */
export function computeMermaidHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

export function serializeLayout(layout: LayoutMap): string {
  return JSON.stringify(layout, null, 2)
}

export function validateLayout(parsed: unknown): LayoutMap {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('nodes' in parsed) ||
    !('containers' in parsed)
  ) {
    throw new Error('Invalid layout JSON: missing required fields')
  }
  const layout = parsed as LayoutMap
  if (typeof layout.version !== 'number') {
    throw new Error('Invalid layout JSON: version must be a number')
  }
  return layout
}

export function deserializeLayout(json: string): LayoutMap {
  const parsed: unknown = JSON.parse(json)
  return validateLayout(parsed)
}

/**
 * Update a single node's position in the layout map (immutable).
 */
export function updateNodePosition(
  layout: LayoutMap,
  nodeId: string,
  x: number,
  y: number,
): LayoutMap {
  const existing = layout.nodes[nodeId]
  return {
    ...layout,
    nodes: {
      ...layout.nodes,
      [nodeId]: { ...existing, x, y },
    },
  }
}

/**
 * Update multiple nodes' positions at once (immutable).
 */
export function updateNodePositions(
  layout: LayoutMap,
  updates: ReadonlyMap<string, { x: number; y: number }>,
): LayoutMap {
  const newNodes = { ...layout.nodes }
  for (const [id, pos] of updates) {
    const existing = newNodes[id]
    newNodes[id] = { ...existing, x: pos.x, y: pos.y }
  }
  return { ...layout, nodes: newNodes }
}

/**
 * Update a container's geometry in the layout map (immutable).
 */
export function updateContainerGeometry(
  layout: LayoutMap,
  containerId: string,
  update: Partial<ContainerLayoutEntry>,
): LayoutMap {
  const existing = layout.containers[containerId] ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    mode: 'fit' as const,
  }
  return {
    ...layout,
    containers: {
      ...layout.containers,
      [containerId]: { ...existing, ...update },
    },
  }
}

/**
 * Set a node's parentId in the layout map (immutable).
 */
export function setNodeParent(
  layout: LayoutMap,
  nodeId: string,
  parentId: string | null,
): LayoutMap {
  const existing = layout.nodes[nodeId]
  if (!existing) return layout
  const entry = { ...existing }
  if (parentId) {
    entry.parentId = parentId
  } else {
    delete entry.parentId
  }
  return {
    ...layout,
    nodes: { ...layout.nodes, [nodeId]: entry },
  }
}
