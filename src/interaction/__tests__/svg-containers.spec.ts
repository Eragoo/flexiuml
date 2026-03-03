import { describe, it, expect, vi } from 'vitest'

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

import { getContainerChildren, computeContainerFit } from '../svg-containers'
import { createEmptyLayout, updateNodePosition, setNodeParent, updateContainerGeometry } from '../../core/layout-map'
import type { LayoutMap } from '../../core/layout-map'
import type { DiagramIndex, IndexedElement } from '../../core/index-diagram'

const SVG_NS = 'http://www.w3.org/2000/svg'

function makeIndexedElement(id: string, x = 0, y = 0, width = 100, height = 50): IndexedElement {
  const el = document.createElementNS(SVG_NS, 'g') as SVGGElement
  el.setAttribute('data-id', id)
  Object.defineProperty(el, 'getBBox', {
    value: () => ({ x, y, width, height }),
    configurable: true,
  })
  return { id, el, bbox: { x, y, width, height } }
}

function makeDiagramIndex(
  nodes: Array<{ id: string; x?: number; y?: number; width?: number; height?: number }>,
  containers: Array<{ id: string; x?: number; y?: number; width?: number; height?: number }> = [],
): DiagramIndex {
  const nodeMap = new Map<string, IndexedElement>()
  for (const n of nodes) {
    nodeMap.set(n.id, makeIndexedElement(n.id, n.x, n.y, n.width, n.height))
  }
  const containerMap = new Map<string, IndexedElement>()
  for (const c of containers) {
    containerMap.set(c.id, makeIndexedElement(c.id, c.x, c.y, c.width, c.height))
  }
  return { nodes: nodeMap, containers: containerMap }
}

describe('svg-containers', () => {
  // ----- getContainerChildren -----

  describe('getContainerChildren', () => {
    it('returns nodes that have the given containerId as parentId', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      layout = setNodeParent(layout, 'A', 'C1')
      layout = updateNodePosition(layout, 'B', 30, 40)
      layout = setNodeParent(layout, 'B', 'C1')
      layout = updateNodePosition(layout, 'C', 50, 60)
      // C has no parent

      const children = getContainerChildren('C1', layout)
      expect(children).toContain('A')
      expect(children).toContain('B')
      expect(children).not.toContain('C')
      expect(children.length).toBe(2)
    })

    it('returns empty array when no children', () => {
      const layout = createEmptyLayout()
      const children = getContainerChildren('C1', layout)
      expect(children).toEqual([])
    })

    it('does not include nodes parented to a different container', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      layout = setNodeParent(layout, 'A', 'C2')

      const children = getContainerChildren('C1', layout)
      expect(children).not.toContain('A')
    })
  })

  // ----- computeContainerFit -----

  describe('computeContainerFit', () => {
    it('returns null when container has no children', () => {
      const layout = createEmptyLayout()
      const index = makeDiagramIndex([{ id: 'A' }])
      const result = computeContainerFit('C1', layout, index)
      expect(result).toBeNull()
    })

    it('computes bounding box around children with padding', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      layout = setNodeParent(layout, 'A', 'C1')

      // Node A: bbox at (0,0) 100x50, no translate
      const index = makeDiagramIndex([{ id: 'A', x: 0, y: 0, width: 100, height: 50 }])

      const result = computeContainerFit('C1', layout, index, 10)
      expect(result).not.toBeNull()
      // minX=0, minY=0, maxX=100, maxY=50
      // result: x=0-10=-10, y=0-10=-10, width=100+20=120, height=50+20=70
      expect(result!.x).toBe(-10)
      expect(result!.y).toBe(-10)
      expect(result!.width).toBe(120)
      expect(result!.height).toBe(70)
    })

    it('returns null when children are not in diagram index', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      layout = setNodeParent(layout, 'A', 'C1')

      // Index doesn't contain node A
      const index = makeDiagramIndex([])
      const result = computeContainerFit('C1', layout, index)
      expect(result).toBeNull()
    })
  })
})
