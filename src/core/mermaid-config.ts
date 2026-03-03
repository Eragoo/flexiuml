import mermaid from 'mermaid'

/** Diagram types we support (restrict to flowchart + C4) */
const SUPPORTED_DIAGRAM_PATTERNS = [
  /^\s*(?:graph|flowchart)(?:\s+(TD|TB|BT|RL|LR))?/im,
  /^\s*C4Context/im,
  /^\s*C4Container/im,
  /^\s*C4Component/im,
  /^\s*C4Deployment/im,
  /^\s*C4Dynamic/im,
]

let initialized = false

/** Initialize the mermaid library (idempotent) */
export function initMermaid(): void {
  if (initialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
    },
  })
  initialized = true
}

/**
 * Check whether the input text is a supported diagram type.
 * Returns the detected type name or null if unsupported.
 */
export function detectDiagramType(input: string): string | null {
  const firstLine = input.trim().split('\n')[0]?.trim() ?? ''
  for (const pattern of SUPPORTED_DIAGRAM_PATTERNS) {
    if (pattern.test(firstLine)) {
      if (/^C4/i.test(firstLine)) return 'c4'
      return 'flowchart'
    }
  }
  return null
}

/**
 * Render a Mermaid diagram to SVG string.
 * Returns the SVG markup string.
 * Throws if the diagram type is unsupported or Mermaid fails.
 */
export async function renderMermaidSvg(
  input: string,
  containerId: string,
): Promise<string> {
  initMermaid()

  const diagramType = detectDiagramType(input)
  if (!diagramType) {
    throw new Error(
      `Unsupported diagram type. Only flowchart and C4 diagrams are supported.`,
    )
  }

  const { svg } = await mermaid.render(containerId, input)
  return svg
}

/**
 * CSS selectors for finding draggable node groups in Mermaid-generated SVG.
 * Mermaid wraps each node in a <g> with class "node" (flowchart)
 * or specific C4 classes.
 */
export const NODE_SELECTOR = '.node, .node-group, [class*="person"], [class*="container"], [class*="component"], [class*="system"]'

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
  // Mermaid flowchart nodes have id like "flowchart-A-0" or data-id
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
