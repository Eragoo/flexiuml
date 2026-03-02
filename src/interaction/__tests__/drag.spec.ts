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

// ── Composite state support ──────────────────────────────────

const COMPOSITE_DIAGRAM: LayoutDiagram = {
  blocks: [
    { id: 'Simple', label: 'Simple', type: 'component', x: 10, y: 10, width: 100, height: 40 },
    {
      id: 'Composite',
      label: 'Composite',
      type: 'state',
      x: 200,
      y: 100,
      width: 300,
      height: 200,
      children: [
        { id: 'ChildA', label: 'ChildA', type: 'state', x: 220, y: 140, width: 80, height: 30 },
        { id: 'ChildB', label: 'ChildB', type: 'state', x: 320, y: 140, width: 80, height: 30 },
      ],
      childConnections: [{ fromId: 'ChildA', toId: 'ChildB', arrowType: '-->' }],
    },
  ],
  connections: [],
}

describe('hitTest – composite states', () => {
  it('should return composite id when clicking the composite border area (not on a child)', () => {
    // Click in the composite area but not on any child (x=210, y=110 is above children)
    const result = hitTest(COMPOSITE_DIAGRAM, 210, 110)

    expect(result).toBe('Composite')
  })

  it('should return composite id when clicking on a child block inside it', () => {
    // Click inside ChildA (x=230, y=150)
    const result = hitTest(COMPOSITE_DIAGRAM, 230, 150)

    expect(result).toBe('Composite')
  })

  it('should return null when clicking outside the composite', () => {
    const result = hitTest(COMPOSITE_DIAGRAM, 600, 600)

    expect(result).toBeNull()
  })

  it('should still detect simple (non-composite) blocks', () => {
    const result = hitTest(COMPOSITE_DIAGRAM, 50, 30)

    expect(result).toBe('Simple')
  })
})

describe('startDrag – composite states', () => {
  it('should start drag on composite when clicking a child area', () => {
    // Click inside ChildA (x=230, y=150)
    const state = startDrag(COMPOSITE_DIAGRAM, 230, 150)

    expect(state.dragging).toBe(true)
    expect(state.blockId).toBe('Composite')
    // Offset relative to composite origin (200, 100)
    expect(state.offsetX).toBe(30) // 230 - 200
    expect(state.offsetY).toBe(50) // 150 - 100
  })

  it('should compute offset relative to composite origin, not child origin', () => {
    // Click inside ChildB (x=350, y=155)
    const state = startDrag(COMPOSITE_DIAGRAM, 350, 155)

    expect(state.blockId).toBe('Composite')
    expect(state.offsetX).toBe(150) // 350 - 200
    expect(state.offsetY).toBe(55) // 155 - 100
  })
})

describe('moveDrag – composite states', () => {
  it('should move composite and all its children by the same delta', () => {
    // Start drag on Composite at (230, 150) -> offset (30, 50)
    const dragState = { dragging: true, blockId: 'Composite', offsetX: 30, offsetY: 50 }

    // Move mouse to (280, 200) -> new composite position: (250, 150), delta = (+50, +50)
    const updated = moveDrag(COMPOSITE_DIAGRAM, dragState, 280, 200)

    const composite = updated.blocks.find((b) => b.id === 'Composite')!
    expect(composite.x).toBe(250) // 280 - 30
    expect(composite.y).toBe(150) // 200 - 50

    // Children should move by same delta (+50, +50)
    expect(composite.children).toBeDefined()
    const childA = composite.children!.find((c) => c.id === 'ChildA')!
    const childB = composite.children!.find((c) => c.id === 'ChildB')!

    expect(childA.x).toBe(270) // 220 + 50
    expect(childA.y).toBe(190) // 140 + 50
    expect(childB.x).toBe(370) // 320 + 50
    expect(childB.y).toBe(190) // 140 + 50
  })

  it('should preserve child dimensions after moving a composite', () => {
    const dragState = { dragging: true, blockId: 'Composite', offsetX: 30, offsetY: 50 }

    const updated = moveDrag(COMPOSITE_DIAGRAM, dragState, 280, 200)

    const composite = updated.blocks.find((b) => b.id === 'Composite')!
    const childA = composite.children!.find((c) => c.id === 'ChildA')!

    expect(childA.width).toBe(80)
    expect(childA.height).toBe(30)
  })

  it('should preserve childConnections after moving a composite', () => {
    const dragState = { dragging: true, blockId: 'Composite', offsetX: 30, offsetY: 50 }

    const updated = moveDrag(COMPOSITE_DIAGRAM, dragState, 280, 200)

    const composite = updated.blocks.find((b) => b.id === 'Composite')!
    expect(composite.childConnections).toEqual([
      { fromId: 'ChildA', toId: 'ChildB', arrowType: '-->' },
    ])
  })

  it('should not modify children of non-dragged composites', () => {
    const dragState = { dragging: true, blockId: 'Simple', offsetX: 10, offsetY: 10 }

    const updated = moveDrag(COMPOSITE_DIAGRAM, dragState, 60, 60)

    const composite = updated.blocks.find((b) => b.id === 'Composite')!
    expect(composite.x).toBe(200)
    expect(composite.children![0]!.x).toBe(220)
  })
})
