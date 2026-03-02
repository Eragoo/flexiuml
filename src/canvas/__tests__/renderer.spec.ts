import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderDiagram } from '../renderer'
import type { LayoutDiagram } from '../../core/types'

function createMockContext(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D
}

describe('renderDiagram', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = createMockContext()
  })

  // ── Happy Path ──────────────────────────────────────────────

  it('should call fillRect for each block', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
        { id: 'B', label: 'B', type: 'component', x: 200, y: 10, width: 100, height: 50 },
      ],
      connections: [],
    }

    renderDiagram(ctx, diagram, 800, 600)

    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 10, 100, 50)
    expect(ctx.fillRect).toHaveBeenCalledWith(200, 10, 100, 50)
  })

  it('should call fillText for each block label', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'Alpha', type: 'component', x: 10, y: 10, width: 100, height: 50 },
        { id: 'B', label: 'Beta', type: 'component', x: 200, y: 10, width: 100, height: 50 },
      ],
      connections: [],
    }

    renderDiagram(ctx, diagram, 800, 600)

    expect(ctx.fillText).toHaveBeenCalledTimes(2)
    expect(ctx.fillText).toHaveBeenCalledWith('Alpha', expect.any(Number), expect.any(Number))
    expect(ctx.fillText).toHaveBeenCalledWith('Beta', expect.any(Number), expect.any(Number))
  })

  it('should call beginPath/moveTo/lineTo for each connection', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
        { id: 'B', label: 'B', type: 'component', x: 300, y: 10, width: 100, height: 50 },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '-->' }],
    }

    renderDiagram(ctx, diagram, 800, 600)

    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalled()
    expect(ctx.lineTo).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should draw arrowhead for directional arrows (-->)', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
        { id: 'B', label: 'B', type: 'component', x: 300, y: 10, width: 100, height: 50 },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '-->' }],
    }

    renderDiagram(ctx, diagram, 800, 600)

    // Arrowhead requires save/restore + fill for the triangle
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('should not draw arrowhead for plain lines (--)', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
        { id: 'B', label: 'B', type: 'component', x: 300, y: 10, width: 100, height: 50 },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '--' }],
    }

    renderDiagram(ctx, diagram, 800, 600)

    // Line is drawn but no arrowhead fill
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('should render connection label when present', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
        { id: 'B', label: 'B', type: 'component', x: 300, y: 10, width: 100, height: 50 },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '-->', label: 'uses' }],
    }

    renderDiagram(ctx, diagram, 800, 600)

    expect(ctx.fillText).toHaveBeenCalledWith('uses', expect.any(Number), expect.any(Number))
  })

  it('should not render label text for connections without label', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
        { id: 'B', label: 'B', type: 'component', x: 300, y: 10, width: 100, height: 50 },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '-->' }],
    }

    renderDiagram(ctx, diagram, 800, 600)

    // fillText should be called for block labels only (2 blocks)
    expect(ctx.fillText).toHaveBeenCalledTimes(2)
  })

  it('should use dashed lines for dotted arrow types', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
        { id: 'B', label: 'B', type: 'component', x: 300, y: 10, width: 100, height: 50 },
      ],
      connections: [{ fromId: 'A', toId: 'B', arrowType: '..>' }],
    }

    renderDiagram(ctx, diagram, 800, 600)

    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 4])
  })

  // ── Edge Cases ──────────────────────────────────────────────

  it('should skip connections referencing non-existent blocks', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
      ],
      connections: [{ fromId: 'A', toId: 'GHOST', arrowType: '-->' }],
    }

    expect(() => renderDiagram(ctx, diagram, 800, 600)).not.toThrow()
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })

  it('should handle empty diagram without errors', () => {
    const diagram: LayoutDiagram = { blocks: [], connections: [] }

    expect(() => renderDiagram(ctx, diagram, 800, 600)).not.toThrow()

    // Only clearRect should be called
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('should call clearRect before drawing', () => {
    const diagram: LayoutDiagram = {
      blocks: [
        { id: 'A', label: 'A', type: 'component', x: 10, y: 10, width: 100, height: 50 },
      ],
      connections: [],
    }

    renderDiagram(ctx, diagram, 800, 600)

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600)

    // clearRect must be called before fillRect
    const clearOrder = (ctx.clearRect as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!
    const fillOrder = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!
    expect(clearOrder).toBeLessThan(fillOrder)
  })
})
