import type { LayoutMap } from '../core/layout-map'

export interface UndoHistory {
  past: LayoutMap[]
  present: LayoutMap
  future: LayoutMap[]
}

export const DEFAULT_MAX_HISTORY = 50

/**
 * Create a fresh history with the given initial state.
 */
export function createHistory(initial: LayoutMap): UndoHistory {
  return { past: [], present: initial, future: [] }
}

/**
 * Push a new layout state onto the history.
 * - Clears the future (redo) stack (new branch).
 * - Skips if the new state is identical to the current present.
 * - Caps the past stack at DEFAULT_MAX_HISTORY, dropping oldest entries.
 */
export function pushState(history: UndoHistory, layout: LayoutMap): UndoHistory {
  // Skip if identical to current present (cheap deep-equal via JSON)
  if (layoutsEqual(history.present, layout)) return history

  const past = [...history.past, history.present]
  // Cap at max size — drop oldest
  if (past.length > DEFAULT_MAX_HISTORY) {
    past.splice(0, past.length - DEFAULT_MAX_HISTORY)
  }

  return { past, present: layout, future: [] }
}

/**
 * Undo: move present to future, restore most recent past entry as present.
 * Returns unchanged history if there is nothing to undo.
 */
export function undo(history: UndoHistory): UndoHistory {
  if (history.past.length === 0) return history

  const past = history.past.slice(0, -1)
  const present = history.past[history.past.length - 1]!
  const future = [history.present, ...history.future]

  return { past, present, future }
}

/**
 * Redo: move present to past, restore most recent future entry as present.
 * Returns unchanged history if there is nothing to redo.
 */
export function redo(history: UndoHistory): UndoHistory {
  if (history.future.length === 0) return history

  const past = [...history.past, history.present]
  const present = history.future[0]!
  const future = history.future.slice(1)

  return { past, present, future }
}

export function canUndo(history: UndoHistory): boolean {
  return history.past.length > 0
}

export function canRedo(history: UndoHistory): boolean {
  return history.future.length > 0
}

// ── Internal helpers ────────────────────────────────────────────────────────

function layoutsEqual(a: LayoutMap, b: LayoutMap): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
