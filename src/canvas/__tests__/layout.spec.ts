import { describe, it, expect } from 'vitest'
import { computeLayout } from '../layout'
import type { Diagram } from '../../core/types'
import { parsePlantUml } from '../../core/parser'

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

  // ── Pseudo-state [*] layout ─────────────────────────────────

  it('should place pseudo-state start nodes above their targets', () => {
    const diagram: Diagram = {
      blocks: [
        { id: '__start_1', label: '[*]', type: 'pseudostate' },
        { id: 'Idle', label: 'Idle', type: 'component' },
      ],
      connections: [{ fromId: '__start_1', toId: 'Idle', arrowType: '-->' }],
    }

    const layout = computeLayout(diagram)
    const start = layout.blocks.find((b) => b.id === '__start_1')!
    const idle = layout.blocks.find((b) => b.id === 'Idle')!

    expect(start.y).toBeLessThan(idle.y)
    // Pseudo-state should have small dimensions
    expect(start.width).toBeLessThanOrEqual(30)
    expect(start.height).toBeLessThanOrEqual(30)
  })

  it('should place pseudo-state end nodes below their sources', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'Success', label: 'Success', type: 'component' },
        { id: '__end_1', label: '[*]', type: 'pseudostate' },
      ],
      connections: [{ fromId: 'Success', toId: '__end_1', arrowType: '-->' }],
    }

    const layout = computeLayout(diagram)
    const success = layout.blocks.find((b) => b.id === 'Success')!
    const end = layout.blocks.find((b) => b.id === '__end_1')!

    expect(success.y).toBeLessThan(end.y)
  })

  // ── Composite state layout ──────────────────────────────────

  it('should lay out composite state children inside the parent', () => {
    const diagram: Diagram = {
      blocks: [
        {
          id: 'Processing',
          label: 'Processing',
          type: 'state',
          children: [
            { id: '__start_1', label: '[*]', type: 'pseudostate' },
            { id: 'Validating', label: 'Validating', type: 'component' },
            { id: 'Executing', label: 'Executing', type: 'component' },
            { id: '__end_1', label: '[*]', type: 'pseudostate' },
          ],
          childConnections: [
            { fromId: '__start_1', toId: 'Validating', arrowType: '-->' },
            { fromId: 'Validating', toId: 'Executing', arrowType: '-->' },
            { fromId: 'Executing', toId: '__end_1', arrowType: '-->' },
          ],
        },
      ],
      connections: [],
    }

    const layout = computeLayout(diagram)
    const processing = layout.blocks.find((b) => b.id === 'Processing')!

    expect(processing).toBeDefined()
    // Composite state should be large enough to contain children
    expect(processing.width).toBeGreaterThan(100)
    expect(processing.height).toBeGreaterThan(100)

    // Children should be laid out
    expect(processing.children).toBeDefined()
    expect(processing.children!.length).toBe(4)

    // All children should be inside the parent bounds
    for (const child of processing.children!) {
      expect(child.x).toBeGreaterThanOrEqual(processing.x)
      expect(child.y).toBeGreaterThanOrEqual(processing.y)
      expect(child.x + child.width).toBeLessThanOrEqual(processing.x + processing.width)
      expect(child.y + child.height).toBeLessThanOrEqual(processing.y + processing.height)
    }
  })

  it('should size composite state based on its children', () => {
    const diagram: Diagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component' },
        {
          id: 'Composite',
          label: 'Composite',
          type: 'state',
          children: [
            { id: 'X', label: 'X', type: 'component' },
            { id: 'Y', label: 'Y', type: 'component' },
          ],
          childConnections: [{ fromId: 'X', toId: 'Y', arrowType: '-->' }],
        },
      ],
      connections: [{ fromId: 'A', toId: 'Composite', arrowType: '-->' }],
    }

    const layout = computeLayout(diagram)
    const composite = layout.blocks.find((b) => b.id === 'Composite')!
    const a = layout.blocks.find((b) => b.id === 'A')!

    // Composite should be below A
    expect(a.y).toBeLessThan(composite.y)
    // Composite should be larger than a normal block
    expect(composite.height).toBeGreaterThan(a.height)
  })

  // ── Integration: full state diagram ─────────────────────────

  it('should produce a multi-layer layout for a real state diagram (parse + layout)', () => {
    const input = `@startuml

[*] --> Idle

Idle --> Processing : start
Processing --> Success : done
Processing --> Error : fail

state Processing {
    [*] --> Validating
    Validating --> Executing
    Executing --> [*]
}

Success --> [*]
Error --> Idle : retry

@enduml`

    const diagram = parsePlantUml(input)
    const layout = computeLayout(diagram)

    // Should have multiple layers (not all on one line)
    const yValues = [...new Set(layout.blocks.map((b) => b.y))]
    expect(yValues.length).toBeGreaterThanOrEqual(3)

    // Start pseudo-state should be above Idle
    const startBlock = layout.blocks.find((b) => b.type === 'pseudostate' && b.id.includes('start'))!
    const idle = layout.blocks.find((b) => b.id === 'Idle')!
    expect(startBlock).toBeDefined()
    expect(idle).toBeDefined()
    expect(startBlock.y).toBeLessThan(idle.y)

    // Processing (composite) should be below Idle
    const processing = layout.blocks.find((b) => b.id === 'Processing')!
    expect(processing).toBeDefined()
    expect(idle.y).toBeLessThan(processing.y)

    // Processing should have inner children laid out
    expect(processing.children).toBeDefined()
    expect(processing.children!.length).toBeGreaterThanOrEqual(2)

    // Success and Error should be siblings (same layer, below Processing)
    const success = layout.blocks.find((b) => b.id === 'Success')!
    const error = layout.blocks.find((b) => b.id === 'Error')!
    expect(success).toBeDefined()
    expect(error).toBeDefined()
    expect(success.y).toBe(error.y)
    expect(processing.y).toBeLessThan(success.y)

    // No blocks should overlap
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
})
