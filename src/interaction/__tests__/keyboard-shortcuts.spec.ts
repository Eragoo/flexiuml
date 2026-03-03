import { describe, it, expect } from 'vitest'
import { SHORTCUTS } from '../keyboard-shortcuts'
import type { ShortcutEntry } from '../keyboard-shortcuts'

describe('keyboard-shortcuts', () => {
  // ── Happy Path ──────────────────────────────────────────────────────────

  it('exports a non-empty array of shortcuts', () => {
    expect(Array.isArray(SHORTCUTS)).toBe(true)
    expect(SHORTCUTS.length).toBeGreaterThan(0)
  })

  it('each entry has non-empty keys and description', () => {
    for (const entry of SHORTCUTS) {
      expect(entry.keys.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('contains an undo shortcut', () => {
    const undo = SHORTCUTS.find((s: ShortcutEntry) =>
      s.description.toLowerCase().includes('undo'),
    )
    expect(undo).toBeDefined()
  })

  it('contains a redo shortcut', () => {
    const redo = SHORTCUTS.find((s: ShortcutEntry) =>
      s.description.toLowerCase().includes('redo'),
    )
    expect(redo).toBeDefined()
  })

  it('contains a pan shortcut', () => {
    const pan = SHORTCUTS.find((s: ShortcutEntry) =>
      s.description.toLowerCase().includes('pan'),
    )
    expect(pan).toBeDefined()
  })

  it('contains a zoom shortcut', () => {
    const zoom = SHORTCUTS.find((s: ShortcutEntry) =>
      s.description.toLowerCase().includes('zoom'),
    )
    expect(zoom).toBeDefined()
  })

  it('contains a select shortcut', () => {
    const select = SHORTCUTS.find((s: ShortcutEntry) =>
      s.description.toLowerCase().includes('select'),
    )
    expect(select).toBeDefined()
  })

  it('contains an escape/deselect shortcut', () => {
    const esc = SHORTCUTS.find(
      (s: ShortcutEntry) =>
        s.keys.toLowerCase().includes('esc') ||
        s.description.toLowerCase().includes('deselect'),
    )
    expect(esc).toBeDefined()
  })

  it('contains a toggle shortcuts overlay shortcut', () => {
    const toggle = SHORTCUTS.find((s: ShortcutEntry) =>
      s.keys.includes('?'),
    )
    expect(toggle).toBeDefined()
  })
})
