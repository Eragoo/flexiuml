import { describe, it, expect, vi } from 'vitest'

// Mock mermaid since svg-select imports from mermaid-config which imports mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

import {
  toggleNodeSelect,
  toggleContainerSelect,
  clearSelection,
  allSelectedIds,
  clearSelectionOverlays,
  renderSelectionOverlays,
} from '../svg-select'
import type { SelectionState } from '../../core/types'
import type { DiagramIndex, IndexedElement } from '../../core/index-diagram'

// Helpers

const SVG_NS = 'http://www.w3.org/2000/svg'

const empty: SelectionState = { selectedNodeIds: new Set(), selectedContainerIds: new Set() }

function makeSelection(nodeIds: string[] = [], containerIds: string[] = []): SelectionState {
  return { selectedNodeIds: new Set(nodeIds), selectedContainerIds: new Set(containerIds) }
}

function makeInteractionLayer(): SVGGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  const g = document.createElementNS(SVG_NS, 'g')
  g.setAttribute('class', 'interactionLayer')
  svg.appendChild(g)
  document.body.appendChild(svg)
  return g
}

function makeIndexedElement(id: string): IndexedElement {
  const el = document.createElementNS(SVG_NS, 'g') as SVGGElement
  el.setAttribute('data-id', id)
  // jsdom doesn't compute getBBox, so we stub it
  Object.defineProperty(el, 'getBBox', {
    value: () => ({ x: 10, y: 20, width: 100, height: 50 }),
    configurable: true,
  })
  return { id, el, bbox: { x: 10, y: 20, width: 100, height: 50 } }
}

function makeDiagramIndex(nodeIds: string[], containerIds: string[] = []): DiagramIndex {
  const nodes = new Map<string, IndexedElement>()
  for (const id of nodeIds) {
    nodes.set(id, makeIndexedElement(id))
  }
  const containers = new Map<string, IndexedElement>()
  for (const id of containerIds) {
    containers.set(id, makeIndexedElement(id))
  }
  return { nodes, containers }
}

