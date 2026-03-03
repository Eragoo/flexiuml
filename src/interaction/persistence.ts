/**
 * Persistence module.
 *
 * Handles export/import/reset of LayoutMap, plus localStorage auto-save.
 */

import type { LayoutMap } from '../core/layout-map'
import { createEmptyLayout, serializeLayout, deserializeLayout } from '../core/layout-map'

const LOCAL_STORAGE_KEY = 'fleximaid-layout'

// ── Internal helpers ────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Export / Import ─────────────────────────────────────────────────────────

/**
 * Export the current layout as a downloadable JSON file.
 */
export function exportLayout(layout: LayoutMap): void {
  const json = serializeLayout(layout)
  const blob = new Blob([json], { type: 'application/json' })
  triggerDownload(blob, 'fleximaid-layout.json')
}

/**
 * Export the current SVG diagram as a downloadable .svg file.
 *
 * Clones the SVG element, ensures the xmlns attribute is present,
 * and triggers a download.
 */
export function exportSvg(svg: SVGSVGElement): void {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // Ensure the xmlns attribute is set (required for standalone SVG files)
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  const serializer = new XMLSerializer()
  const svgString = serializer.serializeToString(clone)
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  triggerDownload(blob, 'fleximaid-diagram.svg')
}

/**
 * Import a layout from a JSON file.
 *
 * @param file - The File object from a file input
 * @returns The parsed LayoutMap
 * @throws If the file is invalid JSON or doesn't match the LayoutMap schema
 */
export async function importLayout(file: File): Promise<LayoutMap> {
  const text = await file.text()
  return deserializeLayout(text)
}

/**
 * Reset the layout to an empty state.
 */
export function resetLayout(): LayoutMap {
  localStorage.removeItem(LOCAL_STORAGE_KEY)
  return createEmptyLayout()
}

/**
 * Save a layout to localStorage.
 */
export function saveToLocalStorage(layout: LayoutMap, key: string = LOCAL_STORAGE_KEY): void {
  try {
    const json = serializeLayout(layout)
    localStorage.setItem(key, json)
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

/**
 * Load a layout from localStorage.
 *
 * @returns The parsed LayoutMap, or null if nothing is saved or the data is invalid.
 */
export function loadFromLocalStorage(key: string = LOCAL_STORAGE_KEY): LayoutMap | null {
  try {
    const json = localStorage.getItem(key)
    if (!json) return null
    return deserializeLayout(json)
  } catch {
    return null
  }
}
