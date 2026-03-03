import { describe, it, expect, beforeAll } from 'vitest'
import { restructureSvgDom, clearInteractionLayer } from '../svg-structure'

const SVG_NS = 'http://www.w3.org/2000/svg'

// jsdom doesn't define SVGDefsElement / SVGStyleElement. Provide stubs so
// `instanceof` checks inside restructureSvgDom don't throw.
beforeAll(() => {
  if (typeof globalThis.SVGDefsElement === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    ;(globalThis as Record<string, unknown>).SVGDefsElement = class SVGDefsElement {}
  }
  if (typeof globalThis.SVGStyleElement === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    ;(globalThis as Record<string, unknown>).SVGStyleElement = class SVGStyleElement {}
  }
})

function makeContainer(svgContent = '<g class="node"><rect/></g>'): HTMLDivElement {
  const div = document.createElement('div')
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.innerHTML = svgContent
  div.appendChild(svg)
  document.body.appendChild(div)
  return div
}

describe('svg-structure', () => {
  // ----- restructureSvgDom -----

  describe('restructureSvgDom', () => {
    it('returns SvgStructure with all layer references', () => {
      const container = makeContainer()
      const result = restructureSvgDom(container)
      expect(result).not.toBeNull()
      expect(result!.svg).toBeInstanceOf(SVGSVGElement)
      expect(result!.panZoomLayer).toBeInstanceOf(SVGGElement)
      expect(result!.diagramContent).toBeInstanceOf(SVGGElement)
      expect(result!.interactionLayer).toBeInstanceOf(SVGGElement)
      container.remove()
    })

    it('returns null if container has no SVG', () => {
      const div = document.createElement('div')
      document.body.appendChild(div)
      const result = restructureSvgDom(div)
      expect(result).toBeNull()
      div.remove()
    })

    it('adds diagram-root class to container', () => {
      const container = makeContainer()
      restructureSvgDom(container)
      expect(container.classList.contains('diagram-root')).toBe(true)
      container.remove()
    })

    it('adds viewport class to SVG', () => {
      const container = makeContainer()
      const result = restructureSvgDom(container)
      expect(result!.svg.classList.contains('viewport')).toBe(true)
      container.remove()
    })

    it('creates panZoomLayer with correct class', () => {
      const container = makeContainer()
      const result = restructureSvgDom(container)
      expect(result!.panZoomLayer.classList.contains('panZoomLayer')).toBe(true)
      container.remove()
    })

    it('creates diagramContent with correct class', () => {
      const container = makeContainer()
      const result = restructureSvgDom(container)
      expect(result!.diagramContent.classList.contains('diagramContent')).toBe(true)
      container.remove()
    })

    it('creates interactionLayer with correct class', () => {
      const container = makeContainer()
      const result = restructureSvgDom(container)
      expect(result!.interactionLayer.classList.contains('interactionLayer')).toBe(true)
      container.remove()
    })

    it('moves existing SVG children into diagramContent', () => {
      const container = makeContainer('<g class="node" data-id="A"><rect/></g>')
      const result = restructureSvgDom(container)
      const nodeInDiagram = result!.diagramContent.querySelector('.node')
      expect(nodeInDiagram).not.toBeNull()
      expect(nodeInDiagram!.getAttribute('data-id')).toBe('A')
      container.remove()
    })

    it('preserves defs at SVG root level', () => {
      const container = makeContainer('')
      const svg = container.querySelector('svg')!
      const defs = document.createElementNS(SVG_NS, 'defs')
      defs.id = 'myDefs'
      svg.appendChild(defs)
      const g = document.createElementNS(SVG_NS, 'g')
      svg.appendChild(g)

      restructureSvgDom(container)

      // defs should still be a direct child of svg, not inside diagramContent
      const svgDefs = svg.querySelector(':scope > defs')
      expect(svgDefs).not.toBeNull()
      container.remove()
    })

    it('assembles correct nesting: svg > panZoomLayer > [diagramContent, interactionLayer]', () => {
      const container = makeContainer()
      const result = restructureSvgDom(container)
      expect(result!.panZoomLayer.parentElement).toBe(result!.svg)
      expect(result!.diagramContent.parentElement).toBe(result!.panZoomLayer)
      expect(result!.interactionLayer.parentElement).toBe(result!.panZoomLayer)
      container.remove()
    })
  })

  // ----- clearInteractionLayer -----

  describe('clearInteractionLayer', () => {
    it('removes all children from the interaction layer', () => {
      const g = document.createElementNS(SVG_NS, 'g') as SVGGElement
      g.appendChild(document.createElementNS(SVG_NS, 'rect'))
      g.appendChild(document.createElementNS(SVG_NS, 'circle'))
      expect(g.childNodes.length).toBe(2)

      clearInteractionLayer(g)
      expect(g.childNodes.length).toBe(0)
    })

    it('does nothing on an empty layer', () => {
      const g = document.createElementNS(SVG_NS, 'g') as SVGGElement
      clearInteractionLayer(g)
      expect(g.childNodes.length).toBe(0)
    })
  })
})
