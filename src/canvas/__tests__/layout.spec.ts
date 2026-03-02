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

  it('should place target blocks below source blocks in a chain', () => {
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
    const a = layout.blocks.find((b) => b.id === 'A')!
    const b = layout.blocks.find((b) => b.id === 'B')!
    const c = layout.blocks.find((b) => b.id === 'C')!

    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(c.y)
  })

  it('should place siblings side-by-side on the same row', () => {
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
    const b = layout.blocks.find((b) => b.id === 'B')!
    const c = layout.blocks.find((b) => b.id === 'C')!

    // B and C should be on the same row (same y)
    expect(b.y).toBe(c.y)
    // but different x
    expect(b.x).not.toBe(c.x)
  })

  it('should place disconnected blocks on the top layer', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
        { id: 'Lone', label: 'Lone', type: 'component' },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '-->' }],
    }

    const layout = computeLayout(diagram)
    const a = layout.blocks.find((b) => b.id === 'A')!
    const lone = layout.blocks.find((b) => b.id === 'Lone')!

    // Lone node should be at the same y-level as the root
    expect(lone.y).toBe(a.y)
  })

  it('should handle diamond-shaped dependencies', () => {
    // A -> B, A -> C, B -> D, C -> D
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
        { id: 'C', label: 'C', type: 'component' },
        { id: 'D', label: 'D', type: 'component' },
      ],
      connections: [
        { fromId: 'A', toId: 'B', arrowType: '-->' },
        { fromId: 'A', toId: 'C', arrowType: '-->' },
        { fromId: 'B', toId: 'D', arrowType: '-->' },
        { fromId: 'C', toId: 'D', arrowType: '-->' },
      ],
    }

    const layout = computeLayout(diagram)
    const a = layout.blocks.find((b) => b.id === 'A')!
    const b = layout.blocks.find((b) => b.id === 'B')!
    const c = layout.blocks.find((b) => b.id === 'C')!
    const d = layout.blocks.find((b) => b.id === 'D')!

    // A on top, B and C in the middle, D on the bottom
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBe(c.y)
    expect(b.y).toBeLessThan(d.y)
  })

  it('should reverse layout direction for <-- arrows', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '<--' }],
    }

    const layout = computeLayout(diagram)
    const a = layout.blocks.find((b) => b.id === 'A')!
    const b = layout.blocks.find((b) => b.id === 'B')!

    // B is the actual source (arrow reversed), so B should be above A
    expect(b.y).toBeLessThan(a.y)
  })

  it('should handle cyclic dependencies without hanging', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
        { id: 'C', label: 'C', type: 'component' },
      ],
      connections: [
        { fromId: 'A', toId: 'B', arrowType: '-->' },
        { fromId: 'B', toId: 'C', arrowType: '-->' },
        { fromId: 'C', toId: 'A', arrowType: '-->' },
      ],
    }

    const layout = computeLayout(diagram)
    expect(layout.blocks).toHaveLength(3)
    // All blocks should have valid positive coordinates
    for (const block of layout.blocks) {
      expect(block.x).toBeGreaterThanOrEqual(0)
      expect(block.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('should treat dashed forward arrows (..>) like --> for layout', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '..>' }],
    }

    const layout = computeLayout(diagram)
    const a = layout.blocks.find((b) => b.id === 'A')!
    const b = layout.blocks.find((b) => b.id === 'B')!

    expect(a.y).toBeLessThan(b.y)
  })
})
