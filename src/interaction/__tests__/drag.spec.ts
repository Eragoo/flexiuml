import { describe, it, expect } from 'vitest'
import { hitTest, startDrag, moveDrag, endDrag, IDLE_STATE } from '../drag'
import type { LayoutDiagram } from '../../core/types'

const TWO_BLOCK_DIAGRAM: LayoutDiagram = {
  blocks: [
    { id: 'A', label: 'A', type: 'component', x: 50, y: 50, width: 100, height: 40 },
    { id: 'B', label: 'B', type: 'component', x: 300, y: 50, width: 100, height: 40 },
  ],
  connections: [{ fromId: 'A', toId: 'B', arrowType: '-->' }],
}

// ── hitTest ───────────────────────────────────────────────────

describe('hitTest', () => {
  it('should return block id when point is inside a block', () => {
    const result = hitTest(TWO_BLOCK_DIAGRAM, 100, 70)

    expect(result).toBe('A')
  })

  it('should return null when point is outside all blocks', () => {
    const result = hitTest(TWO_BLOCK_DIAGRAM, 250, 200)

    expect(result).toBeNull()
  })

  it('should return topmost (last) block when blocks overlap', () => {
    const overlapping: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 50, y: 50, width: 100, height: 40 },
        { id: 'B', label: 'B', type: 'component', x: 80, y: 50, width: 100, height: 40 },
      ],
      connections: [],
    }

    // Point at x=120 is inside both A (50-150) and B (80-180)
    const result = hitTest(overlapping, 120, 70)

    expect(result).toBe('B')
  })

  it('should detect hit on block edge (boundary)', () => {
    // Exact top-left corner
    const result = hitTest(TWO_BLOCK_DIAGRAM, 50, 50)

    expect(result).toBe('A')
  })
})

// ── startDrag ─────────────────────────────────────────────────

describe('startDrag', () => {
  it('should set dragging=true and blockId when starting on a block', () => {
    const state = startDrag(TWO_BLOCK_DIAGRAM, 100, 70)

    expect(state.dragging).toBe(true)
    expect(state.blockId).toBe('A')
  })

  it('should set dragging=false when starting on empty space', () => {
    const state = startDrag(TWO_BLOCK_DIAGRAM, 250, 200)

    expect(state.dragging).toBe(false)
    expect(state.blockId).toBeNull()
  })

  it('should compute correct offset between mouse and block origin', () => {
    // Block A is at x=50, y=50. Mouse at x=100, y=70
    const state = startDrag(TWO_BLOCK_DIAGRAM, 100, 70)

    expect(state.offsetX).toBe(50) // 100 - 50
    expect(state.offsetY).toBe(20) // 70 - 50
  })
})

// ── moveDrag ──────────────────────────────────────────────────

describe('moveDrag', () => {
  it('should update block position during drag', () => {
    const dragState = { dragging: true, blockId: 'A', offsetX: 50, offsetY: 20 }

    const updated = moveDrag(TWO_BLOCK_DIAGRAM, dragState, 200, 120)

    const movedBlock = updated.blocks.find((b) => b.id === 'A')!
    expect(movedBlock.x).toBe(150) // 200 - 50
    expect(movedBlock.y).toBe(100) // 120 - 20
  })

  it('should preserve offset (block does not jump to cursor)', () => {
    // Start drag on A at mouse (75, 60) -> offset = (25, 10)
    const dragState = { dragging: true, blockId: 'A', offsetX: 25, offsetY: 10 }

    const updated = moveDrag(TWO_BLOCK_DIAGRAM, dragState, 125, 80)

    const movedBlock = updated.blocks.find((b) => b.id === 'A')!
    // New x = 125 - 25 = 100, new y = 80 - 10 = 70
    expect(movedBlock.x).toBe(100)
    expect(movedBlock.y).toBe(70)
  })

  it('should not modify other blocks during drag', () => {
    const dragState = { dragging: true, blockId: 'A', offsetX: 50, offsetY: 20 }

    const updated = moveDrag(TWO_BLOCK_DIAGRAM, dragState, 200, 120)

    const blockB = updated.blocks.find((b) => b.id === 'B')!
    expect(blockB.x).toBe(300)
    expect(blockB.y).toBe(50)
  })

  it('should return diagram unchanged when not dragging', () => {
    const updated = moveDrag(TWO_BLOCK_DIAGRAM, IDLE_STATE, 200, 120)

    expect(updated).toEqual(TWO_BLOCK_DIAGRAM)
  })
})

// ── endDrag ───────────────────────────────────────────────────

describe('endDrag', () => {
  it('should set dragging=false and clear blockId', () => {
    const active = { dragging: true, blockId: 'A', offsetX: 50, offsetY: 20 }

    const result = endDrag(active)

    expect(result.dragging).toBe(false)
    expect(result.blockId).toBeNull()
  })

  it('should return idle state when ending without active drag', () => {
    const result = endDrag(IDLE_STATE)

    expect(result).toEqual(IDLE_STATE)
  })
})
