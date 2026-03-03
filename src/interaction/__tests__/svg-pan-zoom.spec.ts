import { describe, it, expect } from 'vitest'
import {
  startPan,
  movePan,
  endPan,
  resetViewport,
  zoomAtPoint,
  applyViewport,
  fitToView,
} from '../svg-pan-zoom'
import { IDLE_PAN, DEFAULT_VIEWPORT } from '../../core/types'
import type { ViewportState, PanState } from '../../core/types'

// Helpers

function makeSvg(width = 800, height = 600): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  // jsdom doesn't compute layout, so we stub clientWidth/clientHeight
  Object.defineProperty(svg, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(svg, 'clientHeight', { value: height, configurable: true })
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON() {} }),
    configurable: true,
  })
  Object.defineProperty(svg, 'getBBox', {
    value: () => ({ x: 0, y: 0, width: 400, height: 300 }),
    configurable: true,
  })
  document.body.appendChild(svg)
  return svg
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
    it('updates panX and panY based on mouse delta and zoom', () => {
      const pan: PanState = {
        panning: true,
        startClientX: 100,
        startClientY: 200,
        startPanX: 0,
        startPanY: 0,
      }
      // Move mouse right 50px, down 30px → pan should decrease (move view left/up)
      const result = movePan(pan, 150, 230, { panX: 0, panY: 0, zoom: 1 })
      expect(result.panX).toBe(-50)
      expect(result.panY).toBe(-30)
    })

    it('scales delta by zoom level', () => {
      const pan: PanState = {
        panning: true,
        startClientX: 0,
        startClientY: 0,
        startPanX: 0,
        startPanY: 0,
      }
      // Zoom = 2 → mouse movement has half the effect on pan
      const result = movePan(pan, 100, 100, { panX: 0, panY: 0, zoom: 2 })
      expect(result.panX).toBe(-50)
      expect(result.panY).toBe(-50)
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

  // ----- applyViewport -----

  describe('applyViewport', () => {
    it('sets viewBox on the SVG element', () => {
      const svg = makeSvg(800, 600)
      applyViewport(svg, { panX: 10, panY: 20, zoom: 1 })
      expect(svg.getAttribute('viewBox')).toBe('10 20 800 600')
      svg.remove()
    })

    it('adjusts view dimensions by zoom', () => {
      const svg = makeSvg(800, 600)
      applyViewport(svg, { panX: 0, panY: 0, zoom: 2 })
      expect(svg.getAttribute('viewBox')).toBe('0 0 400 300')
      svg.remove()
    })

    it('zooming out increases viewBox size', () => {
      const svg = makeSvg(800, 600)
      applyViewport(svg, { panX: 0, panY: 0, zoom: 0.5 })
      expect(svg.getAttribute('viewBox')).toBe('0 0 1600 1200')
      svg.remove()
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
        300, // center of SVG
        -100, // scroll up
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
        100, // scroll down
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
        10000, // massive scroll down
      )
      expect(result.zoom).toBeGreaterThanOrEqual(0.1)
      svg.remove()
    })

    it('clamps zoom to MAX_ZOOM (5)', () => {
      const svg = makeSvg(800, 600)
      const result = zoomAtPoint(
        { panX: 0, panY: 0, zoom: 5 },
        svg,
        400,
        300,
        -10000, // massive scroll up
      )
      expect(result.zoom).toBeLessThanOrEqual(5)
      svg.remove()
    })

    it('adjusts pan to keep cursor point stable', () => {
      const svg = makeSvg(800, 600)
      // Zoom at top-left corner: pan should stay near 0
      const result = zoomAtPoint(
        { panX: 0, panY: 0, zoom: 1 },
        svg,
        0,
        0,
        -100,
      )
      // At top-left, fractionX=0, fractionY=0, so pan should remain ~0
      expect(result.panX).toBeCloseTo(0, 1)
      expect(result.panY).toBeCloseTo(0, 1)
      svg.remove()
    })
  })

  // ----- fitToView -----

  describe('fitToView', () => {
    it('computes viewport that fits content with padding', () => {
      const svg = makeSvg(800, 600)
      const result = fitToView(svg, 20)
      // Content: 400x300, container: 800x600, padding: 20
      // scaleX = 800 / (400+40) = ~1.818, scaleY = 600 / (300+40) = ~1.764
      // zoom = min(1.818, 1.764) = ~1.764
      expect(result.zoom).toBeGreaterThan(1)
      expect(result.zoom).toBeLessThanOrEqual(5)
      svg.remove()
    })

    it('returns default viewport when bbox is empty', () => {
      const svg = makeSvg(800, 600)
      Object.defineProperty(svg, 'getBBox', {
        value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
        configurable: true,
      })
      const result = fitToView(svg)
      expect(result).toEqual(DEFAULT_VIEWPORT)
      svg.remove()
    })

    it('uses default padding of 20', () => {
      const svg = makeSvg(800, 600)
      const withDefault = fitToView(svg)
      const withExplicit = fitToView(svg, 20)
      expect(withDefault.zoom).toBeCloseTo(withExplicit.zoom, 5)
      svg.remove()
    })
  })
})
