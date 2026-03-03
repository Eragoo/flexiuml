import { describe, it, expect, beforeAll } from 'vitest'
import {
  parseEdgeId,
  decodeEdgePoints,
  collectNodeIds,
  buildEdgeMap,
  shiftEdgePoints,
  pointsToPathD,
  computeLabelPosition,
  getNodeDelta,
  updateEdgesForNode,
} from '../svg-edges'
import type { EdgeMap, EdgeInfo } from '../svg-edges'
import type { Point } from '../../core/types'

// jsdom does not implement CSS.escape; polyfill it for tests.
if (typeof globalThis.CSS === 'undefined') {
  ;(globalThis as Record<string, unknown>).CSS = {}
}
if (typeof CSS.escape !== 'function') {
  CSS.escape = (value: string): string =>
    value.replace(/([^\w-])/g, '\\$1')
}

// ---- Helpers ----

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  document.body.appendChild(svg)
  return svg
}

function makeG(attrs: Record<string, string> = {}): SVGGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
  return el
}

function makePath(attrs: Record<string, string> = {}): SVGPathElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
  return el
}

/** Encode points as base64 JSON (matching Mermaid's data-points format). */
function encodePoints(points: Point[]): string {
  return btoa(JSON.stringify(points))
}

describe('svg-edges', () => {
  // ========== parseEdgeId ==========
  describe('parseEdgeId', () => {
    // Happy Path
    it('parses simple edge ID with known node IDs', () => {
      const known = new Set(['A', 'B'])
      expect(parseEdgeId('L_A_B_0', known)).toEqual({ start: 'A', end: 'B' })
    })

    it('parses edge ID with different counter', () => {
      const known = new Set(['X', 'Y'])
      expect(parseEdgeId('L_X_Y_3', known)).toEqual({ start: 'X', end: 'Y' })
    })

    it('parses edge ID where node IDs contain underscores', () => {
      const known = new Set(['my_node', 'other_node'])
      expect(parseEdgeId('L_my_node_other_node_0', known)).toEqual({
        start: 'my_node',
        end: 'other_node',
      })
    })

    it('parses self-loop edge (same start and end)', () => {
      // Self-loop: L_A_A_0 → with suffix stripped = "A_A" → splits at underscore
      const known = new Set(['A'])
      expect(parseEdgeId('L_A_A_0', known)).toEqual({ start: 'A', end: 'A' })
    })

    it('falls back to simple split when node IDs are not in known set', () => {
      const known = new Set<string>() // empty
      expect(parseEdgeId('L_X_Y_0', known)).toEqual({ start: 'X', end: 'Y' })
    })

    // Edge Cases
    it('returns null for edge ID that cannot be parsed', () => {
      const known = new Set(['A', 'B'])
      expect(parseEdgeId('invalid', known)).toBeNull()
    })

    it('returns null when only one segment after stripping prefix/suffix', () => {
      const known = new Set(['A'])
      // "L_A_0" → strip prefix = "A_0" → strip suffix = "A" → no split possible
      expect(parseEdgeId('L_A_0', known)).toBeNull()
    })

    it('handles multi-digit counter in suffix', () => {
      const known = new Set(['A', 'B'])
      expect(parseEdgeId('L_A_B_123', known)).toEqual({ start: 'A', end: 'B' })
    })

    it('handles edge ID without L_ prefix (fallback split)', () => {
      const known = new Set<string>()
      // No L_ prefix: "X_Y_0" → withoutSuffix = "X_Y" → fallback split
      expect(parseEdgeId('X_Y_0', known)).toEqual({ start: 'X', end: 'Y' })
    })

    it('prefers known node IDs over simple split', () => {
      // "L_a_b_c_d_0" with known IDs "a_b" and "c_d"
      const known = new Set(['a_b', 'c_d'])
      expect(parseEdgeId('L_a_b_c_d_0', known)).toEqual({
        start: 'a_b',
        end: 'c_d',
      })
    })
  })

  // ========== decodeEdgePoints ==========
  describe('decodeEdgePoints', () => {
    // Happy Path
    it('decodes valid base64-encoded JSON points', () => {
      const points: Point[] = [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ]
      const encoded = encodePoints(points)
      expect(decodeEdgePoints(encoded)).toEqual(points)
    })

    it('decodes single point', () => {
      const points = [{ x: 5.5, y: 7.3 }]
      expect(decodeEdgePoints(encodePoints(points))).toEqual(points)
    })

    it('filters out invalid points from array', () => {
      const raw = [
        { x: 1, y: 2 },
        { x: 'bad', y: 3 },
        null,
        { x: 4, y: 5 },
      ]
      const encoded = btoa(JSON.stringify(raw))
      expect(decodeEdgePoints(encoded)).toEqual([
        { x: 1, y: 2 },
        { x: 4, y: 5 },
      ])
    })

    it('decodes empty array', () => {
      expect(decodeEdgePoints(encodePoints([]))).toEqual([])
    })

    // Edge Cases / Error Scenarios
    it('returns empty array for invalid base64', () => {
      expect(decodeEdgePoints('not-base64!!!')).toEqual([])
    })

    it('returns empty array for base64 of non-JSON', () => {
      expect(decodeEdgePoints(btoa('not json'))).toEqual([])
    })

    it('returns empty array for base64 of non-array JSON', () => {
      expect(decodeEdgePoints(btoa('{"x":1,"y":2}'))).toEqual([])
    })

    it('strips extra properties from points', () => {
      const raw = [{ x: 1, y: 2, z: 3, extra: 'stuff' }]
      const encoded = btoa(JSON.stringify(raw))
      // Should only have x, y
      expect(decodeEdgePoints(encoded)).toEqual([{ x: 1, y: 2 }])
    })
  })

  // ========== collectNodeIds ==========
  describe('collectNodeIds', () => {
    // Happy Path
    it('collects node IDs from SVG elements matching selector', () => {
      const svg = makeSvg()
      const g1 = makeG({ 'data-id': 'A', class: 'node' })
      const g2 = makeG({ 'data-id': 'B', class: 'node' })
      svg.appendChild(g1)
      svg.appendChild(g2)

      const ids = collectNodeIds(svg, 'g.node', (el) =>
        el.getAttribute('data-id'),
      )
      expect(ids).toEqual(new Set(['A', 'B']))
      document.body.removeChild(svg)
    })

    it('returns empty set when no nodes match', () => {
      const svg = makeSvg()
      const ids = collectNodeIds(svg, 'g.node', (el) =>
        el.getAttribute('data-id'),
      )
      expect(ids.size).toBe(0)
      document.body.removeChild(svg)
    })

    it('skips elements where extractNodeId returns null', () => {
      const svg = makeSvg()
      const g1 = makeG({ class: 'node' }) // no data-id
      svg.appendChild(g1)

      const ids = collectNodeIds(svg, 'g.node', (el) =>
        el.getAttribute('data-id'),
      )
      expect(ids.size).toBe(0)
      document.body.removeChild(svg)
    })

    it('deduplicates node IDs', () => {
      const svg = makeSvg()
      const g1 = makeG({ 'data-id': 'A', class: 'node' })
      const g2 = makeG({ 'data-id': 'A', class: 'node' })
      svg.appendChild(g1)
      svg.appendChild(g2)

      const ids = collectNodeIds(svg, 'g.node', (el) =>
        el.getAttribute('data-id'),
      )
      expect(ids).toEqual(new Set(['A']))
      document.body.removeChild(svg)
    })
  })

  // ========== buildEdgeMap ==========
  describe('buildEdgeMap', () => {
    function buildTestSvg(
      nodeIds: string[],
      edges: { edgeId: string; points: Point[] }[],
    ): SVGSVGElement {
      const svg = makeSvg()

      // Add node groups
      for (const id of nodeIds) {
        const g = makeG({ 'data-id': id, class: 'node' })
        svg.appendChild(g)
      }

      // Add edge paths
      for (const edge of edges) {
        const path = makePath({
          'data-id': edge.edgeId,
          'data-points': encodePoints(edge.points),
          d: 'M0,0',
        })
        svg.appendChild(path)
      }

      return svg
    }

    // Happy Path
    it('builds edge map from SVG with edges', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]
      const svg = buildTestSvg(['A', 'B'], [{ edgeId: 'L_A_B_0', points }])
      const known = new Set(['A', 'B'])

      const map = buildEdgeMap(svg, known)

      // Both A and B should have the edge
      expect(map.has('A')).toBe(true)
      expect(map.has('B')).toBe(true)
      expect(map.get('A')!.length).toBe(1)
      expect(map.get('B')!.length).toBe(1)
      // They should reference the same EdgeInfo object
      expect(map.get('A')![0]).toBe(map.get('B')![0])
      expect(map.get('A')![0]!.edgeId).toBe('L_A_B_0')
      expect(map.get('A')![0]!.startNodeId).toBe('A')
      expect(map.get('A')![0]!.endNodeId).toBe('B')
      expect(map.get('A')![0]!.originalPoints).toEqual(points)

      document.body.removeChild(svg)
    })

    it('builds edge map with multiple edges per node', () => {
      const pts1 = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ]
      const pts2 = [
        { x: 0, y: 0 },
        { x: 80, y: 80 },
      ]
      const svg = buildTestSvg(
        ['A', 'B', 'C'],
        [
          { edgeId: 'L_A_B_0', points: pts1 },
          { edgeId: 'L_A_C_0', points: pts2 },
        ],
      )
      const known = new Set(['A', 'B', 'C'])

      const map = buildEdgeMap(svg, known)

      expect(map.get('A')!.length).toBe(2)
      expect(map.get('B')!.length).toBe(1)
      expect(map.get('C')!.length).toBe(1)

      document.body.removeChild(svg)
    })

    it('returns empty map when no edge paths exist', () => {
      const svg = buildTestSvg(['A', 'B'], [])
      const known = new Set(['A', 'B'])

      const map = buildEdgeMap(svg, known)
      expect(map.size).toBe(0)

      document.body.removeChild(svg)
    })

    it('skips edges whose ID cannot be parsed', () => {
      const pts = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]
      const svg = buildTestSvg(
        ['A', 'B'],
        [{ edgeId: 'INVALID', points: pts }],
      )
      const known = new Set(['A', 'B'])

      const map = buildEdgeMap(svg, known)
      expect(map.size).toBe(0)

      document.body.removeChild(svg)
    })

    it('skips edges with empty points', () => {
      const svg = buildTestSvg(
        ['A', 'B'],
        [{ edgeId: 'L_A_B_0', points: [] }],
      )
      const known = new Set(['A', 'B'])

      const map = buildEdgeMap(svg, known)
      expect(map.size).toBe(0)

      document.body.removeChild(svg)
    })

    it('handles self-loop edge (same start and end)', () => {
      const pts = [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]
      const svg = buildTestSvg(['A'], [{ edgeId: 'L_A_A_0', points: pts }])
      const known = new Set(['A'])

      const map = buildEdgeMap(svg, known)

      // Self-loop: should only appear once for node A
      expect(map.get('A')!.length).toBe(1)

      document.body.removeChild(svg)
    })

    it('finds edge label elements when present', () => {
      const svg = makeSvg()
      const known = new Set(['A', 'B'])

      // Add an edge path
      const pts = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]
      const path = makePath({
        'data-id': 'L_A_B_0',
        'data-points': encodePoints(pts),
        d: 'M0,0',
      })
      svg.appendChild(path)

      // Add matching edge label structure
      const edgeLabelG = makeG({ class: 'edgeLabel' })
      const innerLabel = makeG({ class: 'label', 'data-id': 'L_A_B_0' })
      edgeLabelG.appendChild(innerLabel)
      svg.appendChild(edgeLabelG)

      const map = buildEdgeMap(svg, known)
      expect(map.get('A')![0]!.labelEl).toBe(edgeLabelG)

      document.body.removeChild(svg)
    })
  })

  // ========== shiftEdgePoints ==========
  describe('shiftEdgePoints', () => {
    // Happy Path
    it('shifts a 2-point edge with start and end deltas', () => {
      const pts: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]
      const result = shiftEdgePoints(pts, { x: 10, y: 20 }, { x: -5, y: -10 })
      expect(result).toEqual([
        { x: 10, y: 20 },
        { x: 95, y: 90 },
      ])
    })

    it('shifts a multi-point edge with interpolated deltas', () => {
      // 3-point edge: t = 0, 0.5, 1
      const pts: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ]
      const result = shiftEdgePoints(pts, { x: 10, y: 0 }, { x: 0, y: 10 })
      // Point 0: t=0 → dx=10*(1-0)+0*0=10, dy=0*(1-0)+10*0=0 → (10, 0)
      // Point 1: t=0.5 → dx=10*(0.5)+0*0.5=5, dy=0*(0.5)+10*0.5=5 → (55, 55)
      // Point 2: t=1 → dx=10*0+0*1=0, dy=0*0+10*1=10 → (100, 110)
      expect(result).toEqual([
        { x: 10, y: 0 },
        { x: 55, y: 55 },
        { x: 100, y: 110 },
      ])
    })

    it('returns empty array for empty input', () => {
      expect(shiftEdgePoints([], { x: 10, y: 20 }, { x: 0, y: 0 })).toEqual([])
    })

    it('shifts a single-point edge with start delta', () => {
      const pts: Point[] = [{ x: 10, y: 20 }]
      const result = shiftEdgePoints(pts, { x: 5, y: 3 }, { x: 99, y: 99 })
      expect(result).toEqual([{ x: 15, y: 23 }])
    })

    it('applies zero deltas without changing points', () => {
      const pts: Point[] = [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ]
      const result = shiftEdgePoints(pts, { x: 0, y: 0 }, { x: 0, y: 0 })
      expect(result).toEqual(pts)
    })

    it('handles same delta for both start and end (uniform shift)', () => {
      const pts: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ]
      const delta = { x: 5, y: 10 }
      const result = shiftEdgePoints(pts, delta, delta)
      // Uniform shift: all points move by (5, 10)
      expect(result).toEqual([
        { x: 5, y: 10 },
        { x: 55, y: 60 },
        { x: 105, y: 110 },
      ])
    })

    it('handles 4-point edge with correct interpolation', () => {
      // t = 0, 1/3, 2/3, 1
      const pts: Point[] = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 60, y: 0 },
        { x: 90, y: 0 },
      ]
      const result = shiftEdgePoints(pts, { x: 30, y: 0 }, { x: 0, y: 0 })
      // Point 0: t=0 → dx=30
      // Point 1: t=1/3 → dx=30*(2/3)=20
      // Point 2: t=2/3 → dx=30*(1/3)=10
      // Point 3: t=1 → dx=0
      expect(result[0]!.x).toBeCloseTo(30)
      expect(result[1]!.x).toBeCloseTo(50)
      expect(result[2]!.x).toBeCloseTo(70)
      expect(result[3]!.x).toBeCloseTo(90)
    })
  })

  // ========== pointsToPathD ==========
  describe('pointsToPathD', () => {
    // Happy Path
    it('generates empty string for empty points', () => {
      expect(pointsToPathD([])).toBe('')
    })

    it('generates M command for single point', () => {
      expect(pointsToPathD([{ x: 10, y: 20 }])).toBe('M10,20')
    })

    it('generates M-L path for two points', () => {
      expect(pointsToPathD([{ x: 0, y: 0 }, { x: 100, y: 50 }])).toBe(
        'M0,0L100,50',
      )
    })

    it('generates cubic Bezier path for three points', () => {
      const d = pointsToPathD([
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ])
      // Should start with M, contain C, end with L
      expect(d).toMatch(/^M0,0C/)
      expect(d).toMatch(/L100,0$/)
    })

    it('generates S commands for 4+ points', () => {
      const d = pointsToPathD([
        { x: 0, y: 0 },
        { x: 30, y: 30 },
        { x: 60, y: 60 },
        { x: 90, y: 0 },
      ])
      // Should contain M, C, S, L
      expect(d).toMatch(/^M0,0C/)
      expect(d).toContain('S')
      expect(d).toMatch(/L90,0$/)
    })

    // Edge Cases
    it('handles decimal coordinates', () => {
      expect(pointsToPathD([{ x: 1.5, y: 2.7 }])).toBe('M1.5,2.7')
    })

    it('handles negative coordinates', () => {
      expect(
        pointsToPathD([
          { x: -10, y: -20 },
          { x: -30, y: -40 },
        ]),
      ).toBe('M-10,-20L-30,-40')
    })
  })

  // ========== computeLabelPosition ==========
  describe('computeLabelPosition', () => {
    // Happy Path
    it('returns origin for empty points', () => {
      expect(computeLabelPosition([])).toEqual({ x: 0, y: 0 })
    })

    it('returns the point itself for single point', () => {
      expect(computeLabelPosition([{ x: 42, y: 99 }])).toEqual({
        x: 42,
        y: 99,
      })
    })

    it('returns midpoint for two points', () => {
      const result = computeLabelPosition([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ])
      expect(result.x).toBeCloseTo(50)
      expect(result.y).toBeCloseTo(0)
    })

    it('returns midpoint along polyline for three points', () => {
      // A horizontal L-shape: (0,0)→(100,0)→(100,100)
      // Total length: 100 + 100 = 200, half = 100
      // The midpoint falls at the end of the first segment: (100, 0)
      const result = computeLabelPosition([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ])
      expect(result.x).toBeCloseTo(100)
      expect(result.y).toBeCloseTo(0)
    })

    it('returns midpoint along unequal polyline segments', () => {
      // Segments: (0,0)→(10,0) = 10, then (10,0)→(10,30) = 30
      // Total = 40, half = 20. First segment = 10, so we need 10 more into second.
      // t = 10/30 = 1/3 along second segment = (10, 10)
      const result = computeLabelPosition([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 30 },
      ])
      expect(result.x).toBeCloseTo(10)
      expect(result.y).toBeCloseTo(10)
    })

    // Edge Cases
    it('handles coincident points (zero-length segment)', () => {
      const result = computeLabelPosition([
        { x: 50, y: 50 },
        { x: 50, y: 50 },
      ])
      // Zero length → t would be 0 → returns first point
      expect(result.x).toBeCloseTo(50)
      expect(result.y).toBeCloseTo(50)
    })

    it('returns copy not reference for single point', () => {
      const original = { x: 1, y: 2 }
      const result = computeLabelPosition([original])
      expect(result).toEqual(original)
      expect(result).not.toBe(original)
    })
  })

  // ========== getNodeDelta ==========
  describe('getNodeDelta', () => {
    // Happy Path
    it('returns translate of a node element', () => {
      const svg = makeSvg()
      const g = makeG({
        'data-id': 'A',
        transform: 'translate(15, 25)',
      })
      svg.appendChild(g)

      const mockGetTranslate = (el: SVGElement): Point => {
        const t = el.getAttribute('transform') ?? ''
        const m = t.match(/translate\(([^,]+),\s*([^)]+)\)/)
        if (!m) return { x: 0, y: 0 }
        return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) }
      }

      expect(getNodeDelta(svg, 'A', mockGetTranslate)).toEqual({
        x: 15,
        y: 25,
      })
      document.body.removeChild(svg)
    })

    it('returns {x:0, y:0} when node not found', () => {
      const svg = makeSvg()
      const mockGetTranslate = (): Point => ({ x: 99, y: 99 })

      expect(getNodeDelta(svg, 'nonexistent', mockGetTranslate)).toEqual({
        x: 0,
        y: 0,
      })
      document.body.removeChild(svg)
    })

    it('handles CSS-escaped data-id lookups', () => {
      const svg = makeSvg()
      // Node with special characters in ID
      const g = makeG({
        'data-id': 'node:1',
        transform: 'translate(5, 10)',
      })
      svg.appendChild(g)

      const mockGetTranslate = (el: SVGElement): Point => {
        const t = el.getAttribute('transform') ?? ''
        const m = t.match(/translate\(([^,]+),\s*([^)]+)\)/)
        if (!m) return { x: 0, y: 0 }
        return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) }
      }

      expect(getNodeDelta(svg, 'node:1', mockGetTranslate)).toEqual({
        x: 5,
        y: 10,
      })
      document.body.removeChild(svg)
    })
  })

  // ========== updateEdgesForNode ==========
  describe('updateEdgesForNode', () => {
    function makeMockEdge(overrides: Partial<EdgeInfo> = {}): EdgeInfo {
      const path = makePath({ d: 'M0,0L100,100' })
      return {
        edgeId: 'L_A_B_0',
        pathEl: path,
        labelEl: null,
        startNodeId: 'A',
        endNodeId: 'B',
        originalPoints: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        ...overrides,
      }
    }

    it('updates path d attribute for connected edges', () => {
      const svg = makeSvg()
      // Add node elements with translate
      const gA = makeG({ 'data-id': 'A', transform: 'translate(10, 20)' })
      const gB = makeG({ 'data-id': 'B', transform: 'translate(0, 0)' })
      svg.appendChild(gA)
      svg.appendChild(gB)

      const edge = makeMockEdge()
      svg.appendChild(edge.pathEl)
      const edgeMap: EdgeMap = new Map([['A', [edge]]])

      const mockGetTranslate = (el: SVGElement): Point => {
        const t = el.getAttribute('transform') ?? ''
        const m = t.match(/translate\(([^,]+),\s*([^)]+)\)/)
        if (!m) return { x: 0, y: 0 }
        return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) }
      }

      updateEdgesForNode(svg, 'A', edgeMap, mockGetTranslate)

      // Path d should be updated (not original M0,0L100,100)
      const newD = edge.pathEl.getAttribute('d')
      expect(newD).not.toBe('M0,0L100,100')
      // Start point shifted by A's delta (10,20), end point by B's delta (0,0)
      expect(newD).toBe('M10,20L100,100')

      document.body.removeChild(svg)
    })

    it('does nothing when node has no edges in map', () => {
      const svg = makeSvg()
      const edgeMap: EdgeMap = new Map()
      const mockGetTranslate = (): Point => ({ x: 0, y: 0 })

      // Should not throw
      updateEdgesForNode(svg, 'Z', edgeMap, mockGetTranslate)
      document.body.removeChild(svg)
    })

    it('updates edge label position when label exists', () => {
      const svg = makeSvg()
      const gA = makeG({ 'data-id': 'A', transform: 'translate(0, 0)' })
      const gB = makeG({ 'data-id': 'B', transform: 'translate(0, 0)' })
      svg.appendChild(gA)
      svg.appendChild(gB)

      const labelEl = makeG()
      const edge = makeMockEdge({ labelEl })
      svg.appendChild(edge.pathEl)
      const edgeMap: EdgeMap = new Map([['A', [edge]]])

      const mockGetTranslate = (): Point => ({ x: 0, y: 0 })

      updateEdgesForNode(svg, 'A', edgeMap, mockGetTranslate)

      // Label should have a transform set
      const transform = labelEl.getAttribute('transform')
      expect(transform).toMatch(/translate\(/)

      document.body.removeChild(svg)
    })

    it('avoids updating the same edge twice (deduplication)', () => {
      const svg = makeSvg()
      const gA = makeG({ 'data-id': 'A', transform: 'translate(5, 5)' })
      svg.appendChild(gA)

      // Self-loop: same edge appears twice for node A
      const edge = makeMockEdge({
        edgeId: 'L_A_A_0',
        startNodeId: 'A',
        endNodeId: 'A',
        originalPoints: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
        ],
      })
      svg.appendChild(edge.pathEl)

      // The same edge reference in the list twice (as would happen for self-loops)
      const edgeMap: EdgeMap = new Map([['A', [edge, edge]]])

      const calls: SVGElement[] = []
      const mockGetTranslate = (el: SVGElement): Point => {
        calls.push(el)
        const t = el.getAttribute('transform') ?? ''
        const m = t.match(/translate\(([^,]+),\s*([^)]+)\)/)
        if (!m) return { x: 0, y: 0 }
        return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) }
      }

      updateEdgesForNode(svg, 'A', edgeMap, mockGetTranslate)

      // The path d should be set (edge was processed)
      const d = edge.pathEl.getAttribute('d')
      expect(d).toBe('M5,5L55,55')

      document.body.removeChild(svg)
    })

    it('handles edge with both endpoints moved', () => {
      const svg = makeSvg()
      const gA = makeG({ 'data-id': 'A', transform: 'translate(10, 0)' })
      const gB = makeG({ 'data-id': 'B', transform: 'translate(0, 10)' })
      svg.appendChild(gA)
      svg.appendChild(gB)

      const edge = makeMockEdge()
      svg.appendChild(edge.pathEl)
      const edgeMap: EdgeMap = new Map([
        ['A', [edge]],
        ['B', [edge]],
      ])

      const mockGetTranslate = (el: SVGElement): Point => {
        const t = el.getAttribute('transform') ?? ''
        const m = t.match(/translate\(([^,]+),\s*([^)]+)\)/)
        if (!m) return { x: 0, y: 0 }
        return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) }
      }

      updateEdgesForNode(svg, 'A', edgeMap, mockGetTranslate)

      // Start shifted by A's (10,0), end shifted by B's (0,10)
      expect(edge.pathEl.getAttribute('d')).toBe('M10,0L100,110')

      document.body.removeChild(svg)
    })
  })
})
