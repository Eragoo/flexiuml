import { describe, it, expect } from 'vitest'
import {
  createEmptyLayout,
  computeMermaidHash,
  serializeLayout,
  deserializeLayout,
  updateNodePosition,
  updateNodePositions,
  updateContainerGeometry,
  setNodeParent,
} from '../layout-map'
import type { LayoutMap } from '../layout-map'

describe('layout-map', () => {
  // ----- createEmptyLayout -----

  describe('createEmptyLayout', () => {
    it('creates a layout with version 1', () => {
      const layout = createEmptyLayout()
      expect(layout.version).toBe(1)
    })

    it('creates a layout with empty nodes and containers', () => {
      const layout = createEmptyLayout()
      expect(layout.nodes).toEqual({})
      expect(layout.containers).toEqual({})
    })

    it('returns a new object each time', () => {
      const a = createEmptyLayout()
      const b = createEmptyLayout()
      expect(a).not.toBe(b)
      expect(a.nodes).not.toBe(b.nodes)
    })
  })

  // ----- computeMermaidHash -----

  describe('computeMermaidHash', () => {
    it('returns a string for any input', () => {
      const hash = computeMermaidHash('graph LR; A-->B')
      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    })

    it('returns the same hash for the same input', () => {
      const a = computeMermaidHash('graph LR; A-->B')
      const b = computeMermaidHash('graph LR; A-->B')
      expect(a).toBe(b)
    })

    it('returns different hashes for different inputs', () => {
      const a = computeMermaidHash('graph LR; A-->B')
      const b = computeMermaidHash('graph TD; X-->Y')
      expect(a).not.toBe(b)
    })

    it('returns a hash for empty string', () => {
      const hash = computeMermaidHash('')
      expect(typeof hash).toBe('string')
    })
  })

  // ----- serializeLayout / deserializeLayout -----

  describe('serializeLayout', () => {
    it('serializes an empty layout to valid JSON', () => {
      const layout = createEmptyLayout()
      const json = serializeLayout(layout)
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('round-trips through serialize/deserialize', () => {
      const layout = createEmptyLayout()
      const json = serializeLayout(layout)
      const result = deserializeLayout(json)
      expect(result.version).toBe(layout.version)
      expect(result.nodes).toEqual(layout.nodes)
      expect(result.containers).toEqual(layout.containers)
    })

    it('preserves node positions through round-trip', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 100, 200)
      const json = serializeLayout(layout)
      const result = deserializeLayout(json)
      expect(result.nodes['A']).toEqual({ x: 100, y: 200 })
    })
  })

  describe('deserializeLayout', () => {
    it('throws on invalid JSON', () => {
      expect(() => deserializeLayout('not json')).toThrow()
    })

    it('throws when missing required fields', () => {
      expect(() => deserializeLayout('{}')).toThrow('missing required fields')
    })

    it('throws when version is not a number', () => {
      const json = JSON.stringify({ version: 'abc', nodes: {}, containers: {} })
      expect(() => deserializeLayout(json)).toThrow('version must be a number')
    })

    it('throws on null input', () => {
      expect(() => deserializeLayout('null')).toThrow()
    })

    it('throws on array input', () => {
      expect(() => deserializeLayout('[]')).toThrow()
    })
  })

  // ----- updateNodePosition -----

  describe('updateNodePosition', () => {
    it('adds a new node position', () => {
      const layout = createEmptyLayout()
      const result = updateNodePosition(layout, 'A', 50, 75)
      expect(result.nodes['A']).toEqual({ x: 50, y: 75 })
    })

    it('updates an existing node position', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      const result = updateNodePosition(layout, 'A', 100, 200)
      expect(result.nodes['A']!.x).toBe(100)
      expect(result.nodes['A']!.y).toBe(200)
    })

    it('does not mutate the original layout', () => {
      const layout = createEmptyLayout()
      updateNodePosition(layout, 'A', 50, 75)
      expect(layout.nodes['A']).toBeUndefined()
    })

    it('preserves other nodes', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      const result = updateNodePosition(layout, 'B', 30, 40)
      expect(result.nodes['A']).toEqual({ x: 10, y: 20 })
      expect(result.nodes['B']).toEqual({ x: 30, y: 40 })
    })

    it('preserves parentId and locked when updating position', () => {
      let layout = createEmptyLayout()
      layout = {
        ...layout,
        nodes: { ...layout.nodes, A: { x: 0, y: 0, parentId: 'container1', locked: true } },
      }
      const result = updateNodePosition(layout, 'A', 100, 200)
      expect(result.nodes['A']!.x).toBe(100)
      expect(result.nodes['A']!.y).toBe(200)
      expect(result.nodes['A']!.parentId).toBe('container1')
      expect(result.nodes['A']!.locked).toBe(true)
    })
  })

  // ----- updateNodePositions (batch) -----

  describe('updateNodePositions', () => {
    it('updates multiple nodes at once', () => {
      const layout = createEmptyLayout()
      const updates = new Map([
        ['A', { x: 10, y: 20 }],
        ['B', { x: 30, y: 40 }],
      ])
      const result = updateNodePositions(layout, updates)
      expect(result.nodes['A']).toEqual({ x: 10, y: 20 })
      expect(result.nodes['B']).toEqual({ x: 30, y: 40 })
    })

    it('does not mutate the original layout', () => {
      const layout = createEmptyLayout()
      const updates = new Map([['A', { x: 10, y: 20 }]])
      updateNodePositions(layout, updates)
      expect(layout.nodes['A']).toBeUndefined()
    })

    it('preserves existing nodes not in the update', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'C', 99, 99)
      const updates = new Map([['A', { x: 10, y: 20 }]])
      const result = updateNodePositions(layout, updates)
      expect(result.nodes['C']).toEqual({ x: 99, y: 99 })
      expect(result.nodes['A']).toEqual({ x: 10, y: 20 })
    })

    it('handles empty updates map', () => {
      const layout = createEmptyLayout()
      const result = updateNodePositions(layout, new Map())
      expect(result.nodes).toEqual({})
    })
  })

  // ----- updateContainerGeometry -----

  describe('updateContainerGeometry', () => {
    it('creates a container entry with defaults for missing fields', () => {
      const layout = createEmptyLayout()
      const result = updateContainerGeometry(layout, 'C1', { x: 10, y: 20 })
      expect(result.containers['C1']!.x).toBe(10)
      expect(result.containers['C1']!.y).toBe(20)
      expect(result.containers['C1']!.width).toBe(0)
      expect(result.containers['C1']!.height).toBe(0)
      expect(result.containers['C1']!.mode).toBe('fit')
    })

    it('updates partial geometry', () => {
      let layout = createEmptyLayout()
      layout = updateContainerGeometry(layout, 'C1', { x: 0, y: 0, width: 100, height: 50, mode: 'fit' })
      const result = updateContainerGeometry(layout, 'C1', { width: 200 })
      expect(result.containers['C1']!.width).toBe(200)
      expect(result.containers['C1']!.height).toBe(50)
    })

    it('does not mutate the original layout', () => {
      const layout = createEmptyLayout()
      updateContainerGeometry(layout, 'C1', { x: 10, y: 20 })
      expect(layout.containers['C1']).toBeUndefined()
    })
  })

  // ----- setNodeParent -----

  describe('setNodeParent', () => {
    it('sets parentId on an existing node', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      const result = setNodeParent(layout, 'A', 'container1')
      expect(result.nodes['A']!.parentId).toBe('container1')
    })

    it('removes parentId when set to null', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      layout = setNodeParent(layout, 'A', 'container1')
      const result = setNodeParent(layout, 'A', null)
      expect(result.nodes['A']!.parentId).toBeUndefined()
    })

    it('returns unchanged layout if node does not exist', () => {
      const layout = createEmptyLayout()
      const result = setNodeParent(layout, 'MISSING', 'container1')
      expect(result).toBe(layout)
    })

    it('does not mutate the original layout', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 10, 20)
      setNodeParent(layout, 'A', 'container1')
      expect(layout.nodes['A']!.parentId).toBeUndefined()
    })

    it('preserves position when setting parent', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 100, 200)
      const result = setNodeParent(layout, 'A', 'container1')
      expect(result.nodes['A']!.x).toBe(100)
      expect(result.nodes['A']!.y).toBe(200)
    })
  })
})
