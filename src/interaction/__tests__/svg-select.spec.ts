import { describe, it, expect, vi } from 'vitest'

// Mock mermaid since svg-select imports from mermaid-config which imports mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

import {
  toggleSelect,
  clearSelection,
  applySelectionStyles,
} from '../svg-select'
import type { SelectionState } from '../../core/types'

// Helpers

const empty: SelectionState = { selectedIds: new Set() }

function makeSelection(...ids: string[]): SelectionState {
  return { selectedIds: new Set(ids) }
}

function makeSvgWithNodes(
  nodeIds: string[],
  selector: string = '.node',
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const id of nodeIds) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', 'node')
    g.setAttribute('data-id', id)
    // Add a shape child for highlight testing
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    g.appendChild(rect)
    svg.appendChild(g)
  }
  document.body.appendChild(svg)
  return svg
}

describe('svg-select', () => {
  // ----- toggleSelect -----

  describe('toggleSelect', () => {
    // Happy Path – single select mode (multi = false)
    it('selects a node when nothing is selected', () => {
      const result = toggleSelect(empty, 'A', false)
      expect(result.selectedIds.has('A')).toBe(true)
      expect(result.selectedIds.size).toBe(1)
    })

    it('replaces selection with new node in single mode', () => {
      const state = makeSelection('A')
      const result = toggleSelect(state, 'B', false)
      expect(result.selectedIds.has('B')).toBe(true)
      expect(result.selectedIds.has('A')).toBe(false)
      expect(result.selectedIds.size).toBe(1)
    })

    it('deselects the only selected node when clicked again in single mode', () => {
      const state = makeSelection('A')
      const result = toggleSelect(state, 'A', false)
      expect(result.selectedIds.size).toBe(0)
    })

    // Happy Path – multi select mode (multi = true)
    it('adds a node to selection in multi mode', () => {
      const state = makeSelection('A')
      const result = toggleSelect(state, 'B', true)
      expect(result.selectedIds.has('A')).toBe(true)
      expect(result.selectedIds.has('B')).toBe(true)
      expect(result.selectedIds.size).toBe(2)
    })

    it('removes a node from selection in multi mode if already selected', () => {
      const state = makeSelection('A', 'B')
      const result = toggleSelect(state, 'A', true)
      expect(result.selectedIds.has('A')).toBe(false)
      expect(result.selectedIds.has('B')).toBe(true)
      expect(result.selectedIds.size).toBe(1)
    })

    // Edge Cases
    it('does not mutate the original state', () => {
      const state = makeSelection('A')
      const originalIds = new Set(state.selectedIds)
      toggleSelect(state, 'B', true)
      expect(state.selectedIds).toEqual(originalIds)
    })

    it('single-mode with multiple already selected replaces all', () => {
      const state = makeSelection('A', 'B', 'C')
      const result = toggleSelect(state, 'D', false)
      expect(result.selectedIds.size).toBe(1)
      expect(result.selectedIds.has('D')).toBe(true)
    })
  })

  // ----- clearSelection -----

  describe('clearSelection', () => {
    it('returns an empty selection', () => {
      const result = clearSelection()
      expect(result.selectedIds.size).toBe(0)
    })

    it('returns a new Set instance each time', () => {
      const a = clearSelection()
      const b = clearSelection()
      expect(a.selectedIds).not.toBe(b.selectedIds)
    })
  })

  // ----- applySelectionStyles -----

  describe('applySelectionStyles', () => {
    it('adds selected class to selected nodes', () => {
      const svg = makeSvgWithNodes(['A', 'B', 'C'])
      applySelectionStyles(svg, makeSelection('A', 'C'), '.node')

      const nodes = svg.querySelectorAll('.node')
      const nodeA = nodes[0]!
      const nodeB = nodes[1]!
      const nodeC = nodes[2]!

      expect(nodeA.classList.contains('fleximaid-selected')).toBe(true)
      expect(nodeB.classList.contains('fleximaid-selected')).toBe(false)
      expect(nodeC.classList.contains('fleximaid-selected')).toBe(true)

      svg.remove()
    })

    it('removes selected class from deselected nodes', () => {
      const svg = makeSvgWithNodes(['A', 'B'])

      // First, select A
      applySelectionStyles(svg, makeSelection('A'), '.node')
      const nodeA = svg.querySelectorAll('.node')[0]!
      expect(nodeA.classList.contains('fleximaid-selected')).toBe(true)

      // Then, deselect all
      applySelectionStyles(svg, makeSelection(), '.node')
      expect(nodeA.classList.contains('fleximaid-selected')).toBe(false)

      svg.remove()
    })

    it('sets stroke on selected node shapes', () => {
      const svg = makeSvgWithNodes(['A'])
      applySelectionStyles(svg, makeSelection('A'), '.node')

      const rect = svg.querySelector('rect')!
      expect(rect.getAttribute('stroke')).toBe('#3b82f6')
      expect(rect.getAttribute('stroke-width')).toBe('3')

      svg.remove()
    })

    it('restores original stroke on deselection', () => {
      const svg = makeSvgWithNodes(['A'])
      const rect = svg.querySelector('rect')!
      rect.setAttribute('stroke', 'red')
      rect.setAttribute('stroke-width', '1')

      // Select
      applySelectionStyles(svg, makeSelection('A'), '.node')
      expect(rect.getAttribute('stroke')).toBe('#3b82f6')

      // Deselect
      applySelectionStyles(svg, makeSelection(), '.node')
      expect(rect.getAttribute('stroke')).toBe('red')
      expect(rect.getAttribute('stroke-width')).toBe('1')

      svg.remove()
    })

    it('removes stroke attributes if original had none', () => {
      const svg = makeSvgWithNodes(['A'])

      // Select then deselect
      applySelectionStyles(svg, makeSelection('A'), '.node')
      applySelectionStyles(svg, makeSelection(), '.node')

      const rect = svg.querySelector('rect')!
      expect(rect.getAttribute('stroke')).toBeNull()
      expect(rect.getAttribute('stroke-width')).toBeNull()

      svg.remove()
    })
  })
})
