import mermaid from 'mermaid'

/** Regex patterns to detect known Mermaid diagram types from input text. */
const DIAGRAM_PATTERNS: readonly { pattern: RegExp; type: string }[] = [
  { pattern: /^\s*(?:graph|flowchart)(?:\s+(TD|TB|BT|RL|LR))?/i, type: 'flowchart' },
  { pattern: /^\s*C4Context/i, type: 'c4' },
  { pattern: /^\s*C4Container/i, type: 'c4' },
  { pattern: /^\s*C4Component/i, type: 'c4' },
  { pattern: /^\s*C4Deployment/i, type: 'c4' },
  { pattern: /^\s*C4Dynamic/i, type: 'c4' },
  { pattern: /^\s*sequenceDiagram/i, type: 'sequence' },
  { pattern: /^\s*classDiagram/i, type: 'class' },
  { pattern: /^\s*stateDiagram/i, type: 'state' },
  { pattern: /^\s*erDiagram/i, type: 'er' },
  { pattern: /^\s*gantt/i, type: 'gantt' },
  { pattern: /^\s*pie/i, type: 'pie' },
  { pattern: /^\s*gitGraph/i, type: 'gitgraph' },
  { pattern: /^\s*journey/i, type: 'journey' },
  { pattern: /^\s*mindmap/i, type: 'mindmap' },
  { pattern: /^\s*timeline/i, type: 'timeline' },
  { pattern: /^\s*sankey/i, type: 'sankey' },
  { pattern: /^\s*xychart/i, type: 'xychart' },
  { pattern: /^\s*block/i, type: 'block' },
  { pattern: /^\s*quadrantChart/i, type: 'quadrant' },
  { pattern: /^\s*requirementDiagram/i, type: 'requirement' },
  { pattern: /^\s*packet/i, type: 'packet' },
  { pattern: /^\s*kanban/i, type: 'kanban' },
  { pattern: /^\s*architecture/i, type: 'architecture' },
  { pattern: /^\s*zenuml/i, type: 'zenuml' },
]

let initialized = false

/** Initialize the mermaid library (idempotent) */
export function initMermaid(): void {
  if (initialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    darkMode: true,
    securityLevel: 'strict',
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
    },
    // Colors kept in sync with CSS variables in App.vue (:root)
    themeVariables: {
      background: '#0d0d0d',
      primaryColor: '#1a3a2a',
      primaryTextColor: '#e0e0e0',
      primaryBorderColor: '#00ff88',
      lineColor: '#00ff88',
      secondaryColor: '#1a1a2e',
      tertiaryColor: '#0a0a0a',
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    },
  })
  initialized = true
}

/**
 * Detect the Mermaid diagram type from input text.
 * Returns the detected type name or null if unrecognized.
 */
export function detectDiagramType(input: string): string | null {
  const firstLine = input.trim().split('\n')[0]?.trim() ?? ''
  for (const { pattern, type } of DIAGRAM_PATTERNS) {
    if (pattern.test(firstLine)) {
      return type
    }
  }
  return null
}

/**
 * Render a Mermaid diagram to SVG string.
 * Returns the SVG markup string.
 * Throws if Mermaid fails to parse or render the input.
 */
export async function renderMermaidSvg(
  input: string,
  containerId: string,
): Promise<string> {
  initMermaid()

  const { svg } = await mermaid.render(containerId, input)
  return svg
}

/**
 * CSS selectors for finding draggable node groups in Mermaid-generated SVG.
 * Covers flowchart, C4, sequence, class, state, ER, and architecture diagram elements.
 */
export const NODE_SELECTOR = [
  '.node',
  '.node-group',
  // C4 diagram elements
  '[class*="person"]',
  '[class*="container"]',
  '[class*="component"]',
  '[class*="system"]',
  // Sequence diagram participants & notes
  '.actor',
  '.note',
  // Class diagram
  '.classGroup',
  // State diagram
  '.stateGroup',
  // ER diagram
  '.entity',
  // Architecture diagram
  '[class*="architecture-"]',
].join(', ')

/**
 * CSS selectors for finding container/boundary groups in Mermaid-generated SVG.
 * Flowchart subgraphs: Mermaid wraps them in <g> with class "cluster".
 * C4 boundaries: classes like "boundary" or elements with role attributes.
 */
export const CONTAINER_SELECTOR = '.cluster, [class*="boundary"]'

/**
 * Extract the node ID from a Mermaid SVG node group element.
 * Mermaid sets `id` attribute on node groups (e.g., "flowchart-A-0").
 * Returns the logical node ID or the element's id attribute.
 */
export function extractNodeId(el: SVGElement): string | null {
  // Prefer data-id if present (used by various Mermaid diagram types)
  const dataId = el.getAttribute('data-id')
  if (dataId) return dataId

  const id = el.id
  if (!id) return null

  // Mermaid flowchart: "flowchart-<nodeId>-<index>"
  const flowMatch = id.match(/^flowchart-(.+?)-\d+$/)
  if (flowMatch) return flowMatch[1]!

  return id
}

/**
 * Extract a container ID from a Mermaid SVG container group element.
 *
 * Flowchart subgraph containers typically have id attributes on their <g> group
 * or on nested elements. C4 boundaries may use data-id attributes.
 *
 * Deterministic fallback strategy (when no stable ID is available):
 *   1. Use data-id attribute if present
 *   2. Use id attribute if present (strip common Mermaid prefixes)
 *   3. Use the text content of the container's title/label as a hash key
 *   Never relies on DOM order — uses content-based hashing.
 */
export function extractContainerId(el: SVGElement): string | null {
  const dataId = el.getAttribute('data-id')
  if (dataId) return dataId

  const id = el.id
  if (id) return id

  // Fallback: use the text content of the first text/title element as a
  // deterministic key. This handles cases where Mermaid doesn't set an id.
  const textEl = el.querySelector('text, title')
  if (textEl?.textContent) {
    return `container-${textEl.textContent.trim().replace(/\s+/g, '_')}`
  }

  return null
}
