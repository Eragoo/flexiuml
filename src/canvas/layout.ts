import type { Block, Diagram, LayoutBlock, LayoutDiagram } from '../core/types'

const MIN_BLOCK_HEIGHT = 40
const BLOCK_PADDING_X = 24
const CHAR_WIDTH = 9
const GAP_X = 40
const GAP_Y = 40
const INITIAL_OFFSET = 20

export function computeLayout(diagram: Diagram): LayoutDiagram {
  if (diagram.blocks.length === 0) {
    return { blocks: [], connections: [...diagram.connections] }
  }

  // Compute block widths
  const widthOf = new Map<string, number>()
  for (const block of diagram.blocks) {
    widthOf.set(block.id, Math.max(80, block.label.length * CHAR_WIDTH + BLOCK_PADDING_X * 2))
  }

  // Build directed adjacency (from → to) based on arrow direction
  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  for (const block of diagram.blocks) {
    children.set(block.id, [])
    parents.set(block.id, [])
  }

  for (const conn of diagram.connections) {
    let fromId = conn.fromId
    let toId = conn.toId
    // Reverse arrows flip the direction for layout purposes
    if (conn.arrowType === '<--' || conn.arrowType === '<..') {
      fromId = conn.toId
      toId = conn.fromId
    }
    // Non-directional lines (-- ..) treat fromId as parent by convention (parse order)
    children.get(fromId)?.push(toId)
    parents.get(toId)?.push(fromId)
  }

  // Assign layers using longest path from roots
  const layer = new Map<string, number>()
  const allIds = diagram.blocks.map((b) => b.id)

  // Find roots: nodes with no parents (in the directed sense)
  const roots = allIds.filter((id) => (parents.get(id) ?? []).length === 0)

  // BFS/topological longest-path assignment
  // Initialize all to -1 (unvisited)
  for (const id of allIds) {
    layer.set(id, -1)
  }

  // Use iterative approach: process nodes, assign max(parent layers) + 1
  // Repeat until stable (handles any DAG). Guard against cycles with max iterations.
  let changed = true
  let iterations = 0
  const maxIterations = allIds.length + 1
  // Roots get layer 0
  for (const id of roots) {
    layer.set(id, 0)
  }
  // Disconnected nodes (no parents AND no children) also get layer 0
  for (const id of allIds) {
    if (
      (parents.get(id) ?? []).length === 0 &&
      (children.get(id) ?? []).length === 0
    ) {
      layer.set(id, 0)
    }
  }

  while (changed && iterations < maxIterations) {
    changed = false
    iterations++
    for (const id of allIds) {
      const parentIds = parents.get(id) ?? []
      if (parentIds.length === 0) continue
      const parentLayers = parentIds.map((p) => layer.get(p) ?? -1)
      const maxParentLayer = parentLayers.reduce((a, b) => Math.max(a, b), -1)
      if (maxParentLayer < 0) continue // parents not yet assigned
      const newLayer = maxParentLayer + 1
      if (newLayer > (layer.get(id) ?? -1)) {
        layer.set(id, newLayer)
        changed = true
      }
    }
  }

  // Any still at -1 (cycle or orphan) → layer 0
  for (const id of allIds) {
    if ((layer.get(id) ?? -1) < 0) {
      layer.set(id, 0)
    }
  }

  // Group blocks by layer
  const layers = new Map<number, string[]>()
  for (const id of allIds) {
    const l = layer.get(id) ?? 0
    if (!layers.has(l)) layers.set(l, [])
    layers.get(l)!.push(id)
  }

  // Sort layer keys
  const sortedLayerKeys = [...layers.keys()].sort((a, b) => a - b)

  // Order nodes within each layer by median rank of their parents (reduces crossings)
  const xRank = new Map<string, number>()

  for (const layerKey of sortedLayerKeys) {
    const nodesInLayer = layers.get(layerKey)!

    if (layerKey === 0) {
      // Root layer: spread evenly
      for (let i = 0; i < nodesInLayer.length; i++) {
        xRank.set(nodesInLayer[i]!, i)
      }
    } else {
      // Sort by median rank of parents
      const medianRank = (id: string): number => {
        const pIds = parents.get(id) ?? []
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

  // Convert logical positions to pixel coordinates
  const blockMap = new Map<string, Block>()
  for (const block of diagram.blocks) {
    blockMap.set(block.id, block)
  }

  const layoutBlocks: LayoutBlock[] = []

  // Compute the widest layer for centering
  let maxLayerWidth = 0
  for (const layerKey of sortedLayerKeys) {
    const nodesInLayer = layers.get(layerKey) ?? []
    let layerWidth = 0
    for (const id of nodesInLayer) {
      layerWidth += widthOf.get(id) ?? 80
    }
    layerWidth += Math.max(0, nodesInLayer.length - 1) * GAP_X
    if (layerWidth > maxLayerWidth) maxLayerWidth = layerWidth
  }

  for (const layerKey of sortedLayerKeys) {
    const nodesInLayer = layers.get(layerKey)!
    const y = INITIAL_OFFSET + layerKey * (MIN_BLOCK_HEIGHT + GAP_Y)

    // Compute this layer's total width for centering
    let layerWidth = 0
    for (const id of nodesInLayer) {
      layerWidth += widthOf.get(id) ?? 80
    }
    layerWidth += Math.max(0, nodesInLayer.length - 1) * GAP_X

    // Center this layer relative to the widest layer
    let xCursor = INITIAL_OFFSET + Math.max(0, (maxLayerWidth - layerWidth) / 2)

    for (const id of nodesInLayer) {
      const block = blockMap.get(id)
      if (!block) continue
      const w = widthOf.get(id) ?? 80

      layoutBlocks.push({
        ...block,
        x: xCursor,
        y,
        width: w,
        height: MIN_BLOCK_HEIGHT,
      })

      xCursor += w + GAP_X
    }
  }

  return {
    blocks: layoutBlocks,
    connections: [...diagram.connections],
  }
}
