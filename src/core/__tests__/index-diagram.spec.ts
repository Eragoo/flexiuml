import { describe, it, expect, vi } from 'vitest'

// Mock mermaid since index-diagram imports from mermaid-config which imports mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

import { indexDiagramElements, refreshBBoxes } from '../index-diagram'
import type { DiagramIndex } from '../index-diagram'

const SVG_NS = 'http://www.w3.org/2000/svg'

function makeDiagramContent(nodes: string[], containers: string[] = []): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement
  g.classList.add('diagramContent')

  for (const id of nodes) {
    const nodeG = document.createElementNS(SVG_NS, 'g')
    nodeG.setAttribute('class', 'node')
    nodeG.setAttribute('data-id', id)
    Object.defineProperty(nodeG, 'getBBox', {
      value: () => ({ x: 0, y: 0, width: 100, height: 50 }),
      configurable: true,
    })
    g.appendChild(nodeG)
  }

  for (const id of containers) {
    const containerG = document.createElementNS(SVG_NS, 'g')
    containerG.setAttribute('class', 'cluster')
    containerG.setAttribute('data-id', id)
    Object.defineProperty(containerG, 'getBBox', {
      value: () => ({ x: 0, y: 0, width: 300, height: 200 }),
      configurable: true,
    })
    g.appendChild(containerG)
  }

  return g
}

describe('index-diagram', () => {
  // ----- indexDiagramElements -----

  describe('indexDiagramElements', () => {
    it('indexes nodes with data-id attributes', () => {
      const content = makeDiagramContent(['A', 'B', 'C'])
      const index = indexDiagramElements(content)
      expect(index.nodes.size).toBe(3)
      expect(index.nodes.has('A')).toBe(true)
      expect(index.nodes.has('B')).toBe(true)
      expect(index.nodes.has('C')).toBe(true)
    })

    it('returns IndexedElement with el reference and bbox', () => {
      const content = makeDiagramContent(['A'])
      const index = indexDiagramElements(content)
      const entry = index.nodes.get('A')!
      expect(entry.id).toBe('A')
      expect(entry.el).toBeInstanceOf(SVGGElement)
      expect(entry.bbox).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    })

    it('indexes containers separately from nodes', () => {
      const content = makeDiagramContent(['A'], ['subgraph1'])
      const index = indexDiagramElements(content)
      expect(index.nodes.has('A')).toBe(true)
      expect(index.containers.has('subgraph1')).toBe(true)
    })

    it('returns empty maps when no elements exist', () => {
      const content = makeDiagramContent([])
      const index = indexDiagramElements(content)
      expect(index.nodes.size).toBe(0)
      expect(index.containers.size).toBe(0)
    })

    it('skips duplicate node IDs', () => {
      const content = makeDiagramContent(['A'])
      // Manually add a duplicate
      const dup = document.createElementNS(SVG_NS, 'g')
      dup.setAttribute('class', 'node')
      dup.setAttribute('data-id', 'A')
      Object.defineProperty(dup, 'getBBox', {
        value: () => ({ x: 0, y: 0, width: 50, height: 25 }),
        configurable: true,
      })
      content.appendChild(dup)

      const index = indexDiagramElements(content)
      // First one wins
      expect(index.nodes.size).toBe(1)
      expect(index.nodes.get('A')!.bbox.width).toBe(100)
    })
  })

  // ----- refreshBBoxes -----

  describe('refreshBBoxes', () => {
    it('updates bbox values from current DOM state', () => {
      const content = makeDiagramContent(['A'])
      const index = indexDiagramElements(content)
      expect(index.nodes.get('A')!.bbox.width).toBe(100)

      // Change the getBBox return value (simulating DOM changes)
      Object.defineProperty(index.nodes.get('A')!.el, 'getBBox', {
        value: () => ({ x: 5, y: 10, width: 200, height: 100 }),
        configurable: true,
      })

      refreshBBoxes(index)
      expect(index.nodes.get('A')!.bbox.width).toBe(200)
      expect(index.nodes.get('A')!.bbox.x).toBe(5)
    })

    it('handles empty index without error', () => {
      const index: DiagramIndex = { nodes: new Map(), containers: new Map() }
      expect(() => refreshBBoxes(index)).not.toThrow()
    })
  })
})