describe('svg-select', () => {
  // ----- toggleNodeSelect -----

  describe('toggleNodeSelect', () => {
    // Happy Path – single select mode (multi = false)
    it('selects a node when nothing is selected', () => {
      const result = toggleNodeSelect(empty, 'A', false)
      expect(result.selectedNodeIds.has('A')).toBe(true)
      expect(result.selectedNodeIds.size).toBe(1)
    })

    it('replaces selection with new node in single mode', () => {
      const state = makeSelection(['A'])
      const result = toggleNodeSelect(state, 'B', false)
      expect(result.selectedNodeIds.has('B')).toBe(true)
      expect(result.selectedNodeIds.has('A')).toBe(false)
      expect(result.selectedNodeIds.size).toBe(1)
    })

    it('deselects the only selected node when clicked again in single mode', () => {
      const state = makeSelection(['A'])
      const result = toggleNodeSelect(state, 'A', false)
      expect(result.selectedNodeIds.size).toBe(0)
    })

    // Happy Path – multi select mode (multi = true)
    it('adds a node to selection in multi mode', () => {
      const state = makeSelection(['A'])
      const result = toggleNodeSelect(state, 'B', true)
      expect(result.selectedNodeIds.has('A')).toBe(true)
      expect(result.selectedNodeIds.has('B')).toBe(true)
      expect(result.selectedNodeIds.size).toBe(2)
    })

    it('removes a node from selection in multi mode if already selected', () => {
      const state = makeSelection(['A', 'B'])
      const result = toggleNodeSelect(state, 'A', true)
      expect(result.selectedNodeIds.has('A')).toBe(false)
      expect(result.selectedNodeIds.has('B')).toBe(true)
      expect(result.selectedNodeIds.size).toBe(1)
    })

    // Edge Cases
    it('does not mutate the original state', () => {
      const state = makeSelection(['A'])
      const originalIds = new Set(state.selectedNodeIds)
      toggleNodeSelect(state, 'B', true)
      expect(state.selectedNodeIds).toEqual(originalIds)
    })

    it('single-mode with multiple already selected replaces all', () => {
      const state = makeSelection(['A', 'B', 'C'])
      const result = toggleNodeSelect(state, 'D', false)
      expect(result.selectedNodeIds.size).toBe(1)
      expect(result.selectedNodeIds.has('D')).toBe(true)
    })

    it('single-mode clears container selection', () => {
      const state = makeSelection(['A'], ['container1'])
      const result = toggleNodeSelect(state, 'B', false)
      expect(result.selectedContainerIds.size).toBe(0)
      expect(result.selectedNodeIds.has('B')).toBe(true)
    })

    it('multi-mode preserves container selection', () => {
      const state = makeSelection(['A'], ['container1'])
      const result = toggleNodeSelect(state, 'B', true)
      expect(result.selectedContainerIds.has('container1')).toBe(true)
      expect(result.selectedNodeIds.has('A')).toBe(true)
      expect(result.selectedNodeIds.has('B')).toBe(true)
    })
  })

  // ----- toggleContainerSelect -----

  describe('toggleContainerSelect', () => {
    it('selects a container when nothing is selected', () => {
      const result = toggleContainerSelect(empty, 'C1', false)
      expect(result.selectedContainerIds.has('C1')).toBe(true)
      expect(result.selectedContainerIds.size).toBe(1)
    })

    it('replaces selection with new container in single mode', () => {
      const state = makeSelection([], ['C1'])
      const result = toggleContainerSelect(state, 'C2', false)
      expect(result.selectedContainerIds.has('C2')).toBe(true)
      expect(result.selectedContainerIds.has('C1')).toBe(false)
    })

    it('deselects the only selected container when clicked again in single mode', () => {
      const state = makeSelection([], ['C1'])
      const result = toggleContainerSelect(state, 'C1', false)
      expect(result.selectedContainerIds.size).toBe(0)
    })

    it('adds container in multi mode', () => {
      const state = makeSelection([], ['C1'])
      const result = toggleContainerSelect(state, 'C2', true)
      expect(result.selectedContainerIds.has('C1')).toBe(true)
      expect(result.selectedContainerIds.has('C2')).toBe(true)
    })

    it('removes container in multi mode if already selected', () => {
      const state = makeSelection([], ['C1', 'C2'])
      const result = toggleContainerSelect(state, 'C1', true)
      expect(result.selectedContainerIds.has('C1')).toBe(false)
      expect(result.selectedContainerIds.has('C2')).toBe(true)
    })

    it('single-mode clears node selection', () => {
      const state = makeSelection(['A'], ['C1'])
      const result = toggleContainerSelect(state, 'C2', false)
      expect(result.selectedNodeIds.size).toBe(0)
      expect(result.selectedContainerIds.has('C2')).toBe(true)
    })

    it('multi-mode preserves node selection', () => {
      const state = makeSelection(['A'], ['C1'])
      const result = toggleContainerSelect(state, 'C2', true)
      expect(result.selectedNodeIds.has('A')).toBe(true)
      expect(result.selectedContainerIds.has('C1')).toBe(true)
      expect(result.selectedContainerIds.has('C2')).toBe(true)
    })
  })

  // ----- clearSelection -----

  describe('clearSelection', () => {
    it('returns an empty selection with both Sets empty', () => {
      const result = clearSelection()
      expect(result.selectedNodeIds.size).toBe(0)
      expect(result.selectedContainerIds.size).toBe(0)
    })

    it('returns new Set instances each time', () => {
      const a = clearSelection()
      const b = clearSelection()
      expect(a.selectedNodeIds).not.toBe(b.selectedNodeIds)
      expect(a.selectedContainerIds).not.toBe(b.selectedContainerIds)
    })
  })

  // ----- allSelectedIds -----

  describe('allSelectedIds', () => {
    it('returns empty set when nothing is selected', () => {
      expect(allSelectedIds(empty).size).toBe(0)
    })

    it('returns combined node and container ids', () => {
      const state = makeSelection(['A', 'B'], ['C1'])
      const all = allSelectedIds(state)
      expect(all.size).toBe(3)
      expect(all.has('A')).toBe(true)
      expect(all.has('B')).toBe(true)
      expect(all.has('C1')).toBe(true)
    })

    it('returns only node ids when no containers are selected', () => {
      const state = makeSelection(['A'])
      const all = allSelectedIds(state)
      expect(all.size).toBe(1)
      expect(all.has('A')).toBe(true)
    })
  })

  // ----- renderSelectionOverlays -----

  describe('renderSelectionOverlays', () => {
    it('draws overlay rects for selected nodes', () => {
      const layer = makeInteractionLayer()
      const index = makeDiagramIndex(['A', 'B'])
      const selection = makeSelection(['A'])

      renderSelectionOverlays(layer, index, selection)

      const overlays = layer.querySelectorAll('[data-selection-overlay]')
      expect(overlays.length).toBe(1)
      layer.closest('svg')?.remove()
    })

    it('draws overlay rects for selected containers', () => {
      const layer = makeInteractionLayer()
      const index = makeDiagramIndex([], ['C1', 'C2'])
      const selection = makeSelection([], ['C1', 'C2'])

      renderSelectionOverlays(layer, index, selection)

      const overlays = layer.querySelectorAll('[data-selection-overlay]')
      expect(overlays.length).toBe(2)
      layer.closest('svg')?.remove()
    })

    it('draws combined overlays for nodes and containers', () => {
      const layer = makeInteractionLayer()
      const index = makeDiagramIndex(['A'], ['C1'])
      const selection = makeSelection(['A'], ['C1'])

      renderSelectionOverlays(layer, index, selection)

      const overlays = layer.querySelectorAll('[data-selection-overlay]')
      expect(overlays.length).toBe(2)
      layer.closest('svg')?.remove()
    })

    it('clears previous overlays before drawing new ones', () => {
      const layer = makeInteractionLayer()
      const index = makeDiagramIndex(['A', 'B'])

      renderSelectionOverlays(layer, index, makeSelection(['A', 'B']))
      expect(layer.querySelectorAll('[data-selection-overlay]').length).toBe(2)

      renderSelectionOverlays(layer, index, makeSelection(['A']))
      expect(layer.querySelectorAll('[data-selection-overlay]').length).toBe(1)
      layer.closest('svg')?.remove()
    })

    it('draws nothing when selection is empty', () => {
      const layer = makeInteractionLayer()
      const index = makeDiagramIndex(['A', 'B'])

      renderSelectionOverlays(layer, index, empty)

      const overlays = layer.querySelectorAll('[data-selection-overlay]')
      expect(overlays.length).toBe(0)
      layer.closest('svg')?.remove()
    })

    it('skips nodes not found in diagram index', () => {
      const layer = makeInteractionLayer()
      const index = makeDiagramIndex(['A'])
      const selection = makeSelection(['A', 'MISSING'])

      renderSelectionOverlays(layer, index, selection)

      const overlays = layer.querySelectorAll('[data-selection-overlay]')
      expect(overlays.length).toBe(1)
      layer.closest('svg')?.remove()
    })
  })

  // ----- clearSelectionOverlays -----

  describe('clearSelectionOverlays', () => {
    it('removes all overlay rects', () => {
      const layer = makeInteractionLayer()
      const index = makeDiagramIndex(['A', 'B'])

      renderSelectionOverlays(layer, index, makeSelection(['A', 'B']))
      expect(layer.querySelectorAll('[data-selection-overlay]').length).toBe(2)

      clearSelectionOverlays(layer)
      expect(layer.querySelectorAll('[data-selection-overlay]').length).toBe(0)
      layer.closest('svg')?.remove()
    })

    it('does nothing when no overlays exist', () => {
      const layer = makeInteractionLayer()
      clearSelectionOverlays(layer)
      expect(layer.querySelectorAll('[data-selection-overlay]').length).toBe(0)
      layer.closest('svg')?.remove()
    })
  })
})
