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
