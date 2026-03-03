import { describe, it, expect } from 'vitest'
import {
  startPan,
  movePan,
  endPan,
  resetViewport,
  zoomAtPoint,
  applyPanZoom,
  fitToView,
  screenToWorld,
  worldToScreen,
} from '../svg-pan-zoom'
import { IDLE_PAN, DEFAULT_VIEWPORT } from '../../core/types'
import type { ViewportState, PanState } from '../../core/types'

// Helpers

function makeSvg(width = 800, height = 600): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  Object.defineProperty(svg, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(svg, 'clientHeight', { value: height, configurable: true })
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON() {} }),
    configurable: true,
  })
  document.body.appendChild(svg)
  return svg
}

function makeGElement(bboxWidth = 400, bboxHeight = 300): SVGGElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  Object.defineProperty(g, 'getBBox', {
    value: () => ({ x: 0, y: 0, width: bboxWidth, height: bboxHeight }),
    configurable: true,
  })
  return g
}

const viewport: ViewportState = { panX: 0, panY: 0, zoom: 1 }

describe('svg-pan-zoom', () => {
  // ----- startPan -----

  describe('startPan', () => {
    it('returns a panning state with start positions', () => {
      const result = startPan(100, 200, viewport)
      expect(result).toEqual({
        panning: true,
        startClientX: 100,
        startClientY: 200,
        startPanX: 0,
        startPanY: 0,
      })
    })

    it('captures current viewport pan offsets', () => {
      const vp: ViewportState = { panX: 50, panY: 75, zoom: 2 }
      const result = startPan(0, 0, vp)
      expect(result.startPanX).toBe(50)
      expect(result.startPanY).toBe(75)
    })
  })

  // ----- movePan -----

  describe('movePan', () => {
    it('updates panX and panY based on mouse delta (transform-based)', () => {
      const pan: PanState = {
        panning: true,
        startClientX: 100,
        startClientY: 200,
        startPanX: 0,
        startPanY: 0,
      }
      // Move mouse right 50px, down 30px → pan increases (direct screen translation)
      const result = movePan(pan, 150, 230, { panX: 0, panY: 0, zoom: 1 })
      expect(result.panX).toBe(50)
      expect(result.panY).toBe(30)
    })

    it('pan delta is independent of zoom in transform mode', () => {
      const pan: PanState = {
        panning: true,
        startClientX: 0,
        startClientY: 0,
        startPanX: 0,
        startPanY: 0,
      }
      // In transform-based pan, mouse dx/dy maps directly to panX/panY
      const result = movePan(pan, 100, 100, { panX: 0, panY: 0, zoom: 2 })
      expect(result.panX).toBe(100)
      expect(result.panY).toBe(100)
    })

    it('returns unchanged viewport when not panning', () => {
      const pan: PanState = { ...IDLE_PAN }
      const vp: ViewportState = { panX: 10, panY: 20, zoom: 1.5 }
      const result = movePan(pan, 999, 999, vp)
      expect(result).toBe(vp)
    })
  })

  // ----- endPan -----

  describe('endPan', () => {
    it('returns idle pan state', () => {
      const result = endPan()
      expect(result).toEqual(IDLE_PAN)
    })

    it('returns a new object (not the same reference)', () => {
      expect(endPan()).not.toBe(IDLE_PAN)
    })
  })

  // ----- resetViewport -----

  describe('resetViewport', () => {
    it('returns default viewport', () => {
      expect(resetViewport()).toEqual(DEFAULT_VIEWPORT)
    })

    it('returns a new object (not the same reference)', () => {
      expect(resetViewport()).not.toBe(DEFAULT_VIEWPORT)
    })
  })

  // ----- applyPanZoom -----

  describe('applyPanZoom', () => {
    it('sets transform attribute on panZoomLayer', () => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement
      applyPanZoom(g, { panX: 10, panY: 20, zoom: 1 })
      expect(g.getAttribute('transform')).toBe('translate(10, 20) scale(1)')
    })

    it('applies zoom in the transform', () => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement
      applyPanZoom(g, { panX: 0, panY: 0, zoom: 2 })
      expect(g.getAttribute('transform')).toBe('translate(0, 0) scale(2)')
    })

    it('handles negative pan values', () => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement
      applyPanZoom(g, { panX: -50, panY: -100, zoom: 0.5 })
      expect(g.getAttribute('transform')).toBe('translate(-50, -100) scale(0.5)')
    })
  })

  // ----- zoomAtPoint -----

  describe('zoomAtPoint', () => {
    it('zooms in when deltaY is negative (scroll up)', () => {
      const svg = makeSvg(800, 600)
      const result = zoomAtPoint(
        { panX: 0, panY: 0, zoom: 1 },
        svg,
        400,
        300,
        -100,
      )
      expect(result.zoom).toBeGreaterThan(1)
      svg.remove()
    })

    it('zooms out when deltaY is positive (scroll down)', () => {
      const svg = makeSvg(800, 600)
      const result = zoomAtPoint(
        { panX: 0, panY: 0, zoom: 1 },
        svg,
        400,
        300,
        100,
      )
      expect(result.zoom).toBeLessThan(1)
      svg.remove()
    })

    it('clamps zoom to MIN_ZOOM (0.1)', () => {
      const svg = makeSvg(800, 600)
      const result = zoomAtPoint(
        { panX: 0, panY: 0, zoom: 0.1 },
        svg,
        400,
        300,
        10000,
      )
      expect(result.zoom).toBeGreaterThanOrEqual(0.1)
      svg.remove()
    })

    it('clamps zoom to MAX_ZOOM (10)', () => {
      const svg = makeSvg(800, 600)
      const result = zoomAtPoint(
        { panX: 0, panY: 0, zoom: 10 },
        svg,
        400,
        300,
        -10000,
      )
      expect(result.zoom).toBeLessThanOrEqual(10)
      svg.remove()
    })

    it('adjusts pan to keep cursor point stable', () => {
      const svg = makeSvg(800, 600)
      // Zoom at top-left corner (0,0): world point = (0 - 0) / 1 = 0
      // After zoom: newPanX = 0 - 0 * newZoom = 0 → pan should remain ~0
      const result = zoomAtPoint(
        { panX: 0, panY: 0, zoom: 1 },
        svg,
        0,
        0,
        -100,
      )
      expect(result.panX).toBeCloseTo(0, 1)
      expect(result.panY).toBeCloseTo(0, 1)
      svg.remove()
    })
  })

  // ----- fitToView -----

  describe('fitToView', () => {
    it('computes viewport that fits content with padding', () => {
      const svg = makeSvg(800, 600)
      const diagramContent = makeGElement(400, 300)
      svg.appendChild(diagramContent)
      const result = fitToView(svg, diagramContent, 20)
      // Content: 400x300, container: 800x600, padding: 20
      // scaleX = (800-40) / 400 = 1.9, scaleY = (600-40) / 300 = 1.867
      // zoom = min(1.9, 1.867) = ~1.867
      expect(result.zoom).toBeGreaterThan(1)
      expect(result.zoom).toBeLessThanOrEqual(5)
      svg.remove()
    })

    it('returns default viewport when bbox is empty', () => {
      const svg = makeSvg(800, 600)
      const diagramContent = makeGElement(0, 0)
      svg.appendChild(diagramContent)
      const result = fitToView(svg, diagramContent)
      expect(result).toEqual(DEFAULT_VIEWPORT)
      svg.remove()
    })

    it('uses default padding of 20', () => {
      const svg = makeSvg(800, 600)
      const diagramContent = makeGElement(400, 300)
      svg.appendChild(diagramContent)
      const withDefault = fitToView(svg, diagramContent)
      const withExplicit = fitToView(svg, diagramContent, 20)
      expect(withDefault.zoom).toBeCloseTo(withExplicit.zoom, 5)
      svg.remove()
    })

    it('centers the content in the viewport', () => {
      const svg = makeSvg(800, 600)
      const diagramContent = makeGElement(400, 300)
      svg.appendChild(diagramContent)
      const result = fitToView(svg, diagramContent, 20)
      // panX = 800/2 - (0 + 400/2) * zoom = 400 - 200 * zoom
      // panY = 600/2 - (0 + 300/2) * zoom = 300 - 150 * zoom
      expect(result.panX).toBeCloseTo(400 - 200 * result.zoom, 1)
      expect(result.panY).toBeCloseTo(300 - 150 * result.zoom, 1)
      svg.remove()
    })
  })
})
