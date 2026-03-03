/**
 * Persistence module.
 *
 * Handles export/import/reset of LayoutMap, plus localStorage auto-save.
 */

import type { LayoutMap } from '../core/layout-map'
import { createEmptyLayout, serializeLayout, deserializeLayout } from '../core/layout-map'

const LOCAL_STORAGE_KEY = 'fleximaid-layout'

/**
 * Export the current layout as a downloadable JSON file.
 */
export function exportLayout(layout: LayoutMap): void {
  const json = serializeLayout(layout)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = 'fleximaid-layout.json'
  a.click()

  URL.revokeObjectURL(url)
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
