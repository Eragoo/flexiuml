import type { Diagram, LayoutBlock, LayoutDiagram } from '../core/types'

const MIN_BLOCK_HEIGHT = 40
const BLOCK_PADDING_X = 24
const CHAR_WIDTH = 9
const GAP_X = 40
const GAP_Y = 40
const INITIAL_OFFSET = 20
const COLUMNS = 4

export function computeLayout(diagram: Diagram): LayoutDiagram {
  if (diagram.blocks.length === 0) {
    return { blocks: [], connections: [...diagram.connections] }
  }

  // First pass: compute block sizes and column assignments
  const blockSizes = diagram.blocks.map((block, index) => ({
    block,
    index,
    width: Math.max(80, block.label.length * CHAR_WIDTH + BLOCK_PADDING_X * 2),
    height: MIN_BLOCK_HEIGHT,
    col: index % COLUMNS,
    row: Math.floor(index / COLUMNS),
  }))

  // Compute max width per column
  const colWidths = new Array<number>(COLUMNS).fill(0)
  for (const entry of blockSizes) {
    if (entry.width > colWidths[entry.col]!) {
      colWidths[entry.col] = entry.width
    }
  }

  // Compute column x-offsets (cumulative widths + gaps)
  const colX = new Array<number>(COLUMNS).fill(0)
  let xAccum = INITIAL_OFFSET
  for (let c = 0; c < COLUMNS; c++) {
    colX[c] = xAccum
    xAccum += (colWidths[c] ?? 0) + GAP_X
  }

  // Second pass: assign positions using computed column offsets
  const layoutBlocks: LayoutBlock[] = blockSizes.map((entry) => {
    const x = colX[entry.col]!
    const y = INITIAL_OFFSET + entry.row * (entry.height + GAP_Y)

    return {
      ...entry.block,
      x,
      y,
      width: entry.width,
      height: entry.height,
    }
  })

  return {
    blocks: layoutBlocks,
    connections: [...diagram.connections],
  }
}
