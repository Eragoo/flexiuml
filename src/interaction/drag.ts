import type { LayoutBlock, LayoutDiagram } from '../core/types'

export interface DragState {
  dragging: boolean
  blockId: string | null
  offsetX: number
  offsetY: number
}

export const IDLE_STATE: DragState = {
  dragging: false,
  blockId: null,
  offsetX: 0,
  offsetY: 0,
}

export function hitTest(diagram: LayoutDiagram, x: number, y: number): string | null {
  // Iterate in reverse so the last (topmost) block wins
  for (let i = diagram.blocks.length - 1; i >= 0; i--) {
    const b = diagram.blocks[i]
    if (b && isPointInsideBlock(b, x, y)) {
      return b.id
    }
  }
  return null
}

export function startDrag(diagram: LayoutDiagram, x: number, y: number): DragState {
  const blockId = hitTest(diagram, x, y)
  if (blockId === null) {
    return { ...IDLE_STATE }
  }

  const block = diagram.blocks.find((b) => b.id === blockId)
  if (!block) return { ...IDLE_STATE }

  return {
    dragging: true,
    blockId,
    offsetX: x - block.x,
    offsetY: y - block.y,
  }
}

/** Recursively translate a block and all its children by (dx, dy). */
function translateBlock(block: LayoutBlock, dx: number, dy: number): LayoutBlock {
  const moved: LayoutBlock = { ...block, x: block.x + dx, y: block.y + dy }
  if (block.children) {
    moved.children = block.children.map((child) => translateBlock(child, dx, dy))
  }
  return moved
}

export function moveDrag(
  diagram: LayoutDiagram,
  state: DragState,
  x: number,
  y: number,
): LayoutDiagram {
  if (!state.dragging || state.blockId === null) {
    return diagram
  }

  const newX = x - state.offsetX
  const newY = y - state.offsetY

  return {
    ...diagram,
    blocks: diagram.blocks.map((b) => {
      if (b.id !== state.blockId) return b

      const dx = newX - b.x
      const dy = newY - b.y

      return translateBlock(b, dx, dy)
    }),
  }
}

export function endDrag(_state: DragState): DragState {
  return { ...IDLE_STATE }
}

function isPointInsideBlock(block: LayoutBlock, x: number, y: number): boolean {
  return (
    x >= block.x &&
    x <= block.x + block.width &&
    y >= block.y &&
    y <= block.y + block.height
  )
}
