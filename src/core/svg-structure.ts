/**
 * SVG DOM restructuring module.
 *
 * After Mermaid renders its SVG, we restructure the DOM into the target layout:
 *
 *   <div class="diagram-root">
 *     <svg class="viewport">
 *       <g class="panZoomLayer">
 *         <g class="diagramContent">
 *           <!-- Mermaid-generated SVG content -->
 *         </g>
 *         <g class="interactionLayer">
 *           <!-- selection rectangles, handles, guides -->
 *         </g>
 *       </g>
 *     </svg>
 *   </div>
 *
 * Pan/zoom transforms apply ONLY to panZoomLayer.
 * Interaction visuals are drawn ONLY in interactionLayer.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface SvgStructure {
  svg: SVGSVGElement
  panZoomLayer: SVGGElement
  diagramContent: SVGGElement
  interactionLayer: SVGGElement
}

/**
 * Restructure the Mermaid-generated SVG inside `container` into the target DOM shape.
 *
 * The container must already contain a Mermaid-rendered `<svg>` element.
 * This function moves all children of the `<svg>` into a nested layer structure.
 *
 * @returns References to all key layers, or null if no SVG is found.
 */
export function restructureSvgDom(
  container: HTMLDivElement,
): SvgStructure | null {
  const svg = container.querySelector('svg')
  if (!svg) return null

  // Add class to container and SVG
  container.classList.add('diagram-root')
  svg.classList.add('viewport')

  // Create the layer groups
  const panZoomLayer = document.createElementNS(SVG_NS, 'g')
  panZoomLayer.classList.add('panZoomLayer')

  const diagramContent = document.createElementNS(SVG_NS, 'g')
  diagramContent.classList.add('diagramContent')

  const interactionLayer = document.createElementNS(SVG_NS, 'g')
  interactionLayer.classList.add('interactionLayer')

  // Move all existing SVG children into diagramContent.
  // We collect them first to avoid mutating the live NodeList during iteration.
  const children = Array.from(svg.childNodes)
  for (const child of children) {
    // Preserve <defs> and <style> at SVG root level (they need to stay there
    // for filters/gradients/markers to resolve correctly).
    if (
      child instanceof SVGDefsElement ||
      child instanceof SVGStyleElement ||
      (child instanceof Element && child.tagName.toLowerCase() === 'style')
    ) {
      continue
    }
    diagramContent.appendChild(child)
  }

  // Assemble the layer structure
  panZoomLayer.appendChild(diagramContent)
  panZoomLayer.appendChild(interactionLayer)
  svg.appendChild(panZoomLayer)

  return { svg, panZoomLayer, diagramContent, interactionLayer }
}

/**
 * Clear the interaction layer of all children (selection visuals, handles, etc.).
 */
export function clearInteractionLayer(interactionLayer: SVGGElement): void {
  while (interactionLayer.firstChild) {
    interactionLayer.removeChild(interactionLayer.firstChild)
  }
}
