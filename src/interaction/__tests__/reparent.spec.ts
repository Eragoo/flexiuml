import { describe, it, expect, vi } from 'vitest'

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

import { reparentNode } from '../reparent'
import { createEmptyLayout, updateNodePosition, setNodeParent } from '../../core/layout-map'

describe('reparent', () => {
  // ----- reparentNode -----

  describe('reparentNode', () => {
    it('sets parent on a node', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)

      const result = reparentNode('A', 'C1', layout)
      expect(result.nodes['A']!.parentId).toBe('C1')
    })

    it('removes parent when set to null', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      layout = setNodeParent(layout, 'A', 'C1')

      const result = reparentNode('A', null, layout)
      expect(result.nodes['A']!.parentId).toBeUndefined()
    })

    it('does not mutate original layout', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      reparentNode('A', 'C1', layout)
      expect(layout.nodes['A']!.parentId).toBeUndefined()
    })

    it('returns unchanged layout if node does not exist', () => {
      const layout = createEmptyLayout()
      const result = reparentNode('MISSING', 'C1', layout)
      expect(result).toBe(layout)
    })

    it('preserves node position when reparenting', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 100, 200)

      const result = reparentNode('A', 'C1', layout)
      expect(result.nodes['A']!.x).toBe(100)
      expect(result.nodes['A']!.y).toBe(200)
    })

    it('can change parent from one container to another', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      layout = setNodeParent(layout, 'A', 'C1')

      const result = reparentNode('A', 'C2', layout)
      expect(result.nodes['A']!.parentId).toBe('C2')
    })
  })
})
