import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock mermaid before importing the module under test
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

import mermaid from 'mermaid'
import {
  initMermaid,
  detectDiagramType,
  renderMermaidSvg,
  extractNodeId,
  NODE_SELECTOR,
} from '../mermaid-config'

describe('mermaid-config', () => {
  // ----- detectDiagramType -----

  describe('detectDiagramType', () => {
    // Happy Path
    it('detects "graph TD" as flowchart', () => {
      expect(detectDiagramType('graph TD\n  A --> B')).toBe('flowchart')
    })

    it('detects "graph LR" as flowchart', () => {
      expect(detectDiagramType('graph LR\n  A --> B')).toBe('flowchart')
    })

    it('detects bare "flowchart" (no direction) as flowchart', () => {
      expect(detectDiagramType('flowchart\n  A --> B')).toBe('flowchart')
    })

    it('detects "flowchart TD" as flowchart', () => {
      expect(detectDiagramType('flowchart TD\n  A --> B')).toBe('flowchart')
    })

    it('detects "flowchart BT" as flowchart', () => {
      expect(detectDiagramType('flowchart BT\n  A --> B')).toBe('flowchart')
    })

    it('detects "flowchart RL" as flowchart', () => {
      expect(detectDiagramType('flowchart RL\n  A --> B')).toBe('flowchart')
    })

    it('detects C4Context as c4', () => {
      expect(detectDiagramType('C4Context\n  Person(user, "User")')).toBe('c4')
    })

    it('detects C4Container as c4', () => {
      expect(detectDiagramType('C4Container\n  Container(app, "App")')).toBe('c4')
    })

    it('detects C4Component as c4', () => {
      expect(detectDiagramType('C4Component\n  Component(api, "API")')).toBe('c4')
    })

    it('detects C4Deployment as c4', () => {
      expect(detectDiagramType('C4Deployment\n  Deployment_Node(dn, "Node")')).toBe('c4')
    })

    it('detects C4Dynamic as c4', () => {
      expect(detectDiagramType('C4Dynamic\n  Rel(a, b, "calls")')).toBe('c4')
    })

    // Edge Cases
    it('handles leading whitespace', () => {
      expect(detectDiagramType('  graph TD\n  A --> B')).toBe('flowchart')
    })

    it('is case-insensitive', () => {
      expect(detectDiagramType('GRAPH TD\n  A --> B')).toBe('flowchart')
      expect(detectDiagramType('c4context\n  stuff')).toBe('c4')
    })

    // Additional diagram types
    it.each([
      ['sequenceDiagram\n  A->>B: Hello', 'sequence'],
      ['classDiagram\n  A <|-- B', 'class'],
      ['erDiagram\n  A ||--o{ B : has', 'er'],
      ['stateDiagram-v2\n  [*] --> A', 'state'],
      ['gantt\n  title A Gantt', 'gantt'],
      ['pie\n  "A" : 50', 'pie'],
      ['gitGraph\n  commit', 'gitgraph'],
      ['journey\n  title My Journey', 'journey'],
      ['mindmap\n  root((Root))', 'mindmap'],
      ['timeline\n  title History', 'timeline'],
      ['sankey-beta\n  A,B,5', 'sankey'],
      ['xychart-beta\n  x-axis [A, B]', 'xychart'],
      ['block-beta\n  a["A"]', 'block'],
      ['quadrantChart\n  x-axis Low --> High', 'quadrant'],
      ['requirementDiagram\n  requirement r1 {', 'requirement'],
      ['packet-beta\n  0-7: "Src"', 'packet'],
      ['kanban\n  Todo', 'kanban'],
      ['architecture-beta\n  service api', 'architecture'],
      ['zenuml\n  A.method()', 'zenuml'],
    ] as const)('detects "%s" as %s', (input, expected) => {
      expect(detectDiagramType(input)).toBe(expected)
    })

    it('returns null for empty input', () => {
      expect(detectDiagramType('')).toBeNull()
    })

    it('returns null for whitespace-only input', () => {
      expect(detectDiagramType('   \n  \n  ')).toBeNull()
    })
  })

  // ----- extractNodeId -----

  describe('extractNodeId', () => {
    function makeSvgElement(attrs: Record<string, string>): SVGElement {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'id') {
          el.id = value
        } else {
          el.setAttribute(key, value)
        }
      }
      return el
    }

    // Happy Path
    it('returns data-id when present', () => {
      const el = makeSvgElement({ 'data-id': 'myNode' })
      expect(extractNodeId(el)).toBe('myNode')
    })

    it('extracts node ID from flowchart-style id', () => {
      const el = makeSvgElement({ id: 'flowchart-A-0' })
      expect(extractNodeId(el)).toBe('A')
    })

    it('extracts multi-char node ID from flowchart id', () => {
      const el = makeSvgElement({ id: 'flowchart-myNode-12' })
      expect(extractNodeId(el)).toBe('myNode')
    })

    it('returns raw id when format is not flowchart', () => {
      const el = makeSvgElement({ id: 'some-custom-id' })
      expect(extractNodeId(el)).toBe('some-custom-id')
    })

    // Edge Cases
    it('prefers data-id over id', () => {
      const el = makeSvgElement({ 'data-id': 'preferred', id: 'flowchart-other-0' })
      expect(extractNodeId(el)).toBe('preferred')
    })

    it('returns null when no id or data-id is set', () => {
      const el = makeSvgElement({})
      expect(extractNodeId(el)).toBeNull()
    })
  })

  // ----- NODE_SELECTOR -----

  describe('NODE_SELECTOR', () => {
    it('includes .node selector', () => {
      expect(NODE_SELECTOR).toContain('.node')
    })

    it('includes C4-related selectors', () => {
      expect(NODE_SELECTOR).toContain('person')
      expect(NODE_SELECTOR).toContain('container')
      expect(NODE_SELECTOR).toContain('component')
      expect(NODE_SELECTOR).toContain('system')
    })

    it('includes sequence diagram selectors', () => {
      expect(NODE_SELECTOR).toContain('.actor')
      expect(NODE_SELECTOR).toContain('.note')
    })

    it('includes class diagram selector', () => {
      expect(NODE_SELECTOR).toContain('.classGroup')
    })

    it('includes state diagram selector', () => {
      expect(NODE_SELECTOR).toContain('.stateGroup')
    })

    it('includes ER diagram selector', () => {
      expect(NODE_SELECTOR).toContain('.entity')
    })

    it('includes architecture diagram selector', () => {
      expect(NODE_SELECTOR).toContain('architecture-')
    })
  })

  // ----- initMermaid -----

  describe('initMermaid', () => {
    it('calls mermaid.initialize', () => {
      initMermaid()
      expect(mermaid.initialize).toHaveBeenCalled()
    })
  })

  // ----- renderMermaidSvg -----

  describe('renderMermaidSvg', () => {
    beforeEach(() => {
      vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg>rendered</svg>' } as never)
    })

    // Happy Path
    it('renders a flowchart diagram', async () => {
      const svg = await renderMermaidSvg('graph TD\n  A --> B', 'test-id')
      expect(svg).toBe('<svg>rendered</svg>')
      expect(mermaid.render).toHaveBeenCalledWith('test-id', 'graph TD\n  A --> B')
    })

    it('renders a C4 diagram', async () => {
      const svg = await renderMermaidSvg('C4Context\n  Person(user, "User")', 'c4-id')
      expect(svg).toBe('<svg>rendered</svg>')
    })

    it('renders a sequence diagram', async () => {
      const svg = await renderMermaidSvg('sequenceDiagram\n  A->>B: Hello', 'seq-id')
      expect(svg).toBe('<svg>rendered</svg>')
      expect(mermaid.render).toHaveBeenCalledWith('seq-id', 'sequenceDiagram\n  A->>B: Hello')
    })

    it('renders a class diagram', async () => {
      const svg = await renderMermaidSvg('classDiagram\n  A <|-- B', 'class-id')
      expect(svg).toBe('<svg>rendered</svg>')
    })

    it('renders any input Mermaid accepts', async () => {
      const svg = await renderMermaidSvg('pie\n  "A" : 50', 'pie-id')
      expect(svg).toBe('<svg>rendered</svg>')
    })

    // Error Scenarios
    it('propagates mermaid render errors', async () => {
      vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('Parse error'))
      await expect(
        renderMermaidSvg('not valid mermaid', 'bad-id'),
      ).rejects.toThrow('Parse error')
    })
  })
})
