import { describe, it, expect } from 'vitest'
import { computeLayout } from '../layout'
import type { Diagram } from '../../core/types'

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

describe('computeLayout', () => {
  // ── Happy Path ──────────────────────────────────────────────

  it('should assign positions to all blocks', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '-->' }],
    }

    const layout = computeLayout(diagram)

    expect(layout.blocks).toHaveLength(2)
    for (const block of layout.blocks) {
      expect(block.x).toBeDefined()
      expect(block.y).toBeDefined()
      expect(block.width).toBeGreaterThan(0)
      expect(block.height).toBeGreaterThan(0)
    }
  })

  it('should not overlap any blocks', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
        { id: 'C', label: 'C', type: 'component' },
      ],
      connections: [
        { fromId: 'A', toId: 'B', arrowType: '-->' },
        { fromId: 'B', toId: 'C', arrowType: '-->' },
      ],
    }

    const layout = computeLayout(diagram)

    for (let i = 0; i < layout.blocks.length; i++) {
      for (let j = i + 1; j < layout.blocks.length; j++) {
        const a = layout.blocks[i]
        const b = layout.blocks[j]
        if (a && b) {
          expect(rectsOverlap(a, b)).toBe(false)
        }
      }
    }
  })

  it('should compute width based on label length', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'A Very Long Label Name', type: 'component' },
      ],
      connections: [],
    }

    const layout = computeLayout(diagram)
    const shortBlock = layout.blocks.find((b) => b.id === 'A')
    const longBlock = layout.blocks.find((b) => b.id === 'B')
    expect(shortBlock).toBeDefined()
    expect(longBlock).toBeDefined()

    expect(longBlock!.width).toBeGreaterThan(shortBlock!.width)
  })

  it('should assign minimum height to all blocks', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
      ],
      connections: [],
    }

    const layout = computeLayout(diagram)

    for (const block of layout.blocks) {
      expect(block.height).toBeGreaterThanOrEqual(40)
    }
  })

  it('should handle a single block', () => {
    const diagram: Diagram = {
      blocks: [{ id: 'A', label: 'A', type: 'component' }],
      connections: [],
    }

    const layout = computeLayout(diagram)

    expect(layout.blocks).toHaveLength(1)
    expect(layout.blocks[0]!.x).toBeGreaterThanOrEqual(0)
    expect(layout.blocks[0]!.y).toBeGreaterThanOrEqual(0)
  })

  it('should handle empty diagram', () => {
    const diagram: Diagram = { blocks: [], connections: [] }

    const layout = computeLayout(diagram)

    expect(layout.blocks).toHaveLength(0)
    expect(layout.connections).toHaveLength(0)
  })

  // ── Edge Cases ──────────────────────────────────────────────

  it('should handle many blocks without overlap', () => {
    const blocks = Array.from({ length: 12 }, (_, i) => ({
      id: `Block${i}`,
      label: `Block ${i}`,
      type: 'component' as const,
    }))
    const diagram: Diagram = { blocks, connections: [] }

    const layout = computeLayout(diagram)

    expect(layout.blocks).toHaveLength(12)
    for (let i = 0; i < layout.blocks.length; i++) {
      for (let j = i + 1; j < layout.blocks.length; j++) {
        expect(rectsOverlap(layout.blocks[i]!, layout.blocks[j]!)).toBe(false)
      }
    }
  })

  it('should assign positive coordinates to all blocks', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
        { id: 'C', label: 'C', type: 'component' },
      ],
      connections: [
        { fromId: 'A', toId: 'B', arrowType: '-->' },
        { fromId: 'A', toId: 'C', arrowType: '-->' },
      ],
    }

    const layout = computeLayout(diagram)

    for (const block of layout.blocks) {
      expect(block.x).toBeGreaterThanOrEqual(0)
      expect(block.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('should align blocks in the same column to the same x-coordinate', () => {
    // With COLUMNS=4, blocks at indices 0 and 4 are both in column 0
    const blocks = Array.from({ length: 5 }, (_, i) => ({
      id: `B${i}`,
      label: i === 0 ? 'A Very Wide Block Name' : 'X',
      type: 'component' as const,
    }))
    const diagram: Diagram = { blocks, connections: [] }

    const layout = computeLayout(diagram)
    const b0 = layout.blocks[0]
    const b4 = layout.blocks[4]
    expect(b0).toBeDefined()
    expect(b4).toBeDefined()
    expect(b0!.x).toBe(b4!.x)
  })

  it('should push subsequent columns right based on widest block in prior column', () => {
    // Block 0 (col 0) is wide; block 1 (col 1) should start after col 0's width + gap
    const diagram: Diagram = {
      blocks: [
        { id: 'Wide', label: 'A Very Very Long Block Label', type: 'component' },
        { id: 'Short', label: 'X', type: 'component' },
      ],
      connections: [],
    }

    const layout = computeLayout(diagram)
    const wide = layout.blocks.find((b) => b.id === 'Wide')
    const short = layout.blocks.find((b) => b.id === 'Short')
    expect(wide).toBeDefined()
    expect(short).toBeDefined()
    // The short block's x should be greater than the wide block's x + width
    expect(short!.x).toBeGreaterThan(wide!.x + wide!.width)
  })
})
