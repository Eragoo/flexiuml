import { describe, it, expect } from 'vitest'
import {
  getTranslate,
  setTranslate,
  findNodeGroup,
  endDrag,
} from '../svg-drag'
import { IDLE_DRAG } from '../../core/types'

// Helpers

function makeSvgG(attrs: Record<string, string> = {}): SVGGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
  return el
}

function makeSvgRoot(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  document.body.appendChild(svg)
  return svg
}

describe('svg-drag', () => {
  // ----- getTranslate -----

  describe('getTranslate', () => {
    // Happy Path
    it('parses translate(x, y) from transform attribute', () => {
      const el = makeSvgG({ transform: 'translate(10, 20)' })
      expect(getTranslate(el)).toEqual({ x: 10, y: 20 })
    })

    it('parses translate with space separator', () => {
      const el = makeSvgG({ transform: 'translate(5 15)' })
      expect(getTranslate(el)).toEqual({ x: 5, y: 15 })
    })

    it('parses negative values', () => {
      const el = makeSvgG({ transform: 'translate(-30, -40.5)' })
      expect(getTranslate(el)).toEqual({ x: -30, y: -40.5 })
    })

    it('parses translate embedded in other transforms', () => {
      const el = makeSvgG({ transform: 'scale(2) translate(100, 200) rotate(45)' })
      expect(getTranslate(el)).toEqual({ x: 100, y: 200 })
    })

    // Edge Cases
    it('returns {x:0, y:0} when no transform attribute', () => {
      const el = makeSvgG()
      expect(getTranslate(el)).toEqual({ x: 0, y: 0 })
    })

    it('returns {x:0, y:0} when transform has no translate', () => {
      const el = makeSvgG({ transform: 'scale(2)' })
      expect(getTranslate(el)).toEqual({ x: 0, y: 0 })
    })

    it('parses float values', () => {
      const el = makeSvgG({ transform: 'translate(1.5, 2.75)' })
      expect(getTranslate(el)).toEqual({ x: 1.5, y: 2.75 })
    })

    it('parses single-argument translate(x) as translate(x, 0)', () => {
      const el = makeSvgG({ transform: 'translate(42)' })
      expect(getTranslate(el)).toEqual({ x: 42, y: 0 })
    })
  })

  // ----- setTranslate -----

  describe('setTranslate', () => {
    // Happy Path
    it('sets translate on element with no existing transform', () => {
      const el = makeSvgG()
      setTranslate(el, 10, 20)
      expect(el.getAttribute('transform')).toBe('translate(10, 20)')
    })

    it('replaces existing translate', () => {
      const el = makeSvgG({ transform: 'translate(5, 5)' })
      setTranslate(el, 50, 60)
      expect(el.getAttribute('transform')).toBe('translate(50, 60)')
    })

    it('preserves other transforms when replacing translate', () => {
      const el = makeSvgG({ transform: 'scale(2) translate(5, 5) rotate(45)' })
      setTranslate(el, 100, 200)
      const t = el.getAttribute('transform')!
      expect(t).toContain('translate(100, 200)')
      expect(t).toContain('scale(2)')
      expect(t).toContain('rotate(45)')
    })

    it('prepends translate when other transforms exist but no translate', () => {
      const el = makeSvgG({ transform: 'scale(2)' })
      setTranslate(el, 30, 40)
      const t = el.getAttribute('transform')!
      expect(t).toBe('translate(30, 40) scale(2)')
    })
  })

  // ----- findNodeGroup -----

  describe('findNodeGroup', () => {
    it('returns the closest matching ancestor SVGGElement', () => {
      const svg = makeSvgRoot()
      const g = makeSvgG({ class: 'node' })
      const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      g.appendChild(child)
      svg.appendChild(g)

      const result = findNodeGroup(child, '.node')
      expect(result).toBe(g)

      svg.remove()
    })

    it('returns null when target is not an Element', () => {
      expect(findNodeGroup(null, '.node')).toBeNull()
    })

    it('returns null when no matching ancestor exists', () => {
      const svg = makeSvgRoot()
      const g = makeSvgG({ class: 'other' })
      svg.appendChild(g)

      expect(findNodeGroup(g, '.node')).toBeNull()
      svg.remove()
    })

    it('returns the element itself if it matches', () => {
      const svg = makeSvgRoot()
      const g = makeSvgG({ class: 'node' })
      svg.appendChild(g)

      expect(findNodeGroup(g, '.node')).toBe(g)
      svg.remove()
    })
  })

  // ----- endDrag -----

  describe('endDrag', () => {
    it('returns idle drag state', () => {
      const result = endDrag()
      expect(result).toEqual(IDLE_DRAG)
    })

    it('returns a new object (not the same reference)', () => {
      const result = endDrag()
      expect(result).not.toBe(IDLE_DRAG)
    })
  })
})
