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
    blocks: diagram.blocks.map((b) =>
      b.id === state.blockId ? { ...b, x: newX, y: newY } : b,
    ),
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
