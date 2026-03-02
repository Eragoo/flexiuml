import type { Block, Connection, Diagram, LayoutBlock, LayoutDiagram } from '../core/types'

const MIN_BLOCK_HEIGHT = 40
const BLOCK_PADDING_X = 24
const CHAR_WIDTH = 9
const GAP_X = 40
const GAP_Y = 40
const INITIAL_OFFSET = 20

// Pseudo-state dimensions (small filled circle)
const PSEUDO_SIZE = 20

// Padding inside composite state container
const COMPOSITE_PADDING = 20
// Extra top padding for the composite state label
const COMPOSITE_LABEL_HEIGHT = 30

export function computeLayout(diagram: Diagram): LayoutDiagram {
  if (diagram.blocks.length === 0) {
    return { blocks: [], connections: [...diagram.connections] }
  }

  const layoutBlocks = layoutBlocks_(
    diagram.blocks,
    diagram.connections,
    INITIAL_OFFSET,
    INITIAL_OFFSET,
  )

  return {
    blocks: layoutBlocks,
    connections: [...diagram.connections],
  }
}

/**
 * Core layout engine: positions a set of blocks + connections starting at (originX, originY).
 * Works recursively for composite states.
 */
function layoutBlocks_(
  blocks: Block[],
  connections: Connection[],
  originX: number,
  originY: number,
): LayoutBlock[] {
  if (blocks.length === 0) return []

  // Step 1: Compute block sizes (recurse into composite states first)
  const sizeOf = new Map<string, { width: number; height: number }>()
  // For composite states, we pre-compute their inner layout so we know their size
  const innerLayouts = new Map<
    string,
    { children: LayoutBlock[]; childConnections: Connection[] }
  >()

  for (const block of blocks) {
    if (block.type === 'pseudostate') {
      sizeOf.set(block.id, { width: PSEUDO_SIZE, height: PSEUDO_SIZE })
    } else if (block.children && block.children.length > 0) {
      // Composite state: lay out children internally first to determine size
      const innerBlocks = layoutBlocks_(
        block.children,
        block.childConnections ?? [],
        0, // relative coords; we'll offset later
        0,
      )

      // Compute bounding box of inner layout
      let maxRight = 0
      let maxBottom = 0
      for (const child of innerBlocks) {
        const right = child.x + child.width
        const bottom = child.y + child.height
        if (right > maxRight) maxRight = right
        if (bottom > maxBottom) maxBottom = bottom
      }

      const compositeWidth = maxRight + COMPOSITE_PADDING * 2
      const compositeHeight = maxBottom + COMPOSITE_PADDING + COMPOSITE_LABEL_HEIGHT

      sizeOf.set(block.id, { width: compositeWidth, height: compositeHeight })
      innerLayouts.set(block.id, {
        children: innerBlocks,
        childConnections: block.childConnections ?? [],
      })
    } else {
      const w = Math.max(80, block.label.length * CHAR_WIDTH + BLOCK_PADDING_X * 2)
      sizeOf.set(block.id, { width: w, height: MIN_BLOCK_HEIGHT })
    }
  }

  // Step 2: Build directed adjacency
  const childAdj = new Map<string, string[]>()
  const parentAdj = new Map<string, string[]>()
  for (const block of blocks) {
    childAdj.set(block.id, [])
    parentAdj.set(block.id, [])
  }

  for (const conn of connections) {
    let fromId = conn.fromId
    let toId = conn.toId
    if (conn.arrowType === '<--' || conn.arrowType === '<..') {
      fromId = conn.toId
      toId = conn.fromId
    }
    childAdj.get(fromId)?.push(toId)
    parentAdj.get(toId)?.push(fromId)
  }

  // Step 3: Layering (longest path from roots, with cycle guard)
  const allIds = blocks.map((b) => b.id)
  const layer = new Map<string, number>()

  for (const id of allIds) {
    layer.set(id, -1)
  }

  // Roots: no parents
  for (const id of allIds) {
    if ((parentAdj.get(id) ?? []).length === 0) {
      layer.set(id, 0)
    }
  }

  let changed = true
  let iterations = 0
  const maxIterations = allIds.length + 1

  while (changed && iterations < maxIterations) {
    changed = false
    iterations++
    for (const id of allIds) {
      const pIds = parentAdj.get(id) ?? []
      if (pIds.length === 0) continue
      const parentLayers = pIds.map((p) => layer.get(p) ?? -1)
      const maxParentLayer = parentLayers.reduce((a, b) => Math.max(a, b), -1)
      if (maxParentLayer < 0) continue
      const newLayer = maxParentLayer + 1
      if (newLayer > (layer.get(id) ?? -1)) {
        layer.set(id, newLayer)
        changed = true
      }
    }
  }

  // Fallback for cycles / orphans
  for (const id of allIds) {
    if ((layer.get(id) ?? -1) < 0) {
      layer.set(id, 0)
    }
  }

  // Step 4: Group by layer
  const layers = new Map<number, string[]>()
  for (const id of allIds) {
    const l = layer.get(id) ?? 0
    if (!layers.has(l)) layers.set(l, [])
    layers.get(l)!.push(id)
  }
  const sortedLayerKeys = [...layers.keys()].sort((a, b) => a - b)

  // Step 5: Order within layers by median rank of parents
  const xRank = new Map<string, number>()

  for (const layerKey of sortedLayerKeys) {
    const nodesInLayer = layers.get(layerKey)!

    if (layerKey === sortedLayerKeys[0]) {
      for (let i = 0; i < nodesInLayer.length; i++) {
        xRank.set(nodesInLayer[i]!, i)
      }
    } else {
      const medianRank = (id: string): number => {
        const pIds = parentAdj.get(id) ?? []
        const pRanks = pIds.map((p) => xRank.get(p) ?? 0).sort((a, b) => a - b)
        if (pRanks.length === 0) return 0
        const mid = Math.floor(pRanks.length / 2)
        return pRanks.length % 2 === 1
          ? pRanks[mid]!
          : (pRanks[mid - 1]! + pRanks[mid]!) / 2
      }

      nodesInLayer.sort((a, b) => medianRank(a) - medianRank(b))

      for (let i = 0; i < nodesInLayer.length; i++) {
        xRank.set(nodesInLayer[i]!, i)
      }
    }
  }

  // Step 6: Convert to pixel coordinates
  const blockMap = new Map<string, Block>()
  for (const block of blocks) {
    blockMap.set(block.id, block)
  }

  // Compute max height per layer (for variable row heights with composite states)
  const layerMaxHeight = new Map<number, number>()
  for (const layerKey of sortedLayerKeys) {
    const nodesInLayer = layers.get(layerKey)!
    let maxH = 0
    for (const id of nodesInLayer) {
      const h = sizeOf.get(id)?.height ?? MIN_BLOCK_HEIGHT
      if (h > maxH) maxH = h
    }
    layerMaxHeight.set(layerKey, maxH)
  }

  // Compute the widest layer for centering
  let maxLayerWidth = 0
  for (const layerKey of sortedLayerKeys) {
    const nodesInLayer = layers.get(layerKey) ?? []
    let layerWidth = 0
    for (const id of nodesInLayer) {
      layerWidth += sizeOf.get(id)?.width ?? 80
    }
    layerWidth += Math.max(0, nodesInLayer.length - 1) * GAP_X
    if (layerWidth > maxLayerWidth) maxLayerWidth = layerWidth
  }

  const layoutResult: LayoutBlock[] = []

  // Compute cumulative Y offsets for each layer (based on max height of preceding layers)
  let yAccum = originY
  const layerY = new Map<number, number>()
  for (let li = 0; li < sortedLayerKeys.length; li++) {
    const layerKey = sortedLayerKeys[li]!
    layerY.set(layerKey, yAccum)
    const layerH = layerMaxHeight.get(layerKey) ?? MIN_BLOCK_HEIGHT
    yAccum += layerH + GAP_Y
  }

  for (const layerKey of sortedLayerKeys) {
    const nodesInLayer = layers.get(layerKey)!
    const y = layerY.get(layerKey)!
    const rowMaxH = layerMaxHeight.get(layerKey) ?? MIN_BLOCK_HEIGHT

    // Compute this layer's total width for centering
    let layerWidth = 0
    for (const id of nodesInLayer) {
      layerWidth += sizeOf.get(id)?.width ?? 80
    }
    layerWidth += Math.max(0, nodesInLayer.length - 1) * GAP_X

    let xCursor = originX + Math.max(0, (maxLayerWidth - layerWidth) / 2)

    for (const id of nodesInLayer) {
      const block = blockMap.get(id)
      if (!block) continue
      const size = sizeOf.get(id) ?? { width: 80, height: MIN_BLOCK_HEIGHT }

      // Vertically center within the row (important when composites make rows tall)
      const blockY = y + Math.max(0, (rowMaxH - size.height) / 2)

      const layoutBlock: LayoutBlock = {
        id: block.id,
        label: block.label,
        type: block.type,
        x: xCursor,
        y: blockY,
        width: size.width,
        height: size.height,
      }

      // Attach positioned children for composite states
      const inner = innerLayouts.get(id)
      if (inner) {
        // Offset inner children to be inside the composite container
        const innerOffsetX = xCursor + COMPOSITE_PADDING
        const innerOffsetY = blockY + COMPOSITE_LABEL_HEIGHT
        layoutBlock.children = inner.children.map((child) => ({
          ...child,
          x: child.x + innerOffsetX,
          y: child.y + innerOffsetY,
        }))
        layoutBlock.childConnections = inner.childConnections
      }

      layoutResult.push(layoutBlock)
      xCursor += size.width + GAP_X
    }
  }

  return layoutResult
}
